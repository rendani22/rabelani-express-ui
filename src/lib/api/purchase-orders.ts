/**
 * Purchase Orders data layer — framework-agnostic port of the Angular feature.
 *
 * A PO groups one or more packages that share the same `po_number`. Each PO may
 * also have inventory items linked through the `package_items.inventory_item_id`
 * column.
 *
 * Ported 1:1 from:
 *  - features/purchase-orders/purchase-orders.models.ts (types + pure helpers)
 *  - features/purchase-orders/services/purchase-orders.service.ts (load / stats / filter)
 *  - features/purchase-orders/services/purchase-order-crud.service.ts (CRUD)
 *
 * The Angular services set signals on error; here the read/aggregation path
 * throws (the React layer uses react-query), while the CRUD functions keep the
 * `{ success, error }` result shape exactly as before.
 */

import { supabase } from '@/lib/supabase'
import { PACKAGE_STATUS, type PackageStatus } from '@/lib/status'
import type { Package } from '@/lib/models/package'
import type { InventoryItem } from '@/lib/api/inventory'
import { getCurrentStaffProfile } from '@/lib/api/staff'

// ============================================================================
// Core entity
// ============================================================================

/** Raw PO item balance row returned from Supabase */
export interface PurchaseOrderItemBalanceDto {
  readonly purchase_order_item_id: string
  readonly purchase_order_id: string
  readonly inventory_item_id: string
  readonly ordered_quantity: number | string
  readonly allocated_quantity: number | string
  readonly remaining_quantity?: number | string | null
}

/** Remaining quantity model used by PO-aware order creation UI */
export interface PurchaseOrderItemBalance {
  readonly purchaseOrderItemId: string
  readonly purchaseOrderId: string
  readonly inventoryItemId: string
  readonly orderedQuantity: number
  readonly allocatedQuantity: number
  readonly remainingQuantity: number
}

export function computeRemainingQuantity(ordered: number, allocated: number): number {
  return Math.max(0, ordered - allocated)
}

export function toPurchaseOrderItemBalance(
  dto: PurchaseOrderItemBalanceDto,
): PurchaseOrderItemBalance {
  const orderedQuantity = Number(dto.ordered_quantity)
  const allocatedQuantity = Number(dto.allocated_quantity)
  const remainingFromDto =
    dto.remaining_quantity === null || dto.remaining_quantity === undefined
      ? null
      : Number(dto.remaining_quantity)

  return {
    purchaseOrderItemId: dto.purchase_order_item_id,
    purchaseOrderId: dto.purchase_order_id,
    inventoryItemId: dto.inventory_item_id,
    orderedQuantity,
    allocatedQuantity,
    remainingQuantity:
      remainingFromDto === null
        ? computeRemainingQuantity(orderedQuantity, allocatedQuantity)
        : Math.max(0, remainingFromDto),
  }
}

/** An inventory item reference found inside a PO's package items */
export interface PurchaseOrderInventoryRef {
  readonly inventoryItemId: string
  readonly item: InventoryItem | null
  /** Total quantity across all packages that reference this inventory item */
  readonly totalQuantity: number
  readonly orderedQuantity: number
  readonly allocatedQuantity: number
  readonly remainingQuantity: number
  /** Number of packages referencing this item */
  readonly packageCount: number
}

// ============================================================================
// Status derivation  (must be declared before progress helpers below)
// ============================================================================

/**
 * Derived status for a purchase order, calculated from its package statuses.
 *
 * - completed  → all packages in a terminal state
 * - in_progress → at least one package is active (not draft / terminal)
 * - draft       → all packages are still in draft
 * - mixed       → mix of states that don't fit the above
 */
export type PurchaseOrderStatus = 'completed' | 'in_progress' | 'draft' | 'mixed'

export const TERMINAL_STATUSES: ReadonlySet<PackageStatus> = new Set([
  PACKAGE_STATUS.DELIVERED,
  PACKAGE_STATUS.COLLECTED,
  PACKAGE_STATUS.RETURNED,
])

export const ACTIVE_STATUSES: ReadonlySet<PackageStatus> = new Set([
  PACKAGE_STATUS.PENDING,
  PACKAGE_STATUS.NOTIFIED,
  PACKAGE_STATUS.IN_TRANSIT,
  PACKAGE_STATUS.READY_FOR_COLLECTION,
])

export function derivePurchaseOrderStatus(packages: readonly Package[]): PurchaseOrderStatus {
  if (packages.length === 0) return 'draft'
  const statuses = packages.map((p) => p.status)
  const allTerminal = statuses.every((s) => TERMINAL_STATUSES.has(s))
  if (allTerminal) return 'completed'
  const allDraft = statuses.every((s) => s === PACKAGE_STATUS.DRAFT)
  if (allDraft) return 'draft'
  const hasActive = statuses.some((s) => ACTIVE_STATUSES.has(s))
  if (hasActive) return 'in_progress'
  return 'mixed'
}

