// The audit record every Coupa ingestion attempt leaves behind, success or not.
//
// This exists for two readers at once, which is why the codes live in one file
// rather than inline at the insert:
//
//   1. A human on the Global PO page asking "where did this PO come from, and
//      which name did it match?"
//   2. `get_coupa_ingestion_report`, which counts these rows for the Executive
//      dashboard's processed/failed card.
//
// The second is the reason the strings are typed constants. The RPC groups on
// `metadata->>'reason'`, so a typo in a reason string here would not fail
// anything -- it would quietly file that failure under a category nobody reads.
//
// Pure and Deno-free so vitest can cover it; the insert lives in the function.

import type { CoupaPo } from './coupa-po.ts'

/**
 * `audit_logs.performed_by` is NOT NULL and ingestion has no authenticated
 * user, so the all-zeros uuid stands in for "the system did this".
 *
 * This is not a new invention: `audit_table_changes()` and the phase-5 policy
 * trigger already record `COALESCE(auth.uid(), '00000000-...')` for exactly the
 * same reason (a service-role or migration write). Reusing the sentinel keeps
 * every automated write attributable to one actor a reader already recognises.
 */
export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000'

/** Audited as a purchase order, so a PO's history is one query by entity_id. */
export const COUPA_AUDIT_ENTITY_TYPE = 'purchase_order'

export const COUPA_INGESTED_ACTION = 'COUPA_PO_INGESTED'
export const COUPA_INGEST_FAILED_ACTION = 'COUPA_PO_INGEST_FAILED'

/**
 * Why an attempt produced no purchase order. Grouped by the dashboard, so these
 * are a closed set: each one is a different thing for a human to go and do.
 */
export type CoupaFailureReason =
  /** The parser could not read the email -- usually a Coupa template change. */
  | 'unreadable_email'
  /** A line's item code matches no `inventory_items.sku`. */
  | 'unknown_item_codes'
  /** The named person is not an active customer, or the name is ambiguous. */
  | 'unknown_customer'
  /** `po_number` already exists -- a revision or a replay. */
  | 'already_recorded'
  /** Anything that threw. Always worth a look; never routine. */
  | 'unexpected_error'

/** An `audit_logs` row, shaped for a direct insert. */
export interface CoupaAuditRow {
  readonly action: string
  readonly entity_type: string
  /** The created PO, or null when the attempt never got that far. */
  readonly entity_id: string | null
  readonly performed_by: string
  readonly metadata: Record<string, unknown>
}

export interface IngestAuditInput {
  /** Set only on success. */
  readonly purchaseOrderId?: string | null
  /** Whatever was parsed before the failure. Null when parsing itself failed. */
  readonly po?: CoupaPo | null
  readonly emailSubject?: string
  /** Which email field the customer matched on. Success only. */
  readonly matchedOn?: 'On Behalf Of' | 'Submitted By'
  readonly receiverId?: string
  readonly reason?: CoupaFailureReason
  /** The technical detail -- parser error, RPC message, exception text. */
  readonly details?: string
  readonly unknownCodes?: readonly string[]
}

/**
 * Caps a free-text detail before it reaches `metadata`.
 *
 * These strings are third-party (a parser error quoting an email line, a
 * Postgres message). Nothing else bounds them, and audit_logs is append-only --
 * an unbounded string here is a row that can never be trimmed back.
 */
function truncate(value: string, max = 500): string {
  return value.length > max ? `${value.slice(0, max)}...` : value
}

/**
 * Builds the row for an attempt that became a purchase order.
 *
 * `matchedOn` is the point of the whole record: "On Behalf Of" and "Submitted
 * By" are usually the same person, so the day they differ is the day someone
 * needs to know which one this PO was filed under.
 */
export function buildIngestedAuditRow(input: IngestAuditInput & { purchaseOrderId: string; po: CoupaPo }): CoupaAuditRow {
  return {
    action: COUPA_INGESTED_ACTION,
    entity_type: COUPA_AUDIT_ENTITY_TYPE,
    entity_id: input.purchaseOrderId,
    performed_by: SYSTEM_ACTOR_ID,
    metadata: {
      source: 'coupa_email',
      po_number: input.po.poNumber,
      po_value: input.po.total,
      currency: input.po.currency,
      lines_count: input.po.lines.length,
      receiver_id: input.receiverId ?? null,
      // The provenance of the customer choice, which `purchase_orders.details`
      // states only as prose an edit can overwrite.
      matched_on: input.matchedOn ?? null,
      on_behalf_of: input.po.onBehalfOf,
      submitted_by: input.po.submittedBy,
      email_subject: input.emailSubject ?? null,
    },
  }
}

/**
 * Builds the row for an attempt that produced no purchase order.
 *
 * Deliberately does NOT carry the email body: it is unbounded, it is the one
 * copy of the order's contents that support already receives by email, and
 * audit_logs is readable by every holder of `orders.audit.view`.
 */
export function buildIngestFailedAuditRow(input: IngestAuditInput & { reason: CoupaFailureReason }): CoupaAuditRow {
  return {
    action: COUPA_INGEST_FAILED_ACTION,
    entity_type: COUPA_AUDIT_ENTITY_TYPE,
    // No PO exists to point at. `entity_id` has been nullable since
    // 20260716140000, and readers filter by (entity_type, entity_id), which
    // NULL simply never matches -- so these rows surface in the report and the
    // per-PO timeline stays clean.
    entity_id: null,
    performed_by: SYSTEM_ACTOR_ID,
    metadata: {
      source: 'coupa_email',
      reason: input.reason,
      details: input.details ? truncate(input.details) : null,
      po_number: input.po?.poNumber ?? null,
      on_behalf_of: input.po?.onBehalfOf ?? null,
      submitted_by: input.po?.submittedBy ?? null,
      unknown_codes: input.unknownCodes?.length ? [...input.unknownCodes] : null,
      email_subject: input.emailSubject ?? null,
    },
  }
}
