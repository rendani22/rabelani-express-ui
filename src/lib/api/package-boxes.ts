/**
 * Package boxes — the physical boxes an order is packed into.
 *
 * Reads go straight to the tables (RLS: orders.read). Writes go through the
 * save_package_box / delete_package_box RPCs (orders.pack), which also enforce
 * the packable statuses and that boxes never hold more than the order has —
 * see migration 20260929120000_package_boxes.sql. RPC errors carry a
 * user-facing message, so they are thrown as-is for `reportError` to surface.
 */
import { supabase } from '@/lib/supabase'
import type { BoxContentLine, PackageBox } from '@/lib/box-label'

interface PackageBoxRow {
  id: string
  package_id: string
  box_number: number
  packed_at: string
  items: BoxContentLine[] | null
}

export async function listPackageBoxes(packageId: string): Promise<PackageBox[]> {
  const { data, error } = await supabase
    .from('package_boxes')
    .select('id, package_id, box_number, packed_at, items:package_box_items(package_item_id, quantity)')
    .eq('package_id', packageId)
    .order('box_number', { ascending: true })
  if (error) throw error
  return ((data ?? []) as unknown as PackageBoxRow[]).map((r) => ({ ...r, items: r.items ?? [] }))
}

/** Delivery location name for the label, or null when the order has none. */
export async function getPackageLocationName(packageId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('packages')
    .select('delivery_location:delivery_locations(name)')
    .eq('id', packageId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as unknown as { delivery_location: { name: string } | null }
  return row.delivery_location?.name ?? null
}

/**
 * Create a box (`boxId` omitted) or replace a box's contents. `lines` is the
 * box's complete contents; zero-quantity lines are dropped server-side.
 */
export async function savePackageBox(
  packageId: string,
  lines: readonly BoxContentLine[],
  boxId?: string,
): Promise<string> {
  const { data, error } = await supabase.rpc('save_package_box', {
    p_package_id: packageId,
    p_items: lines,
    p_box_id: boxId ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function deletePackageBox(boxId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_package_box', { p_box_id: boxId })
  if (error) throw new Error(error.message)
}