// ============================================================================
// Progress / completion
// ============================================================================

/**
 * Breakdown of linked orders by lifecycle bucket.
 * Used to power the progress bar and status counts in the UI.
 */
export interface PurchaseOrderOrderBreakdown {
  readonly total: number
  /** Packages in a terminal state (collected / delivered / returned) */
  readonly terminal: number
  /** Packages actively in-flight (pending → ready_for_collection) */
  readonly active: number
  readonly draft: number
}

export interface PurchaseOrderInventoryProgress {
  readonly orderedQuantity: number
  readonly allocatedQuantity: number
  readonly remainingQuantity: number
}

export function computeInventoryProgress(
  inventoryRefs: readonly PurchaseOrderInventoryRef[],
): PurchaseOrderInventoryProgress {
  return inventoryRefs.reduce<PurchaseOrderInventoryProgress>(
    (totals, ref) => ({
      orderedQuantity: totals.orderedQuantity + Number(ref.orderedQuantity || 0),
      allocatedQuantity: totals.allocatedQuantity + Number(ref.allocatedQuantity || 0),
      remainingQuantity: totals.remainingQuantity + Number(ref.remainingQuantity || 0),
    }),
    {
      orderedQuantity: 0,
      allocatedQuantity: 0,
      remainingQuantity: 0,
    },
  )
}

/**
 * Returns the percentage of ordered inventory that has been allocated.
 * Returns 0 when there is no ordered quantity.
 */
export function computeInventoryCompletionPercentage(
  inventoryRefs: readonly PurchaseOrderInventoryRef[],
): number {
  const progress = computeInventoryProgress(inventoryRefs)
  if (progress.orderedQuantity <= 0) return 0

  const allocatedQuantity = Math.min(
    Math.max(progress.allocatedQuantity, 0),
    progress.orderedQuantity,
  )

  return Math.round((allocatedQuantity / progress.orderedQuantity) * 100)
}

/**
 * Completion for first-class purchase orders created from the PO UI.
 * Progress is based on quantities that have reached delivered/collected states.
 */
export function computePurchaseOrderCreatedCompletionPercentage(
  inventoryRefs: readonly PurchaseOrderInventoryRef[],
  packages: readonly Package[],
): number {
  const orderedQuantity = inventoryRefs.reduce(
    (sum, ref) => sum + Number(ref.orderedQuantity || 0),
    0,
  )
  if (orderedQuantity <= 0) return 0

  const trackedInventoryItemIds = new Set(
    inventoryRefs.map((ref) => ref.inventoryItemId).filter((id): id is string => !!id),
  )

  const completedQuantity = packages.reduce((sum, pkg) => {
    if (pkg.status !== PACKAGE_STATUS.DELIVERED && pkg.status !== PACKAGE_STATUS.COLLECTED) {
      return sum
    }

    return (
      sum +
      (pkg.items ?? []).reduce((itemSum, item) => {
        if (!item.inventory_item_id || !trackedInventoryItemIds.has(item.inventory_item_id)) {
          return itemSum
        }
        return itemSum + (Number(item.quantity) || 0)
      }, 0)
    )
  }, 0)

  const clampedCompletedQuantity = Math.min(Math.max(completedQuantity, 0), orderedQuantity)
  return Math.round((clampedCompletedQuantity / orderedQuantity) * 100)
}

/**
 * Returns the percentage of linked packages that are in a terminal state.
 * Returns 0 when there are no packages.
 */
export function computeCompletionPercentage(packages: readonly Package[]): number {
  if (packages.length === 0) return 0
  const terminal = packages.filter((p) => TERMINAL_STATUSES.has(p.status)).length
  return Math.round((terminal / packages.length) * 100)
}

/** Buckets linked packages into terminal / active / draft counts. */
export function computeOrderBreakdown(packages: readonly Package[]): PurchaseOrderOrderBreakdown {
  return {
    total: packages.length,
    terminal: packages.filter((p) => TERMINAL_STATUSES.has(p.status)).length,
    active: packages.filter((p) => ACTIVE_STATUSES.has(p.status)).length,
    draft: packages.filter((p) => p.status === PACKAGE_STATUS.DRAFT).length,
  }
}

// ============================================================================
// PurchaseOrder entity
// ============================================================================

