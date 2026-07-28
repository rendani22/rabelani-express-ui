/**
 * Orders → CSV export.
 *
 * Turns a page of packages (plus the resolved receiver-name map the orders list
 * already carries) into a flat, spreadsheet-friendly row set. Kept as a pure
 * helper — no React, no Supabase — so it can be unit-tested and reused; the
 * page owns fetching and the actual download.
 */
import { toCsv } from '@/lib/csv'
import { displayStatusMeta } from '@/lib/status'
import { nameFromEmail, parseNotes } from '@/lib/format'
import type { Package } from '@/lib/models/package'

/** One exported row per package. Every value is a primitive so it CSV-escapes cleanly. */
export interface OrderExportRow {
  // Index signature keeps the shape assignable to `toCsv`'s row constraint.
  [key: string]: string | number
  reference: string
  po_number: string
  status: string
  status_label: string
  receiver_name: string
  receiver_email: string
  item_count: number
  items: string
  reschedule_requested: string
  notes: string
  customer_notes: string
  created_at: string
  updated_at: string
}

/** Header order for the exported CSV — also the set of keys emitted. */
export const ORDER_EXPORT_COLUMNS: ReadonlyArray<keyof OrderExportRow & string> = [
  'reference',
  'po_number',
  'status',
  'status_label',
  'receiver_name',
  'receiver_email',
  'item_count',
  'items',
  'reschedule_requested',
  'notes',
  'customer_notes',
  'created_at',
  'updated_at',
]

/**
 * Flatten one package into an export row.
 *
 * `names` is the same email → display-name map the orders list resolves from
 * `receiver_profiles`; we fall back to a name derived from the email when a
 * profile has none. `status_label` carries the delivered/collected display
 * distinction (see `displayStatusMeta`), while `status` keeps the raw enum.
 * Internal `notes` are stripped of the delivery-photo URL blob so the cell
 * reads as plain text.
 */
export function toOrderExportRow(
  pkg: Package,
  names: Record<string, string>,
): OrderExportRow {
  const email = pkg.receiver_email ?? ''
  return {
    reference: pkg.reference,
    po_number: pkg.po_number ?? '',
    status: pkg.status,
    status_label: displayStatusMeta(pkg).label,
    receiver_name: names[email.toLowerCase()] || nameFromEmail(email),
    receiver_email: email,
    item_count: pkg.items?.length ?? 0,
    items: (pkg.items ?? []).map((i) => `${i.quantity}× ${i.description}`).join('; '),
    reschedule_requested: pkg.reschedule_requested ? 'yes' : 'no',
    notes: parseNotes(pkg.notes).text,
    customer_notes: pkg.customer_notes ?? '',
    created_at: pkg.created_at,
    updated_at: pkg.updated_at ?? '',
  }
}

/** Build the full orders CSV string for a set of packages. */
export function ordersToCsv(
  packages: readonly Package[],
  names: Record<string, string>,
): string {
  return toCsv(
    packages.map((pkg) => toOrderExportRow(pkg, names)),
    ORDER_EXPORT_COLUMNS,
  )
}
