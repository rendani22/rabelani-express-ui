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
   *  they may reschedule it (a buyer viewing a colleague's parcel is false). */
  is_receiver: boolean
  items: CustomerPackageItem[]
}

/**
 * The logged-in customer's packages. RLS on the `customer_packages` view scopes
 * these: Buyers see their whole company; Runners see only their own.
 */
export async function fetchMyPackages(): Promise<CustomerPackage[]> {
  const { data, error } = await supabase
    .from('customer_packages')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as CustomerPackage[]
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