/**
 * Indicates how the PO was created:
 * - `'purchase_order'` – created explicitly via the Purchase Orders UI (has a record in `purchase_orders` table)
 * - `'order'` – a `po_number` was set on packages when the order was created, but no explicit PO record exists
 */
export type PurchaseOrderSource = 'purchase_order' | 'order'

/** A Purchase Order: a logical grouping of packages that share a PO number */
export interface PurchaseOrder {
  readonly poNumber: string
  readonly packages: readonly Package[]
  readonly inventoryRefs: readonly PurchaseOrderInventoryRef[]
  /** Earliest created_at among the packages */
  readonly createdAt: string
  /** Latest updated_at among the packages */
  readonly updatedAt: string
  /**
   * Derived from linked package statuses — NOT the raw DB `status` column.
   * Recomputed on every `load()` call so it stays in sync with order updates.
   */
  readonly derivedStatus: PurchaseOrderStatus
  readonly totalItems: number
  /**
   * 0–100 integer completion value:
   * - `purchase_order` source: collected/delivered inventory quantity vs ordered quantity
   * - `order` source: linked package status completion
   */
  readonly completionPercentage: number
  /** Bucket counts used to render the progress breakdown. */
  readonly orderBreakdown: PurchaseOrderOrderBreakdown
  /** How this PO entry was created — either from the PO form or inferred from an order's po_number. */
  readonly source: PurchaseOrderSource
  /** URL of the uploaded PO document (only set for `purchase_order` source POs). */
  readonly documentUrl: string | null
  /** Customer (receiver) the PO was raised for. Null for order-sourced POs. */
  readonly receiverId: string | null
  /** Customer display name ("Name Surname"). Null when unknown / order-sourced. */
  readonly receiverName: string | null
  /** Customer email. Null when unknown / order-sourced. */
  readonly receiverEmail: string | null
  /** Stated monetary value of the PO in ZAR. Null when not captured. */
  readonly poValue: number | null
  /** PO date as an ISO `YYYY-MM-DD` string. Null when not captured. */
  readonly poDate: string | null
  /** Free-text details / notes for the PO. Null when not captured. */
  readonly details: string | null
}

// ============================================================================
// Stats
// ============================================================================

export interface PurchaseOrderStats {
  readonly totalPOs: number
  readonly activePOs: number
  readonly completedPOs: number
  readonly draftPOs: number
  readonly totalPackages: number
  readonly totalInventoryItems: number
}

// ============================================================================
// Filters
// ============================================================================

export interface PurchaseOrderFilters {
  readonly search?: string
  readonly status?: PurchaseOrderStatus | 'all'
}

// ============================================================================
// Internal row shapes (Supabase select responses)
// ============================================================================

interface PurchaseOrderRow {
  readonly id: string
  readonly po_number: string
  readonly status: string
  readonly document_url?: string | null
  readonly receiver_id?: string | null
  readonly po_value?: number | string | null
  readonly po_date?: string | null
  readonly details?: string | null
  readonly created_at: string
  readonly updated_at: string
  readonly items?: readonly PurchaseOrderItemRow[]
}

interface ReceiverProfileRow {
  readonly id: string
  readonly name: string
  readonly surname: string
  readonly email: string
}

interface AllocationRow {
  readonly purchase_order_item_id: string
  readonly allocated_quantity: number | string
}

interface PurchaseOrderItemRow {
  readonly id: string
  readonly inventory_item_id: string
  readonly ordered_quantity: number | string
}

// ============================================================================
// Data loading — ported from PurchaseOrdersService.load()
// ============================================================================

/**
 * Loads first-class purchase orders (and their items) from `purchase_orders`,
 * then hydrates linked inventory + package context for display/search. Appends
 * synthetic order-sourced POs for `po_number`s that live only on packages.
 *
 * Returns the aggregated array (the Angular service set a signal). Throws an
 * Error carrying the Supabase message on any query error.
 */
