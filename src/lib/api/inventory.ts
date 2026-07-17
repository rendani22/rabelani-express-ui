import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

// ============================================================================
// Types (ported from core/models/inventory.models.ts)
// ============================================================================

/** Inventory item as returned from the `inventory_items` table. */
export interface InventoryItem {
  id: string
  name: string
  /** The Coupa item code. Inbound PO emails resolve their lines through this. */
  sku: string
  description: string | null
  category: string | null
  unit: string
  quantity: number
  low_stock_threshold: number
  unit_price: number | null
  is_active: boolean
  created_at: string
  updated_at: string
}

/** Payload for creating a new inventory item. */
export interface CreateInventoryItemDto {
  name: string
  sku: string
  description?: string | null
  category?: string | null
  unit?: string
  quantity?: number
  low_stock_threshold?: number
  unit_price?: number | null
}

/** Payload for updating an existing inventory item. */
export interface UpdateInventoryItemDto {
  name?: string
  sku?: string
  description?: string | null
  category?: string | null
  unit?: string
  quantity?: number
  low_stock_threshold?: number
  unit_price?: number | null
  is_active?: boolean
}

/** Filters for querying inventory items. */
export interface InventoryFilters {
  search?: string
  category?: string
  showLowStock?: boolean
  showOutOfStock?: boolean
  showInactive?: boolean
}

/** Aggregated analytics for the inventory page header. */
export interface InventoryStats {
  totalItems: number
  activeItems: number
  totalStock: number
  lowStockCount: number
  outOfStockCount: number
  /** Active items with quantity > 0 whose stock count hasn't changed in 2+ months. */
  staleStockCount: number
  totalValue: number
  categories: string[]
}

export type InventoryMovementSource =
  | 'initial'
  | 'manual_edit'
  | 'package_deduct'
  | 'package_backorder'
  | 'restock'

/** A single stock quantity change (`inventory_movements` table). */
export interface InventoryMovement {
  id: string
  item_id: string
  user_id: string | null
  delta: number
  quantity_before: number
  quantity_after: number
  source: InventoryMovementSource
  reference: string | null
  note: string | null
  created_at: string
}

/** A movement with the parent item embedded — used by the "Recent Movements" view. */
export interface RecentMovement extends InventoryMovement {
  item: {
    name: string
    sku: string | null
    unit: string
  } | null
}

// ============================================================================
// Analytics (pure)
// ============================================================================

/**
 * Compute aggregated inventory stats from a list of items.
 * Pure port of the `InventoryService.stats` computed signal.
 */
export function computeInventoryStats(items: InventoryItem[]): InventoryStats {
  const active = items.filter((i) => i.is_active)
  const categories = [
    ...new Set(active.map((i) => i.category).filter((c): c is string => !!c)),
  ].sort()

  const twoMonthsAgo = new Date()
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2)

  return {
    totalItems: active.length,
    activeItems: active.length,
    totalStock: active.reduce((sum, i) => sum + i.quantity, 0),
    lowStockCount: active.filter((i) => i.quantity > 0 && i.quantity <= i.low_stock_threshold)
      .length,
    outOfStockCount: active.filter((i) => i.quantity === 0).length,
    staleStockCount: active.filter(
      (i) => i.quantity > 0 && new Date(i.updated_at) < twoMonthsAgo,
    ).length,
    totalValue: active.reduce((sum, i) => sum + (i.unit_price ?? 0) * i.quantity, 0),
    categories,
  }
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Load all inventory items (active and inactive) ordered by name.
 * Ported from `InventoryService.loadItems()`.
 */
export async function listInventoryItems(): Promise<InventoryItem[]> {
  const { data, error } = await supabase
    .from('inventory_items')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as InventoryItem[]
}

/** Active items only — used by the create-package modal dropdown. */
export async function listActiveInventoryItems(): Promise<InventoryItem[]> {
  const all = await listInventoryItems()
  return all.filter((i) => i.is_active)
}

/**
 * Load stock movement history for a specific item, most-recent first.
 * Ported from `InventoryService.loadMovements(itemId)`.
 */
export async function listItemMovements(itemId: string): Promise<InventoryMovement[]> {
  const { data, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })

  if (error) {
    logger.warn(error, { op: 'inventory.loadMovements' })
    return []
  }
  return (data ?? []) as InventoryMovement[]
}

/**
 * Load the most recent N stock movements across all items, joining the parent
 * item for display. Ported from `InventoryService.loadRecentMovements()`.
 *
 * Tries the embedded FK select first; if PostgREST cannot resolve the
 * relationship, falls back to a separate items query and joins client-side.
 */
