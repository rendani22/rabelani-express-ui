import { supabase } from '@/lib/supabase'
import { loadDeletedPackages, loadPackages } from '@/lib/api/packages'
import { PACKAGE_STATUS } from '@/lib/status'
import type { Package } from '@/lib/models/package'

export interface OrdersQuery {
  page: number
  pageSize: number
  status?: string
  search?: string
}

export interface OrdersResult {
  packages: Package[]
  total: number
  /** receiver email → display name, resolved from receiver_profiles */
  names: Record<string, string>
}

/** Resolve receiver display names for a set of emails (from receiver_profiles). */
async function fetchReceiverNames(emails: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(emails.filter(Boolean)))
  if (!unique.length) return {}
  const { data } = await supabase
    .from('receiver_profiles')
    .select('email, name, surname')
    .in('email', unique)
  const map: Record<string, string> = {}
  for (const r of (data ?? []) as { email: string; name?: string; surname?: string }[]) {
    const full = [r.name, r.surname].filter(Boolean).join(' ').trim()
    if (r.email && full) map[r.email.toLowerCase()] = full
  }
  return map
}

/** Collected + delivered packages, optionally within an updated-at date range. */
export async function fetchCompletedOrders(range?: {
  dateFrom?: string
  dateTo?: string
}): Promise<OrdersResult> {
  let query = supabase
    .from('packages')
    .select('*, items:package_items(id, quantity, description, inventory_item_id)')
    .is('deleted_at', null)
    .in('status', [PACKAGE_STATUS.COLLECTED, PACKAGE_STATUS.DELIVERED])
    .order('created_at', { ascending: false })
    .limit(1000)

  if (range?.dateFrom) query = query.gte('created_at', range.dateFrom)
  if (range?.dateTo) query = query.lte('created_at', range.dateTo)

  const { data, error } = await query
  if (error) throw new Error(error.message)
  const packages = (data ?? []) as Package[]
  const names = await fetchReceiverNames(packages.map((p) => p.receiver_email))
  return { packages, total: packages.length, names }
}

/** All packages for a given receiver email (their package history). */
export async function fetchPackagesByReceiver(email: string): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*, items:package_items(id, quantity, description, inventory_item_id)')
    .eq('receiver_email', email)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as Package[]
}

/** Soft-deleted packages (admin-only view). */
export async function fetchDeletedOrders(): Promise<OrdersResult> {
  const result = await loadDeletedPackages()
  if (!result.success) throw new Error(result.error)
  const packages = [...result.data]
  const names = await fetchReceiverNames(packages.map((p) => p.receiver_email))
  return { packages, total: packages.length, names }
}

export async function fetchOrders(q: OrdersQuery): Promise<OrdersResult> {
  const result = await loadPackages({
    page: q.page,
    pageSize: q.pageSize,
    ...(q.status && q.status !== 'all' ? { status: q.status } : {}),
    ...(q.search ? { search: q.search } : {}),
  })
  if (!result.success) throw new Error(result.error)

  const packages = [...result.data]
  const names = await fetchReceiverNames(packages.map((p) => p.receiver_email))
  return { packages, total: result.count ?? packages.length, names }
}
