/**
 * The Coupa ingestion dead-letter queue: emails Exxaro sent that never became a
 * Global PO.
 *
 * Every row here is a real purchase order this system does not have. The queue
 * exists so that fact is visible and actionable rather than living only in
 * support's inbox.
 *
 * Reads are direct Supabase queries (RLS gates them on
 * `purchase_orders.ingest.retry`); the retry itself goes through an edge
 * function, because replaying an email means re-running ingestion, which needs
 * the shared secret the browser must never hold.
 */
import { supabase } from '@/lib/supabase'

export type CoupaFailureStatus = 'pending' | 'resolved' | 'ignored'

export interface CoupaFailure {
  id: string
  fromAddress: string | null
  subject: string | null
  /** The original email. Shown on demand — it is a raw third-party document. */
  body: string
  /** Reason code from `_shared/coupa-audit.ts`. */
  reason: string
  label: string
  details: string | null
  poNumber: string | null
  onBehalfOf: string | null
  submittedBy: string | null
  unknownCodes: string[]
  status: CoupaFailureStatus
  retryCount: number
  lastRetryAt: Date | null
  /** Why the most recent retry failed. Null until one has. */
  lastError: string | null
  purchaseOrderId: string | null
  createdAt: Date
  resolvedAt: Date | null
}

/**
 * Labels for the closed reason set. Mirrors the map in `executive-dashboard.ts`
 * — an edge function cannot import from `src/`, so the codes cross the boundary
 * as data and the labels live wherever they are rendered. Unknown codes
 * humanise rather than render blank.
 */
const REASON_LABELS: Record<string, string> = {
  unreadable_email: 'Email could not be read',
  unknown_item_codes: 'Item code not in inventory',
  unknown_customer: 'Customer not identified',
  already_recorded: 'Already recorded',
  unexpected_error: 'Unexpected error',
}

/** What a human should do about each reason. The queue is a worklist. */
const REASON_ACTIONS: Record<string, string> = {
  unreadable_email:
    'Coupa has probably changed its email template — the parser needs updating. Key this PO in by hand.',
  unknown_item_codes:
    'Add an inventory item for each missing code, with the Coupa code as its SKU, then retry.',
  unknown_customer:
    'Add the customer, or check they are active and that their name and surname together match the name on the email exactly. Then retry.',
  already_recorded:
    'This PO number already exists — Coupa re-sends an order when it is revised. Compare the email against the existing PO and apply changes by hand. Retrying will not help.',
  unexpected_error: 'Something broke. Check the error below, then retry once it is fixed.',
}

export function coupaFailureLabel(reason: string): string {
  return REASON_LABELS[reason] ?? reason.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase())
}

export function coupaFailureAction(reason: string): string | null {
  return REASON_ACTIONS[reason] ?? null
}

/** True when replaying could plausibly work — `already_recorded` never can. */
export function isRetryable(failure: CoupaFailure): boolean {
  return failure.status === 'pending' && failure.reason !== 'already_recorded'
}

interface FailureRow {
  id: string
  from_address: string | null
  subject: string | null
  body: string
  reason: string
  details: string | null
  po_number: string | null
  on_behalf_of: string | null
  submitted_by: string | null
  unknown_codes: string[] | null
  status: CoupaFailureStatus
  retry_count: number
  last_retry_at: string | null
  last_error: string | null
  purchase_order_id: string | null
  created_at: string
  resolved_at: string | null
}

function toFailure(row: FailureRow): CoupaFailure {
  return {
    id: row.id,
    fromAddress: row.from_address,
    subject: row.subject,
    body: row.body,
    reason: row.reason,
    label: coupaFailureLabel(row.reason),
    details: row.details,
    poNumber: row.po_number,
    onBehalfOf: row.on_behalf_of,
    submittedBy: row.submitted_by,
    unknownCodes: row.unknown_codes ?? [],
    status: row.status,
    retryCount: row.retry_count,
    lastRetryAt: row.last_retry_at ? new Date(row.last_retry_at) : null,
    lastError: row.last_error,
    purchaseOrderId: row.purchase_order_id,
    createdAt: new Date(row.created_at),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
  }
}

/**
 * Loads the queue, newest first.
 *
 * Returns [] rather than throwing when the table is absent, so the page ships
 * before its migration is deployed — the same degradation the dashboard cards
 * use.
 */
export async function loadCoupaFailures(status?: CoupaFailureStatus): Promise<CoupaFailure[]> {
  let query = supabase
    .from('coupa_ingestion_failures')
    .select(
      'id, from_address, subject, body, reason, details, po_number, on_behalf_of, submitted_by, unknown_codes, status, retry_count, last_retry_at, last_error, purchase_order_id, created_at, resolved_at',
    )
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) {
    // 42P01 = undefined_table. Anything else is a real failure worth surfacing.
    if (error.code === '42P01') return []
    throw new Error(error.message)
  }
  return ((data ?? []) as FailureRow[]).map(toFailure)
}

export type RetryResult =
  | { success: true; purchaseOrderId: string | null; poNumber: string | null }
  /** The replay ran and was rejected again — `details` says why this time. */
  | { success: false; details: string }

/** Replays one queued email through ingestion. */
export async function retryCoupaFailure(failureId: string): Promise<RetryResult> {
  const { data, error } = await supabase.functions.invoke('retry-coupa-po', {
    body: { failureId },
  })
  if (error) throw new Error(error.message)

  const result = data as {
    success?: boolean
    purchase_order_id?: string | null
    po_number?: string | null
    details?: string
    error?: string
  }

  if (result?.success) {
    return { success: true, purchaseOrderId: result.purchase_order_id ?? null, poNumber: result.po_number ?? null }
  }
  return { success: false, details: result?.details ?? result?.error ?? 'The retry did not go through.' }
}

/**
 * Takes a row off the queue without ingesting it — for a test, or an order
 * handled by hand.
 *
 * Deliberately not a delete: the email still arrived and still failed, and the
 * audit trail says so. This only says a human has dealt with it.
 */
export async function setCoupaFailureStatus(
  failureId: string,
  status: Extract<CoupaFailureStatus, 'resolved' | 'ignored'>,
): Promise<void> {
  const { error } = await supabase
    .from('coupa_ingestion_failures')
    .update({ status, resolved_at: new Date().toISOString() })
    .eq('id', failureId)
  if (error) throw new Error(error.message)
}