export async function loadPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data: rawOrders, error: ordersError } = await supabase
    .from('purchase_orders')
    .select(`
      id,
      po_number,
      status,
      document_url,
      receiver_id,
      po_value,
      po_date,
      details,
      created_at,
      updated_at,
      items:purchase_order_items(
        id,
        inventory_item_id,
        ordered_quantity
      )
    `)
    .order('created_at', { ascending: false })

  if (ordersError) {
    throw new Error(ordersError.message)
  }

  const orders = (rawOrders ?? []) as PurchaseOrderRow[]
  const poNumbers = orders.map((order) => order.po_number)

  // PO-item ids (for allocations) and receiver ids (for customer hydration)
  const allItemIds = orders.flatMap((order) => (order.items ?? []).map((i) => i.id))
  const receiverIds = Array.from(
    new Set(orders.map((order) => order.receiver_id).filter((id): id is string => !!id)),
  )

  // ── Wave 2: independent fetches in parallel ─────────────────────────────
  // Allocations, customers, and ALL packages carrying a po_number are
  // mutually independent once we have the PO rows, so fetch them together
  // instead of one-after-another. The single packages query replaces the
  // previous first-class + order-created pair (and its brittle NOT IN filter).
  const [allocationsResult, receiversResult, packagesResult] = await Promise.all([
    allItemIds.length > 0
      ? supabase
          .from('purchase_order_item_allocations')
          .select('purchase_order_item_id, allocated_quantity')
          .in('purchase_order_item_id', allItemIds)
      : Promise.resolve({ data: [] as AllocationRow[], error: null }),
    receiverIds.length > 0
      ? supabase
          .from('receiver_profiles')
          .select('id, name, surname, email')
          .in('id', receiverIds)
      : Promise.resolve({ data: [] as ReceiverProfileRow[], error: null }),
    supabase
      .from('packages')
      .select('*, items:package_items(id, quantity, description, inventory_item_id)')
      .not('po_number', 'is', null)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
  ])

  // Allocations — best-effort (treated as 0 when unavailable, as before)
  const allocationsByPoItemId = new Map<string, number>()
  for (const alloc of (allocationsResult.data ?? []) as AllocationRow[]) {
    const current = allocationsByPoItemId.get(alloc.purchase_order_item_id) ?? 0
    allocationsByPoItemId.set(
      alloc.purchase_order_item_id,
      current + (Number(alloc.allocated_quantity) || 0),
    )
  }

  // Customers (receiver profiles)
  if (receiversResult.error) {
    throw new Error(receiversResult.error.message)
  }
  const receiverMap = new Map<string, ReceiverProfileRow>()
  for (const receiver of (receiversResult.data ?? []) as ReceiverProfileRow[]) {
    receiverMap.set(receiver.id, receiver)
  }

  // Packages — bucket every po_number-carrying package by its PO number
  if (packagesResult.error) {
    throw new Error(packagesResult.error.message)
  }
  const packagesByPoNumber = new Map<string, Package[]>()
  for (const pkg of (packagesResult.data ?? []) as Package[]) {
    const poNumber = pkg.po_number
    if (!poNumber) continue
    if (!packagesByPoNumber.has(poNumber)) {
      packagesByPoNumber.set(poNumber, [])
    }
    packagesByPoNumber.get(poNumber)!.push(pkg)
  }

  // ── Wave 3: a single inventory fetch for every referenced item ──────────
  // Union of inventory ids referenced by PO items and by package items, so
  // the synthetic order-PO block below needs no further round-trip.
  const inventoryItemIds = Array.from(
    new Set<string>([
      ...orders.flatMap((order) =>
        (order.items ?? [])
          .map((item) => item.inventory_item_id)
          .filter((id): id is string => !!id),
      ),
      ...Array.from(packagesByPoNumber.values())
        .flat()
        .flatMap((pkg) =>
          (pkg.items ?? [])
            .map((item) => item.inventory_item_id)
            .filter((id): id is string => !!id),
        ),
    ]),
  )

  const inventoryMap = new Map<string, InventoryItem>()
  if (inventoryItemIds.length > 0) {
    const { data: invItems, error: inventoryError } = await supabase
      .from('inventory_items')
      .select('*')
      .in('id', inventoryItemIds)

    if (inventoryError) {
      throw new Error(inventoryError.message)
    }

    for (const item of (invItems ?? []) as InventoryItem[]) {
      inventoryMap.set(item.id, item)
    }
  }

  const result: PurchaseOrder[] = orders.map((order) => {
    const packages = packagesByPoNumber.get(order.po_number) ?? []
    const refsByInventory = new Map<
      string,
      {
        orderedQty: number
        allocatedQty: number
        remainingQty: number
        packageIds: Set<string>
      }
    >()

    for (const item of order.items ?? []) {
      if (!item.inventory_item_id) continue
      const orderedQuantity = Number(item.ordered_quantity)
      const allocatedQuantity = allocationsByPoItemId.get(item.id) ?? 0
      const remainingQuantity = Math.max(0, orderedQuantity - allocatedQuantity)
      const agg = refsByInventory.get(item.inventory_item_id) ?? {
        orderedQty: 0,
        allocatedQty: 0,
        remainingQty: 0,
        packageIds: new Set<string>(),
      }
      agg.orderedQty += orderedQuantity
      agg.allocatedQty += allocatedQuantity
      agg.remainingQty += remainingQuantity

      for (const pkg of packages) {
        const hasMatch = (pkg.items ?? []).some(
          (pkgItem) => pkgItem.inventory_item_id === item.inventory_item_id,
        )
        if (hasMatch) agg.packageIds.add(pkg.id)
      }

      refsByInventory.set(item.inventory_item_id, agg)
    }

    const inventoryRefs: PurchaseOrderInventoryRef[] = Array.from(refsByInventory.entries()).map(
      ([inventoryItemId, value]) => ({
        inventoryItemId,
        item: inventoryMap.get(inventoryItemId) ?? null,
        totalQuantity: value.orderedQty,
        orderedQuantity: value.orderedQty,
        allocatedQuantity: value.allocatedQty,
        remainingQuantity: value.remainingQty,
        packageCount: value.packageIds.size,
      }),
    )

    const totalItems = (order.items ?? []).reduce(
      (sum, item) => sum + Number(item.ordered_quantity),
      0,
    )

    const receiver = order.receiver_id ? receiverMap.get(order.receiver_id) ?? null : null
    const poValue =
      order.po_value === null || order.po_value === undefined ? null : Number(order.po_value)

    return {
      poNumber: order.po_number,
      packages,
      inventoryRefs,
      createdAt: order.created_at,
      updatedAt: order.updated_at,
      derivedStatus: derivePurchaseOrderStatus(packages),
      totalItems,
      completionPercentage: computePurchaseOrderCreatedCompletionPercentage(
        inventoryRefs,
        packages,
      ),
      orderBreakdown: computeOrderBreakdown(packages),
      source: 'purchase_order' as PurchaseOrderSource,
      documentUrl: order.document_url ?? null,
      receiverId: order.receiver_id ?? null,
      receiverName: receiver ? `${receiver.name} ${receiver.surname}`.trim() : null,
      receiverEmail: receiver?.email ?? null,
      poValue: poValue !== null && Number.isNaN(poValue) ? null : poValue,
      poDate: order.po_date ?? null,
      details: order.details ?? null,
    }
  })

  // ── Append order-created POs ────────────────────────────────────────────
  // Collect all po_numbers that are NOT in the purchase_orders table
  const orderOnlyPoNumbers = Array.from(packagesByPoNumber.keys()).filter(
    (poNum) => !poNumbers.includes(poNum),
  )

  if (orderOnlyPoNumbers.length > 0) {
    // Inventory for these packages was already hydrated in the wave-3 fetch.
    const syntheticPOs: PurchaseOrder[] = orderOnlyPoNumbers.map((poNum) => {
      const packages = packagesByPoNumber.get(poNum) ?? []

      // Build inventory refs from package items (no ordered/allocated metadata available)
      const invRefMap = new Map<string, { qty: number; packageIds: Set<string> }>()
      for (const pkg of packages) {
        for (const pkgItem of pkg.items ?? []) {
          if (!pkgItem.inventory_item_id) continue
          const agg = invRefMap.get(pkgItem.inventory_item_id) ?? {
            qty: 0,
            packageIds: new Set<string>(),
          }
          agg.qty += Number(pkgItem.quantity) || 0
          agg.packageIds.add(pkg.id)
          invRefMap.set(pkgItem.inventory_item_id, agg)
        }
      }

      const inventoryRefs: PurchaseOrderInventoryRef[] = Array.from(invRefMap.entries()).map(
        ([inventoryItemId, value]) => ({
          inventoryItemId,
          item: inventoryMap.get(inventoryItemId) ?? null,
          totalQuantity: value.qty,
          orderedQuantity: value.qty,
          allocatedQuantity: value.qty,
          remainingQuantity: 0,
          packageCount: value.packageIds.size,
        }),
      )

      const totalItems = packages.reduce(
        (sum, pkg) => sum + (pkg.items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
        0,
      )

      const dates = packages.map((p) => p.created_at).sort()
      const updatedDates = packages.map((p) => p.updated_at ?? p.created_at).sort()

      return {
        poNumber: poNum,
        packages,
        inventoryRefs,
        createdAt: dates[0] ?? new Date().toISOString(),
        updatedAt: updatedDates[updatedDates.length - 1] ?? new Date().toISOString(),
        derivedStatus: derivePurchaseOrderStatus(packages),
        totalItems,
        completionPercentage: computeCompletionPercentage(packages),
        orderBreakdown: computeOrderBreakdown(packages),
        source: 'order' as PurchaseOrderSource,
        documentUrl: null,
        receiverId: null,
        receiverName: null,
        receiverEmail: null,
        poValue: null,
        poDate: null,
        details: null,
      }
    })

    return [
      ...result,
      ...syntheticPOs.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    ]
  }

  return result
}

