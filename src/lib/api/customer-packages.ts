import { supabase } from '@/lib/supabase'
import type { PackageStatus } from '@/lib/status'

export interface CustomerPackageItem {
  description: string
  quantity: number
}

/** A package row as exposed to customers through the `customer_packages` view. */
export interface CustomerPackage {
  id: string
  reference: string
  po_number: string | null
  status: PackageStatus
  customer_notes: string | null
  created_at: string
  updated_at: string | null
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