export async function listRecentMovements(limit = 100): Promise<RecentMovement[]> {
  // 1st attempt – FK embed for a single round-trip.
  const embedded = await supabase
    .from('inventory_movements')
    .select('*, inventory_items(name, sku, unit)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (!embedded.error && embedded.data) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (embedded.data as any[]).map((row) => {
      const { inventory_items, ...rest } = row
      return { ...rest, item: inventory_items ?? null } as RecentMovement
    })
  }

  // Fallback – PostgREST didn't expose the relationship. Two queries + client join.
  logger.warn(embedded.error, {
    op: 'inventory.loadRecentMovements',
    note: 'FK-embedded select failed, falling back to manual join',
  })

  const { data: movements, error } = await supabase
    .from('inventory_movements')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    logger.warn(error, { op: 'inventory.loadRecentMovements' })
    return []
  }

  const rows = (movements ?? []) as InventoryMovement[]
  const itemIds = [...new Set(rows.map((r) => r.item_id))]
  const itemMap = new Map<string, { name: string; sku: string | null; unit: string }>()

  if (itemIds.length > 0) {
    const { data: items } = await supabase
      .from('inventory_items')
      .select('id, name, sku, unit')
      .in('id', itemIds)

    for (const item of (items ?? []) as Array<{
      id: string
      name: string
      sku: string | null
      unit: string
    }>) {
      itemMap.set(item.id, { name: item.name, sku: item.sku, unit: item.unit })
    }
  }

  return rows.map((m) => ({ ...m, item: itemMap.get(m.item_id) ?? null }))
}

// ============================================================================
// Movement logging (internal, fire-and-forget)
// ============================================================================

/**
 * Insert a movement record. Fire-and-forget — errors are logged, not thrown.
 * The `user_id` is resolved from the current auth session.
 *
 * Note (deviation from Angular): the service read the user id synchronously
 * from a cached signal; here it is fetched via `supabase.auth.getUser()`.
 */
async function logMovement(payload: {
  item_id: string
  delta: number
  quantity_before: number
  quantity_after: number
  source: InventoryMovementSource
  reference?: string | null
  note?: string | null
}): Promise<void> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id ?? null

  const { error } = await supabase.from('inventory_movements').insert({
    item_id: payload.item_id,
    user_id: userId,
    delta: payload.delta,
    quantity_before: payload.quantity_before,
    quantity_after: payload.quantity_after,
    source: payload.source,
    reference: payload.reference ?? null,
    note: payload.note ?? null,
  })

  if (error) {
    logger.warn(error, { op: 'inventory.logMovement' })
  }
}

// ============================================================================
// Mutations (ported from InventoryService CRUD / restock / stock adjustments)
// ============================================================================

/**
 * Create a new inventory item. Logs an `initial` movement when the item was
 * created with quantity > 0. Ported from `InventoryService.createItem()`.
 */
export async function createInventoryItem(
  dto: CreateInventoryItemDto,
): Promise<InventoryItem> {
  const { data, error } = await supabase
    .from('inventory_items')
    .insert(dto)
    .select()
    .single()

  if (error) throw error
  const created = data as InventoryItem

  if (created.quantity > 0) {
    void logMovement({
      item_id: created.id,
      delta: created.quantity,
      quantity_before: 0,
      quantity_after: created.quantity,
      source: 'initial',
    })
  }

  return created
}

/**
 * Update an existing inventory item. When `dto.quantity` changes, logs a
 * `restock` (delta > 0) or `manual_edit` (delta < 0) movement.
 * Ported from `InventoryService.updateItem()`.
 *
 * Note (deviation from Angular): `quantity_before` came from an in-memory
 * signal; here it is read with a lightweight `select` before the update only
 * when `dto.quantity` is provided.
 */
export async function updateInventoryItem(
  id: string,
  dto: UpdateInventoryItemDto,
): Promise<InventoryItem> {
  let quantityBefore = 0
  if (dto.quantity !== undefined) {
    const { data: current } = await supabase
      .from('inventory_items')
      .select('quantity')
      .eq('id', id)
      .single()
    quantityBefore = (current as { quantity: number } | null)?.quantity ?? 0
  }

  const { data, error } = await supabase
    .from('inventory_items')
    .update(dto)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  const updated = data as InventoryItem

  if (dto.quantity !== undefined && updated.quantity !== quantityBefore) {
    const delta = updated.quantity - quantityBefore
    void logMovement({
      item_id: id,
      delta,
      quantity_before: quantityBefore,
      quantity_after: updated.quantity,
      source: delta > 0 ? 'restock' : 'manual_edit',
    })
  }

  return updated
}

/** Permanently delete an inventory item. Ported from `InventoryService.deleteItem()`. */
export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await supabase.from('inventory_items').delete().eq('id', id)
  if (error) throw error
}

/** Toggle an item's active status. Ported from `InventoryService.toggleActive()`. */
export async function toggleInventoryItemActive(item: InventoryItem): Promise<InventoryItem> {
  return updateInventoryItem(item.id, { is_active: !item.is_active })
}