// ============================================================================
// Pure derivations — ported from the `filteredPurchaseOrders` / `stats` computeds
// ============================================================================

/**
 * Filters purchase orders by search text (PO number, package reference /
 * receiver email, inventory item name / sku) and derived status.
 * Pure port of `PurchaseOrdersService.filteredPurchaseOrders`.
 */
export function filterPurchaseOrders(
  orders: readonly PurchaseOrder[],
  filters: PurchaseOrderFilters,
): PurchaseOrder[] {
  const { search, status } = filters
  let result = [...orders]

  if (search?.trim()) {
    const q = search.trim().toLowerCase()
    result = result.filter(
      (po) =>
        po.poNumber.toLowerCase().includes(q) ||
        po.packages.some(
          (p) =>
            p.reference.toLowerCase().includes(q) ||
            p.receiver_email.toLowerCase().includes(q),
        ) ||
        po.inventoryRefs.some(
          (ref) =>
            ref.item?.name.toLowerCase().includes(q) ||
            (ref.item?.sku ?? '').toLowerCase().includes(q),
        ),
    )
  }

  if (status && status !== 'all') {
    result = result.filter((po) => po.derivedStatus === status)
  }

  return result
}

/**
 * Aggregate stats across all purchase orders.
 * Pure port of `PurchaseOrdersService.stats`.
 */
