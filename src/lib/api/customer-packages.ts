import { supabase } from '@/lib/supabase'
import type { PackageStatus } from '@/lib/status'

export interface CustomerPackageItem {
  description: string
  quantity: number
}

/**
 * A package row as exposed to customers through the `customer_packages` view.
 * The internal `reference` is intentionally absent — customers identify orders
 * by PO number. `id` is an opaque key only.
 */
export interface CustomerPackage {
  id: string
  po_number: string | null
  status: PackageStatus
  customer_notes: string | null
  created_at: string
  updated_at: string | null
  /** True once a reschedule has been requested (persists; never clears). */
  reschedule_requested: boolean
  /** True when the signed-in account is this parcel's actual receiver — only
   *  they may reschedule it (a buyer viewing an end user's parcel is false). */
  is_receiver: boolean
  /** Who the parcel is for. A buyer needs this to tell their end users apart. */
  receiver_name: string | null
  items: CustomerPackageItem[]
}

/** A PO grouping (po set) or a standalone package (po null → keyed by id). */
export interface CustomerPackageGroup {
  key: string
  po: string | null
  packages: CustomerPackage[]
}

/** How many PO groups one scroll page loads. */
export const CUSTOMER_PAGE_SIZE = 10

export interface CustomerPackagesPageQuery {
  offset: number
  /** Substring match on PO number. Blank means no search. */
  query?: string
  /** Exact status match. Null/undefined means every status. */
  status?: PackageStatus | null
}

/**
 * One page of the logged-in customer's PO groups, newest group first. The
 * `customer_packages` view scopes these: an End user sees only their own; a
 * Buyer sees their own plus those of the end users assigned to them.
 *
 * Pagination, search, status filtering and PO grouping all happen in the
 * `customer_package_groups` RPC. The page unit is the group, not the package,
 * so a PO never splits across two pages.
 */
export async function fetchMyPackageGroups({
  offset,
  query,
  status,
}: CustomerPackagesPageQuery): Promise<CustomerPackageGroup[]> {
  const { data, error } = await supabase.rpc('customer_package_groups', {
    p_limit: CUSTOMER_PAGE_SIZE,
    p_offset: offset,
    p_query: query?.trim() || null,
    p_status: status ?? null,
  })
  if (error) throw error
  return (data ?? []) as CustomerPackageGroup[]
}

/**
 * Package counts per status within the current search scope, for the filter
 * chips. Not status-filtered: a chip must still show how many orders sit under
 * every other status.
 */
export async function fetchMyPackageStatusCounts(
  query?: string,
): Promise<Map<PackageStatus, number>> {
  const { data, error } = await supabase.rpc('customer_package_status_counts', {
    p_query: query?.trim() || null,
  })
  if (error) throw error
  const rows = (data ?? []) as { status: PackageStatus; count: number }[]
  return new Map(rows.map((r) => [r.status, Number(r.count)]))
}

/**
 * Whether this customer has any orders at all, ignoring search and filters.
 * Distinguishes "you have no orders yet" from "nothing matches that search",
 * which the status counts cannot do once a search is active.
 */
export async function fetchMyPackagesTotal(): Promise<number> {
  const { count, error } = await supabase
    .from('customer_packages')
    .select('id', { count: 'exact', head: true })
  if (error) throw error
  return count ?? 0
}

/**
 * Request a delivery reschedule for an in-transit parcel. Routes through the
 * `customer_reschedule_package` RPC, which verifies the caller is the parcel's
 * receiver and it is still out for delivery, then flips it back to `notified`,
 * clears the driver, and records the reason for the warehouse.
 */
export async function rescheduleDelivery(packageId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('customer_reschedule_package', {
    p_package_id: packageId,
    p_reason: reason,
  })
  if (error) throw error
}