/**
 * Set `is_active` on many items in parallel. Bypasses `updateInventoryItem`
 * (no quantity change → no movement to log). Ported from
 * `InventoryService.bulkToggleActive()`; throws on the first row error.
 */
export async function bulkSetInventoryActive(ids: string[], active: boolean): Promise<void> {
  if (!ids.length) return
  const results = await Promise.all(
    ids.map((id) => supabase.from('inventory_items').update({ is_active: active }).eq('id', id)),
  )
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw firstError
}

/** Permanently delete many items in parallel. Ported from `InventoryService.bulkDelete()`. */
export async function bulkDeleteInventoryItems(ids: string[]): Promise<void> {
  if (!ids.length) return
  const results = await Promise.all(
    ids.map((id) => supabase.from('inventory_items').delete().eq('id', id)),
  )
  const firstError = results.find((r) => r.error)?.error
  if (firstError) throw firstError
}

/**
 * Add stock to an item with an optional note. Bypasses `updateInventoryItem`
 * to capture the user-supplied note and avoid double-logging.
 * Ported from `InventoryService.restock()`.
 *
 * Note (deviation from Angular): `quantity_before` is read via a `select`
 * rather than from the in-memory signal.
 */
export async function restockInventoryItem(
  itemId: string,
  quantity: number,
  note?: string | null,
): Promise<InventoryItem> {
  if (quantity <= 0) {
    throw new Error('Quantity to add must be greater than zero.')
  }

  const { data: current } = await supabase
    .from('inventory_items')
    .select('quantity')
    .eq('id', itemId)
    .single()
  const quantityBefore = (current as { quantity: number } | null)?.quantity ?? 0
  const quantityAfter = quantityBefore + quantity

  const { data, error } = await supabase
    .from('inventory_items')
    .update({ quantity: quantityAfter })
    .eq('id', itemId)
    .select()
    .single()

  if (error) throw error
  const updated = data as InventoryItem

  void logMovement({
    item_id: itemId,
    delta: quantity,
    quantity_before: quantityBefore,
    quantity_after: updated.quantity,
    source: 'restock',
    note: note?.trim() ? note.trim() : null,
  })

  return updated
}

/**
 * Deduct stock for a list of items consumed by a package. Uses parallel atomic
 * `decrement_inventory_quantity` RPCs (stock may go negative = backorder).
 * Ported from `InventoryService.deductStock()`.
 *
 * Note (deviation from Angular): before-quantities come from a `select … in`
 * read rather than the in-memory signal.
 */
export async function deductStock(
  items: Array<{ inventoryItemId: string; quantity: number }>,
  packageReference?: string,
): Promise<void> {
  if (!items.length) return

  const beforeMap = await readQuantities(items.map((i) => i.inventoryItemId))

  await Promise.all(
    items.map(({ inventoryItemId, quantity }) =>
      supabase.rpc('decrement_inventory_quantity', {
        item_id: inventoryItemId,
        decrement_by: quantity,
      }),
    ),
  )

  for (const { inventoryItemId, quantity } of items) {
    const quantityBefore = beforeMap.get(inventoryItemId) ?? 0
    const quantityAfter = quantityBefore - quantity
    void logMovement({
      item_id: inventoryItemId,
      delta: quantityAfter - quantityBefore,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      source: 'package_deduct',
      reference: packageReference ?? null,
    })
  }
}

/**
 * Return stock to inventory for items previously consumed by a package (e.g.
 * when an order is deleted). Increments via the same atomic RPC with a negative
 * decrement and logs a `restock` movement.
 * Ported from `InventoryService.returnStock()`.
 */
export async function returnStock(
  items: Array<{ inventoryItemId: string; quantity: number }>,
  packageReference?: string,
): Promise<void> {
  if (!items.length) return

  const beforeMap = await readQuantities(items.map((i) => i.inventoryItemId))

  await Promise.all(
    items.map(({ inventoryItemId, quantity }) =>
      supabase.rpc('decrement_inventory_quantity', {
        item_id: inventoryItemId,
        decrement_by: -quantity,
      }),
    ),
  )

  for (const { inventoryItemId, quantity } of items) {
    const quantityBefore = beforeMap.get(inventoryItemId) ?? 0
    const quantityAfter = quantityBefore + quantity
    void logMovement({
      item_id: inventoryItemId,
      delta: quantity,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      source: 'restock',
      reference: packageReference ?? null,
      note: packageReference
        ? `Returned from deleted package ${packageReference}`
        : 'Returned from deleted package',
    })
  }
}

/** Read current quantities for a set of item ids into a Map (helper for stock adjustments). */
async function readQuantities(ids: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!ids.length) return map
  const { data } = await supabase
    .from('inventory_items')
    .select('id, quantity')
    .in('id', [...new Set(ids)])
  for (const row of (data ?? []) as Array<{ id: string; quantity: number }>) {
    map.set(row.id, row.quantity)
  }
  return map
}