export function computePurchaseOrderStats(orders: readonly PurchaseOrder[]): PurchaseOrderStats {
  const uniqueInventoryIds = new Set(
    orders.flatMap((po) => po.inventoryRefs.map((r) => r.inventoryItemId)),
  )
  return {
    totalPOs: orders.length,
    activePOs: orders.filter((po) => po.derivedStatus === 'in_progress').length,
    completedPOs: orders.filter((po) => po.derivedStatus === 'completed').length,
    draftPOs: orders.filter((po) => po.derivedStatus === 'draft').length,
    totalPackages: orders.reduce((s, po) => s + po.packages.length, 0),
    totalInventoryItems: uniqueInventoryIds.size,
  }
}

// ============================================================================
// CRUD — ported from PurchaseOrderCrudService
// ============================================================================

export interface CreatePurchaseOrderInput {
  readonly poNumber: string
  readonly items: readonly CreatePurchaseOrderItemInput[]
  /** Customer (receiver profile) the PO is raised for. */
  readonly receiverId: string | null
  /** Monetary value of the PO (ZAR). */
  readonly poValue: number | null
  /** PO date as an ISO `YYYY-MM-DD` string. */
  readonly poDate: string | null
  /** Free-text details / notes for the PO. */
  readonly details: string | null
}

export interface CreatePurchaseOrderItemInput {
  readonly inventoryItemId: string
  readonly orderedQuantity: number
}

export interface PurchaseOrderCrudResult {
  readonly success: boolean
  readonly purchaseOrderId?: string
  readonly error?: string
}

export interface UpdatePurchaseOrderInput {
  readonly purchaseOrderId: string
  readonly poNumber: string
  readonly items: readonly UpdatePurchaseOrderItemInput[]
  /** Customer (receiver profile) the PO is raised for. */
  readonly receiverId: string | null
  /** Monetary value of the PO (ZAR). */
  readonly poValue: number | null
  /** PO date as an ISO `YYYY-MM-DD` string. */
  readonly poDate: string | null
  /** Free-text details / notes for the PO. */
  readonly details: string | null
}

export interface UpdatePurchaseOrderItemInput {
  /** Empty for a brand-new line being added during the update. */
  readonly purchaseOrderItemId: string
  /** Set for new lines; identifies the inventory item to add. */
  readonly inventoryItemId?: string
  readonly orderedQuantity: number
}

export interface PurchaseOrderEditLine {
  readonly purchaseOrderItemId: string
  readonly inventoryItemId: string
  readonly orderedQuantity: number
  readonly minAllowedQuantity: number
}

export interface PurchaseOrderEditPayload {
  readonly purchaseOrderId: string
  readonly poNumber: string
  readonly items: readonly PurchaseOrderEditLine[]
  readonly receiverId: string | null
  readonly poValue: number | null
  readonly poDate: string | null
  readonly details: string | null
}

export type PurchaseOrderCrudDataResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string }

interface AtomicCreatePurchaseOrderRpcResponse {
  readonly purchase_order_id: string
}

interface AtomicUpdatePurchaseOrderRpcResponse {
  readonly purchase_order_id: string
}

interface PurchaseOrderForEditRow {
  readonly id: string
  readonly po_number: string
  readonly receiver_id?: string | null
  readonly po_value?: number | string | null
  readonly po_date?: string | null
  readonly details?: string | null
}

interface PurchaseOrderForEditBalanceRow {
  readonly purchase_order_item_id: string
  readonly inventory_item_id: string
  readonly ordered_quantity: number | string
  readonly allocated_quantity: number | string
}

interface PackageItemsByPoNumberRow {
  readonly items?:
    | readonly {
        readonly quantity: number | string
        readonly inventory_item_id?: string | null
      }[]
    | null
}

/**
 * Guard: drivers are not allowed to update purchase orders. Returns a failure
 * result when the current staff profile has the `driver` role, otherwise null.
 */
async function ensureDriverCannotUpdate(): Promise<PurchaseOrderCrudResult | null> {
  const profile = await getCurrentStaffProfile()
  if (profile?.role === 'driver') {
    return {
      success: false,
      error: 'Drivers cannot update purchase orders.',
    }
  }

  return null
}

export async function createPurchaseOrder(
  input: CreatePurchaseOrderInput,
): Promise<PurchaseOrderCrudResult> {
  const poNumber = input.poNumber.trim()
  const items = input.items
    .map((item) => ({
      inventoryItemId: item.inventoryItemId.trim(),
      orderedQuantity: Number(item.orderedQuantity),
    }))
    .filter((item) => item.inventoryItemId.length > 0 && item.orderedQuantity > 0)

  if (!poNumber) {
    return { success: false, error: 'PO number is required' }
  }

  if (items.length === 0) {
    return { success: false, error: 'At least one PO line is required' }
  }

  const receiverId = input.receiverId?.trim() || null
  const poValue =
    input.poValue === null || input.poValue === undefined || Number.isNaN(Number(input.poValue))
      ? null
      : Number(input.poValue)
  const poDate = input.poDate?.trim() || null
  const details = input.details?.trim() || null

  if (poValue !== null && poValue < 0) {
    return { success: false, error: 'PO value cannot be negative' }
  }

  const { data, error } = await supabase
    .rpc('create_purchase_order_with_items', {
      p_po_number: poNumber,
      p_items: items.map((item) => ({
        inventory_item_id: item.inventoryItemId,
        ordered_quantity: item.orderedQuantity,
      })),
      p_receiver_id: receiverId,
      p_po_value: poValue,
      p_po_date: poDate,
      p_details: details,
    })
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!(data as AtomicCreatePurchaseOrderRpcResponse | null)?.purchase_order_id) {
    return { success: false, error: 'Failed to create purchase order' }
  }

  return {
    success: true,
    purchaseOrderId: (data as AtomicCreatePurchaseOrderRpcResponse).purchase_order_id,
  }
}

export async function uploadPODocument(
  purchaseOrderId: string,
  file: File,
): Promise<PurchaseOrderCrudResult> {
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const filePath = `${purchaseOrderId}/${Date.now()}-${sanitizedName}`

  const { error: uploadError } = await supabase.storage
    .from('po-documents')
    .upload(filePath, file, { upsert: false, contentType: file.type })

  if (uploadError) {
    return { success: false, error: uploadError.message }
  }

  const { data: urlData } = supabase.storage.from('po-documents').getPublicUrl(filePath)

  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({ document_url: urlData.publicUrl })
    .eq('id', purchaseOrderId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

export async function updatePurchaseOrder(
  input: UpdatePurchaseOrderInput,
): Promise<PurchaseOrderCrudResult> {
  const purchaseOrderId = input.purchaseOrderId.trim()
  const poNumber = input.poNumber.trim()
  const items = input.items
    .map((item) => ({
      purchaseOrderItemId: item.purchaseOrderItemId.trim(),
      inventoryItemId: item.inventoryItemId?.trim() ?? '',
      orderedQuantity: Number(item.orderedQuantity),
    }))
    .filter(
      (item) =>
        (item.purchaseOrderItemId.length > 0 || item.inventoryItemId.length > 0) &&
        item.orderedQuantity > 0,
    )

  if (!purchaseOrderId) {
    return { success: false, error: 'Purchase order id is required' }
  }

  if (!poNumber) {
    return { success: false, error: 'PO number is required' }
  }

  if (items.length === 0) {
    return { success: false, error: 'At least one PO line is required' }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { success: false, error: 'You must be signed in to update purchase orders.' }
  }

  const accessResult = await ensureDriverCannotUpdate()
  if (accessResult) {
    return accessResult
  }

  const receiverId = input.receiverId?.trim() || null
  const poValue =
    input.poValue === null || input.poValue === undefined || Number.isNaN(Number(input.poValue))
      ? null
      : Number(input.poValue)
  const poDate = input.poDate?.trim() || null
  const details = input.details?.trim() || null

  if (poValue !== null && poValue < 0) {
    return { success: false, error: 'PO value cannot be negative' }
  }

  const { data, error } = await supabase
    .rpc('update_purchase_order_with_items', {
      p_purchase_order_id: purchaseOrderId,
      p_po_number: poNumber,
      p_items: items.map((item) => ({
        purchase_order_item_id: item.purchaseOrderItemId || null,
        inventory_item_id: item.inventoryItemId || null,
        ordered_quantity: item.orderedQuantity,
      })),
      p_receiver_id: receiverId,
      p_po_value: poValue,
      p_po_date: poDate,
      p_details: details,
    })
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  if (!(data as AtomicUpdatePurchaseOrderRpcResponse | null)?.purchase_order_id) {
    return { success: false, error: 'Failed to update purchase order' }
  }

  return { success: true }
}

export async function getPurchaseOrderForEdit(
  purchaseOrderId: string,
): Promise<PurchaseOrderCrudDataResult<PurchaseOrderEditPayload>> {
  const normalizedPurchaseOrderId = purchaseOrderId.trim()
  if (!normalizedPurchaseOrderId) {
    return { success: false, error: 'Purchase order id is required' }
  }

  const [purchaseOrderResult, balanceResult] = await Promise.all([
    supabase
      .from('purchase_orders')
      .select('id, po_number, receiver_id, po_value, po_date, details')
      .eq('id', normalizedPurchaseOrderId)
      .maybeSingle(),
    supabase
      .from('purchase_order_item_balances')
      .select('purchase_order_item_id, inventory_item_id, ordered_quantity, allocated_quantity')
      .eq('purchase_order_id', normalizedPurchaseOrderId),
  ])

  if (purchaseOrderResult.error) {
    return { success: false, error: purchaseOrderResult.error.message }
  }

  if (!purchaseOrderResult.data) {
    return { success: false, error: 'Purchase order not found' }
  }

  if (balanceResult.error) {
    return { success: false, error: balanceResult.error.message }
  }

  const poRow = purchaseOrderResult.data as PurchaseOrderForEditRow
  const poNumber = poRow.po_number.trim()

  const consumedByInventoryItemId = new Map<string, number>()
  if (poNumber) {
    const { data: packageRows, error: packageRowsError } = await supabase
      .from('packages')
      .select('items:package_items(quantity, inventory_item_id)')
      .eq('po_number', poNumber)
      .is('deleted_at', null)

    if (packageRowsError) {
      return { success: false, error: packageRowsError.message }
    }

    for (const pkg of (packageRows ?? []) as readonly PackageItemsByPoNumberRow[]) {
      for (const item of pkg.items ?? []) {
        if (!item.inventory_item_id) continue
        const current = consumedByInventoryItemId.get(item.inventory_item_id) ?? 0
        consumedByInventoryItemId.set(
          item.inventory_item_id,
          current + (Number(item.quantity) || 0),
        )
      }
    }
  }

  const items: PurchaseOrderEditLine[] = (balanceResult.data ?? []).map((line) => {
    const balanceRow = line as PurchaseOrderForEditBalanceRow
    const orderedQuantity = Number(balanceRow.ordered_quantity) || 0
    const allocatedQuantity = Number(balanceRow.allocated_quantity) || 0
    const consumedQuantity = consumedByInventoryItemId.get(balanceRow.inventory_item_id) ?? 0
    const minAllowedQuantity = Math.min(
      orderedQuantity,
      Math.max(allocatedQuantity, consumedQuantity),
    )

    return {
      purchaseOrderItemId: balanceRow.purchase_order_item_id,
      inventoryItemId: balanceRow.inventory_item_id,
      orderedQuantity,
      minAllowedQuantity,
    }
  })

  const poValue =
    poRow.po_value === null || poRow.po_value === undefined ? null : Number(poRow.po_value)

  return {
    success: true,
    data: {
      purchaseOrderId: poRow.id,
      poNumber,
      items,
      receiverId: poRow.receiver_id ?? null,
      poValue: poValue !== null && Number.isNaN(poValue) ? null : poValue,
      poDate: poRow.po_date ?? null,
      details: poRow.details ?? null,
    },
  }
}

/**
 * Resolve a purchase order's id from its `po_number`. Ports the inline lookup
 * the Angular component performed before opening the edit flow. Returns null
 * when no matching PO row exists. Throws on a Supabase error.
 */
export async function getPurchaseOrderIdByNumber(poNumber: string): Promise<string | null> {
  const normalized = poNumber.trim()
  if (!normalized) return null

  const { data, error } = await supabase
    .from('purchase_orders')
    .select('id')
    .eq('po_number', normalized)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as { id: string } | null)?.id ?? null
}
