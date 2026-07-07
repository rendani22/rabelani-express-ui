/**
 * Package data-access module.
 *
 * Framework-agnostic port of the legacy Angular `core/services/package.service.ts`.
 * No Angular, no signals — plain async functions over the shared Supabase client.
 *
 * Package mutations go through Supabase Edge Functions (`create-package`,
 * `update-package`, `driver-pickup`, `receive-at-collection`) via the private
 * `callEdgeFunction` helper. Reads and deletions use direct Supabase queries and
 * RPCs (`soft_delete_package`, `restore_package`, `is_pod_locked`,
 * `get_pod_lock_status`).
 *
 * NOTE ON STATE: the Angular service kept reactive signal state (`_packages`,
 * `_totalCount`, `_isLoading`, `_error`) and mutated it as a side-effect of each
 * call. That local UI cache has no equivalent in this plain-function port, so the
 * signal mutations are dropped. Every function returns the same result shape as
 * before; callers own their own state.
 */

import { supabase } from '@/lib/supabase'
import { config } from '@/lib/config'
import { logger } from '@/lib/logger'
import { PACKAGE_STATUS } from '@/lib/status'
import { isCurrentUserAdmin } from '@/lib/api/staff'
import type {
  Package,
  PackageFilters,
  PackageLockStatus,
  PodRecord,
  CreatePackageRequest,
  UpdatePackageRequest,
  CreatePackageApiResponse,
  UpdatePackageApiResponse,
  PackageActionApiResponse,
  PackageActionSuccessResponse,
  CreatePackageResult,
  UpdatePackageResult,
  PackageActionResult,
  GetPackageResult,
  GetPackagesResult,
  GetPurchaseOrderByNumberResult,
  PurchaseOrderItemBalanceSummary,
} from '@/lib/models/package'
import {
  isCreatePackageSuccess,
  isCreatePackageError,
  isUpdatePackageSuccess,
  isPackageActionSuccess,
  isApiError,
  EDGE_FUNCTIONS,
  computePurchaseOrderLineBalance,
} from '@/lib/models/package'

// ============================================================================
// Config
// ============================================================================

const baseUrl = config.supabase.functionsUrl
const apiKey = config.supabase.anonKey

// ============================================================================
// Internal helpers
// ============================================================================

/** Creates an error result. */
function errorResult(error: string): { success: false; error: string } {
  return { success: false, error }
}

/** Creates a success result. */
function successResult<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

/** Handles and logs errors, returning an error result. */
function handleError(error: unknown): { success: false; error: string } {
  const message =
    error instanceof Error ? error.message : 'An unexpected error occurred'
  logger.error(error, { op: 'packages' })
  return errorResult(message)
}

/** Retrieves the current user's access token. */
async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

/**
 * Refreshes and retrieves a new access token.
 * Used for operations that require a fresh token.
 */
async function getRefreshedAccessToken(): Promise<string | null> {
  const { data, error } = await supabase.auth.refreshSession()

  if (error) {
    logger.warn(error, { op: 'packages.sessionRefresh' })
    // Fall back to current session
    return getAccessToken()
  }

  return data.session?.access_token ?? null
}

/** Resolves the current authenticated user's id, or null. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

/**
 * True when the currently authenticated user may delete orders.
 * Restricted to admin staff accounts (staff_profiles.role === 'admin').
 */
export async function canDeleteOrders(): Promise<boolean> {
  return isCurrentUserAdmin()
}

/** Makes an authenticated call to a Supabase Edge Function. */
async function callEdgeFunction<T>(
  functionName: string,
  accessToken: string,
  payload: unknown
): Promise<T> {
  const url = `${baseUrl}/${functionName}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      apikey: apiKey,
    },
    body: JSON.stringify(payload),
  })

  // Handle non-JSON responses gracefully
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    logger.error('Failed to parse package response', { op: 'packages.parse', text })
    throw new Error(text || 'Invalid response from server')
  }
}

/**
 * Inserts an inventory movement audit row. Fire-and-forget — errors are logged
 * but do not propagate. The `user_id` is resolved from the current auth session.
 *
 * Ported from `InventoryService.logMovement` (the private query the inventory
 * service performs) so the delete/restore stock reconciliation keeps its audit
 * trail without depending on an Angular-only inventory service.
 */
async function logInventoryMovement(payload: {
  item_id: string
  delta: number
  quantity_before: number
  quantity_after: number
  source: string
  reference?: string | null
  note?: string | null
}): Promise<void> {
  const userId = await currentUserId()

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
    logger.warn(error, { op: 'packages.logMovement' })
  }
}

/**
 * Reads current on-hand quantities for the given inventory item ids. Replaces
 * the Angular inventory service's in-memory `_items()` signal cache that was
 * used to compute movement `quantity_before` values.
 */
async function readInventoryQuantities(
  ids: readonly string[]
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (!ids.length) return map

  const { data } = await supabase
    .from('inventory_items')
    .select('id, quantity')
    .in('id', ids as string[])

  for (const row of (data ?? []) as Array<{ id: string; quantity: number }>) {
    map.set(row.id, row.quantity)
  }
  return map
}

/**
 * Return stock to inventory for a list of items previously consumed by a
 * package (e.g. when an order is deleted). Ported from
 * `InventoryService.returnStock`: increments quantities via the atomic
 * `decrement_inventory_quantity` RPC (negative decrement = addition) and logs a
 * `restock` movement. Errors are non-fatal — the caller decides whether to
 * surface them.
 */
async function returnStock(
  items: Array<{ inventoryItemId: string; quantity: number }>,
  packageReference?: string
): Promise<void> {
  if (!items.length) return

  const beforeMap = await readInventoryQuantities(
    items.map((i) => i.inventoryItemId)
  )

  // Increment in parallel using the existing atomic RPC with a negative
  // decrement (i.e. an addition). The RPC performs a straight subtraction
  // so passing a negative value adds stock.
  await Promise.all(
    items.map(({ inventoryItemId, quantity }) =>
      supabase.rpc('decrement_inventory_quantity', {
        item_id: inventoryItemId,
        decrement_by: -quantity,
      })
    )
  )

  for (const { inventoryItemId, quantity } of items) {
    const quantityBefore = beforeMap.get(inventoryItemId) ?? 0
    const quantityAfter = quantityBefore + quantity
    await logInventoryMovement({
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

/**
 * Deduct stock for a list of items consumed by a package. Ported from
 * `InventoryService.deductStock`: parallel atomic decrements via the
 * `decrement_inventory_quantity` RPC (stock may go negative) plus a
 * `package_deduct` movement per item. Errors are non-fatal.
 */
async function deductStock(
  items: Array<{ inventoryItemId: string; quantity: number }>,
  packageReference?: string
): Promise<void> {
  if (!items.length) return

  const beforeMap = await readInventoryQuantities(
    items.map((i) => i.inventoryItemId)
  )

  await Promise.all(
    items.map(({ inventoryItemId, quantity }) =>
      supabase.rpc('decrement_inventory_quantity', {
        item_id: inventoryItemId,
        decrement_by: quantity,
      })
    )
  )

  for (const { inventoryItemId, quantity } of items) {
    const quantityBefore = beforeMap.get(inventoryItemId) ?? 0
    // Allow negative quantities to represent allocated/backordered stock
    const quantityAfter = quantityBefore - quantity
    await logInventoryMovement({
      item_id: inventoryItemId,
      delta: quantityAfter - quantityBefore,
      quantity_before: quantityBefore,
      quantity_after: quantityAfter,
      source: 'package_deduct',
      reference: packageReference ?? null,
    })
  }
}

// ============================================================================
// Package Creation
// ============================================================================

/**
 * Creates a new package by calling the Supabase Edge Function.
 * Requires authenticated user with warehouse or admin role.
 *
 * @param request - The package creation request payload
 * @returns Promise with success/error result
 */
export async function createPackage(
  request: CreatePackageRequest
): Promise<CreatePackageResult> {
  try {
    const accessToken = await getAccessToken()

    if (!accessToken) {
      return errorResult('You must be logged in to create a package')
    }

    const response = await callEdgeFunction<CreatePackageApiResponse>(
      EDGE_FUNCTIONS.CREATE_PACKAGE,
      accessToken,
      request
    )

    if (isCreatePackageSuccess(response)) {
      return successResult(response)
    }

    if (isCreatePackageError(response)) {
      const errorMessage = response.details ?? response.error
      return errorResult(errorMessage)
    }

    return errorResult('Unexpected response format')
  } catch (error) {
    return handleError(error)
  }
}

// ============================================================================
// Package Retrieval
// ============================================================================

/**
 * Load all packages with optional filters.
 *
 * @param filters - Optional filters for status, search, and limit
 * @param options - When `includeDeleted` is true, soft-deleted packages are
 *   included (only the privileged "Deleted orders" view should set this).
 */
export async function loadPackages(
  filters?: PackageFilters,
  options?: { includeDeleted?: boolean }
): Promise<GetPackagesResult & { count?: number }> {
  try {
    let query = supabase
      .from('packages')
      .select(
        '*, items:package_items(id, quantity, description, inventory_item_id)',
        {
          count: 'exact',
        }
      )
      .order('created_at', { ascending: false })

    if (!options?.includeDeleted) {
      // Hide soft-deleted orders from the standard list. RLS would also
      // filter them out for non-privileged accounts, but applying the
      // filter client-side keeps the privileged account's normal views
      // free of recycle-bin rows too.
      query = query.is('deleted_at', null)
    }

    if (filters?.status) {
      query = query.eq('status', filters.status)
    }

    if (filters?.search) {
      const term = filters.search.replace(/[,()]/g, ' ').trim()
      if (term) {
        // The packages table has no receiver_name column — receiver names
        // live on `receiver_profiles` keyed by email. Look up matching
        // receiver emails first, then OR them into the package filter
        // alongside po_number / receiver_email matches on the package row.
        const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_')
        const { data: receiverMatches } = await supabase
          .from('receiver_profiles')
          .select('email')
          .or(`name.ilike.%${escaped}%,surname.ilike.%${escaped}%`)
          .limit(200)

        const { data: packageItemMatches } = await supabase
          .from('package_items')
          .select('package_id')
          .ilike('description', `%${escaped}%`)
          .limit(200)

        const emails = Array.from(
          new Set(
            (receiverMatches ?? [])
              .map((r) => (r as { email: string | null }).email)
              .filter((e): e is string => !!e)
          )
        )
        const packageIds = Array.from(
          new Set(
            (packageItemMatches ?? [])
              .map((r) => (r as { package_id: string | null }).package_id)
              .filter((id): id is string => !!id)
          )
        )

        const orParts = [
          `reference.ilike.%${escaped}%`,
          `po_number.ilike.%${escaped}%`,
          `receiver_email.ilike.%${escaped}%`,
        ]
        if (emails.length > 0) {
          // Quote emails to be safe inside PostgREST `in` list
          const list = emails.map((e) => `"${e.replace(/"/g, '\\"')}"`).join(',')
          orParts.push(`receiver_email.in.(${list})`)
        }
        if (packageIds.length > 0) {
          const list = packageIds
            .map((id) => `"${id.replace(/"/g, '\\"')}"`)
            .join(',')
          orParts.push(`id.in.(${list})`)
        }

        query = query.or(orParts.join(','))
      }
    }

    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom)
    }

    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo)
    }

    if (filters?.limit) {
      query = query.limit(filters.limit)
    }

    // Server-side pagination: when both page and pageSize are provided,
    // use PostgREST `.range()` (inclusive bounds) so we only fetch the
    // current page rather than the entire table.
    if (filters?.page && filters?.pageSize && filters.pageSize > 0) {
      const page = Math.max(1, filters.page)
      const size = filters.pageSize
      const from = (page - 1) * size
      const to = from + size - 1
      query = query.range(from, to)
    }

    const { data, error, count } = await query

    if (error) {
      return { success: false, error: error.message }
    }

    const packages = (data ?? []) as Package[]
    return { success: true, data: packages, count: count ?? packages.length }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Get a single package by ID.
 *
 * @param id - Package UUID
 */
export async function getPackage(id: string): Promise<GetPackageResult> {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select(
        '*, items:package_items(id, quantity, description, inventory_item_id)'
      )
      .eq('id', id)
      .is('deleted_at', null)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Package }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Get a package by reference code.
 *
 * @param reference - Package reference string
 */
export async function getPackageByReference(
  reference: string
): Promise<GetPackageResult> {
  try {
    const { data, error } = await supabase
      .from('packages')
      .select(
        '*, items:package_items(id, quantity, description, inventory_item_id)'
      )
      .eq('reference', reference.toUpperCase())
      .is('deleted_at', null)
      .single()

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true, data: data as Package }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Get a package by purchase order (PO) number.
 * Returns the most recently created match if multiple exist.
 *
 * @param poNumber - Purchase order number to search for
 */
export async function getPackageByPoNumber(
  poNumber: string
): Promise<GetPackageResult> {
  try {
    const trimmed = poNumber.trim()
    if (!trimmed) {
      return { success: false, error: 'PO number is required' }
    }

    const { data, error } = await supabase
      .from('packages')
      .select(
        '*, items:package_items(id, quantity, description, inventory_item_id)'
      )
      .eq('po_number', trimmed)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      return { success: false, error: error.message }
    }

    if (!data) {
      return { success: false, error: 'Not found' }
    }

    return { success: true, data: data as Package }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Looks up purchase-order balances by PO number for PO-aware create-order flows.
 *
 * @param poNumber - Purchase order number to search for
 */
export async function getPurchaseOrderByNumber(
  poNumber: string
): Promise<GetPurchaseOrderByNumberResult> {
  try {
    const trimmed = poNumber.trim()
    if (!trimmed) {
      return { success: false, error: 'PO number is required' }
    }

    const { data, error } = await supabase
      .from('purchase_order_item_balances')
      .select(
        'purchase_order_item_id,purchase_order_id,inventory_item_id,ordered_quantity,allocated_quantity,purchase_orders!inner(po_number)'
      )
      .eq('purchase_orders.po_number', trimmed)

    if (error) {
      return { success: false, error: error.message }
    }

    const consumedByInventoryItemId = new Map<string, number>()
    const { data: packageRows, error: packageRowsError } = await supabase
      .from('packages')
      .select('items:package_items(quantity, inventory_item_id)')
      .eq('po_number', trimmed)
      .is('deleted_at', null)

    if (packageRowsError) {
      return { success: false, error: packageRowsError.message }
    }

    for (const pkg of (packageRows ?? []) as Array<{
      items?: Array<{
        quantity: number | string
        inventory_item_id?: string | null
      }>
    }>) {
      for (const item of pkg.items ?? []) {
        if (!item.inventory_item_id) continue
        const current =
          consumedByInventoryItemId.get(item.inventory_item_id) ?? 0
        consumedByInventoryItemId.set(
          item.inventory_item_id,
          current + (Number(item.quantity) || 0)
        )
      }
    }

    const items: PurchaseOrderItemBalanceSummary[] = (data ?? []).map((row) => {
      const typedRow = row as {
        purchase_order_item_id: string
        purchase_order_id: string
        inventory_item_id: string
        ordered_quantity: number | string
        allocated_quantity: number | string
      }

      const orderedQuantity = Number(typedRow.ordered_quantity)
      const allocatedQuantity = Number(typedRow.allocated_quantity)
      const consumedQuantity =
        consumedByInventoryItemId.get(typedRow.inventory_item_id) ?? 0
      const lineBalance = computePurchaseOrderLineBalance(
        orderedQuantity,
        allocatedQuantity,
        consumedQuantity
      )

      return {
        purchaseOrderItemId: typedRow.purchase_order_item_id,
        purchaseOrderId: typedRow.purchase_order_id,
        inventoryItemId: typedRow.inventory_item_id,
        orderedQuantity,
        allocatedQuantity: lineBalance.allocatedQuantity,
        remainingQuantity: lineBalance.remainingQuantity,
      }
    })

    return {
      success: true,
      data: {
        poNumber: trimmed,
        items,
      },
    }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Get recent packages created by current user.
 *
 * @param limit - Maximum number of packages to return (default: 5)
 */
export async function getMyRecentPackages(limit = 5): Promise<readonly Package[]> {
  const userId = await currentUserId()
  if (!userId) return []

  try {
    const { data } = await supabase
      .from('packages')
      .select('*')
      .eq('created_by', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    return (data ?? []) as Package[]
  } catch {
    return []
  }
}

// ============================================================================
// Package Updates
// ============================================================================

/**
 * Update a package via Edge Function.
 * Enforces lock checks - locked packages cannot be modified.
 *
 * @param id - Package UUID
 * @param updates - Fields to update (excluding package_id)
 */
export async function updatePackage(
  id: string,
  updates: Omit<UpdatePackageRequest, 'package_id'>
): Promise<UpdatePackageResult> {
  try {
    const accessToken = await getAccessToken()

    if (!accessToken) {
      return { success: false, error: 'Not authenticated' }
    }

    const response = await callEdgeFunction<UpdatePackageApiResponse>(
      EDGE_FUNCTIONS.UPDATE_PACKAGE,
      accessToken,
      { package_id: id, ...updates }
    )

    if (isUpdatePackageSuccess(response)) {
      return { success: true, data: response }
    }

    if (isApiError(response)) {
      const errorMessage = response.details ?? response.error

      // Check if it's a lock error
      const isLocked = response.error === 'Package is locked'
      return { success: false, error: errorMessage, isLocked }
    }

    return { success: false, error: 'Unexpected response format' }
  } catch (error) {
    return handleError(error)
  }
}

// ============================================================================
// Workflow Actions
// ============================================================================

/**
 * Driver picks up package for delivery.
 * Marks package as in_transit and sends "On the Way" email.
 *
 * @param packageId - Package UUID
 */
export async function driverPickup(
  packageId: string
): Promise<PackageActionResult> {
  try {
    // Force refresh the session to get a new valid token
    const accessToken = await getRefreshedAccessToken()

    if (!accessToken) {
      return { success: false, error: 'Session expired. Please log in again.' }
    }

    const response = await callEdgeFunction<PackageActionApiResponse>(
      EDGE_FUNCTIONS.DRIVER_PICKUP,
      accessToken,
      { package_id: packageId }
    )

    if (isPackageActionSuccess(response)) {
      return { success: true, data: response }
    }

    if (isApiError(response)) {
      const errorMessage = response.details ?? response.error
      return { success: false, error: errorMessage }
    }

    return { success: false, error: 'Failed to pickup package' }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Collection point staff receives package.
 * Marks package as ready_for_collection and sends notification email.
 *
 * @param packageId - Package UUID
 */
export async function receiveAtCollection(
  packageId: string
): Promise<PackageActionResult> {
  try {
    const accessToken = await getAccessToken()

    if (!accessToken) {
      return { success: false, error: 'Not authenticated' }
    }

    try {
      const response = await callEdgeFunction<PackageActionApiResponse>(
        EDGE_FUNCTIONS.RECEIVE_AT_COLLECTION,
        accessToken,
        { package_id: packageId }
      )

      if (isPackageActionSuccess(response)) {
        return { success: true, data: response }
      }

      if (isApiError(response)) {
        const errorMessage = response.details ?? response.error
        return { success: false, error: errorMessage }
      }

      return { success: false, error: 'Failed to receive package' }
    } catch (edgeError) {
      // The dedicated `receive-at-collection` edge function is not deployed on
      // every environment (its OPTIONS preflight 404s → the browser reports
      // "Failed to fetch"). Fall back to the deployed `update-package` function,
      // which handles the same status transition. If/when the dedicated function
      // is deployed, this fallback simply never runs.
      logger.warn(edgeError, {
        op: 'packages.receiveAtCollection',
        note: 'receive-at-collection unavailable; falling back to update-package',
      })
      const update = await updatePackage(packageId, {
        status: PACKAGE_STATUS.READY_FOR_COLLECTION,
      })
      if (update.success) {
        return {
          success: true,
          data: update.data as unknown as PackageActionSuccessResponse,
        }
      }
      return { success: false, error: update.error ?? 'Failed to receive package' }
    }
  } catch (error) {
    return handleError(error)
  }
}

// ============================================================================
// Package Deletion
// ============================================================================

/**
 * Soft-delete a package: marks `deleted_at` so the order is hidden from
 * the live list but its row, items, POD, and inventory-movement audit
 * trail are preserved. Stock for any inventory-linked items is returned
 * to inventory at delete time (matches the user's "give me my stock back"
 * intent). The package can later be restored via `restorePackage` —
 * which will re-deduct stock (and may push it negative if other orders
 * have since consumed it).
 *
 * Only the privileged "order deleter" account may call this method.
 * Returns the soft-deleted package on success along with the number of
 * inventory items that were returned for context in the confirmation toast.
 */
export async function deletePackageWithInventoryReturn(id: string): Promise<{
  success: boolean
  error?: string
  package?: Package
  returnedItems?: number
}> {
  if (!(await canDeleteOrders())) {
    return { success: false, error: 'You are not permitted to delete orders.' }
  }

  try {
    // 1. Load the package + items so we know what stock to return.
    const fetchResult = await getPackage(id)
    if (!fetchResult.success) {
      return { success: false, error: fetchResult.error }
    }
    const pkg = fetchResult.data

    // 2. Build the list of inventory-linked items to return.
    const itemsToReturn = (pkg.items ?? [])
      .filter((item) => !!item.inventory_item_id && item.quantity > 0)
      .map((item) => ({
        inventoryItemId: item.inventory_item_id as string,
        quantity: item.quantity,
      }))

    // 3. Return stock first. If the stock return fails we still attempt
    // the soft delete so the user isn't left with a "ghost" undeletable
    // order — but we surface the underlying error in the result.
    let returnError: string | null = null
    if (itemsToReturn.length > 0) {
      try {
        await returnStock(itemsToReturn, pkg.reference)
      } catch (err) {
        returnError =
          err instanceof Error ? err.message : 'Failed to return inventory.'
        logger.error(err, { op: 'packages.returnStock' })
      }
    }

    // 4. Soft-delete via the SECURITY DEFINER RPC so the operation is
    // atomic and authorized server-side.
    const { data, error } = await supabase.rpc('soft_delete_package', {
      p_package_id: id,
    })

    if (error) {
      return { success: false, error: error.message, package: pkg }
    }

    const deletedPkg = (Array.isArray(data) ? data[0] : data) as Package | null

    return {
      success: true,
      package: deletedPkg ?? pkg,
      returnedItems: itemsToReturn.length,
      error: returnError ?? undefined,
    }
  } catch (error) {
    const result = handleError(error)
    return { success: false, error: result.error }
  }
}

/**
 * Restore a previously soft-deleted package and re-deduct stock for any
 * inventory-linked items. If stock has since been consumed by other
 * orders the deduction will push inventory negative — this is surfaced
 * as a warning rather than blocking the restore.
 *
 * Only the privileged "order deleter" account may call this method.
 */
export async function restorePackage(id: string): Promise<{
  success: boolean
  error?: string
  package?: Package
  reDeductedItems?: number
}> {
  if (!(await canDeleteOrders())) {
    return { success: false, error: 'You are not permitted to restore orders.' }
  }

  try {
    // Load the soft-deleted package including its items so we know what
    // stock to re-deduct.
    const { data: pkgRow, error: fetchError } = await supabase
      .from('packages')
      .select(
        '*, items:package_items(id, quantity, description, inventory_item_id)'
      )
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      return { success: false, error: fetchError.message }
    }
    if (!pkgRow) {
      return { success: false, error: 'Package not found.' }
    }

    const pkg = pkgRow as Package
    const itemsToReDeduct = (pkg.items ?? [])
      .filter((item) => !!item.inventory_item_id && item.quantity > 0)
      .map((item) => ({
        inventoryItemId: item.inventory_item_id as string,
        quantity: item.quantity,
      }))

    // Restore the row via the SECURITY DEFINER RPC.
    const { data, error } = await supabase.rpc('restore_package', {
      p_package_id: id,
    })

    if (error) {
      return { success: false, error: error.message, package: pkg }
    }

    // Re-deduct stock (non-fatal).
    let deductError: string | null = null
    if (itemsToReDeduct.length > 0) {
      try {
        await deductStock(itemsToReDeduct, pkg.reference)
      } catch (err) {
        deductError =
          err instanceof Error ? err.message : 'Failed to re-deduct inventory.'
        logger.error(err, { op: 'packages.restore.deductStock' })
      }
    }

    const restoredPkg = (Array.isArray(data) ? data[0] : data) as Package | null

    return {
      success: true,
      package: restoredPkg ?? pkg,
      reDeductedItems: itemsToReDeduct.length,
      error: deductError ?? undefined,
    }
  } catch (error) {
    const result = handleError(error)
    return { success: false, error: result.error }
  }
}

/**
 * Load soft-deleted packages for the "Deleted orders" recycle-bin view.
 * Only the privileged account will see results (RLS enforces this on the
 * server).
 */
export async function loadDeletedPackages(): Promise<GetPackagesResult> {
  if (!(await canDeleteOrders())) {
    return {
      success: false,
      error: 'You are not permitted to view deleted orders.',
    }
  }

  try {
    const { data, error } = await supabase
      .from('packages')
      .select(
        '*, items:package_items(id, quantity, description, inventory_item_id)'
      )
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, data: (data ?? []) as Package[] }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Delete a single package by ID via direct Supabase call.
 *
 * @param id - Package UUID
 */
export async function deletePackage(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase.from('packages').delete().eq('id', id)

    if (error) {
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    return handleError(error)
  }
}

/**
 * Delete multiple packages by ID. Returns an aggregate result with the
 * number of successful and failed deletions.
 *
 * @param ids - Array of package UUIDs
 */
export async function deletePackages(ids: readonly string[]): Promise<{
  success: boolean
  deleted: number
  failed: number
  error?: string
}> {
  if (ids.length === 0) {
    return { success: true, deleted: 0, failed: 0 }
  }

  try {
    const { error } = await supabase
      .from('packages')
      .delete()
      .in('id', ids as string[])

    if (error) {
      return {
        success: false,
        deleted: 0,
        failed: ids.length,
        error: error.message,
      }
    }

    return { success: true, deleted: ids.length, failed: 0 }
  } catch (error) {
    const result = handleError(error)
    return { success: false, deleted: 0, failed: ids.length, error: result.error }
  }
}

// ============================================================================
// Lock Status
// ============================================================================

/**
 * Check if a package has a locked POD.
 *
 * @param packageId - Package UUID
 */
export async function isPackageLocked(packageId: string): Promise<boolean> {
  try {
    const { data } = await supabase.rpc('is_pod_locked', {
      p_package_id: packageId,
    })

    return data === true
  } catch {
    return false
  }
}

/**
 * Get the lock status details for a package.
 *
 * @param packageId - Package UUID
 */
export async function getPackageLockStatus(
  packageId: string
): Promise<PackageLockStatus | null> {
  try {
    const { data, error } = await supabase.rpc('get_pod_lock_status', {
      p_package_id: packageId,
    })

    if (error || !data || data.length === 0) {
      return null
    }

    const status = data[0]
    return {
      isLocked: status.is_locked,
      lockedAt: status.locked_at,
      podReference: status.pod_reference,
      pdfUrl: status.pdf_url,
    }
  } catch {
    return null
  }
}

/**
 * Resolve the set of inventory item ids that may be ADDED to a package during
 * item editing. Ported from the details panel's `loadPoInventoryIds`:
 * only orders genuinely created from a PO (i.e. with rows in
 * `purchase_order_item_allocations` linking their items) are restricted to that
 * PO's inventory. A free-text/global PO number, or any lookup failure, returns
 * `null` (no restriction).
 */
export async function getPoRestrictedInventoryIds(
  packageItemIds: string[],
  poNumber: string | null | undefined
): Promise<Set<string> | null> {
  const trimmed = poNumber?.trim()
  if (!trimmed || packageItemIds.length === 0) return null
  try {
    const { data: alloc, error } = await supabase
      .from('purchase_order_item_allocations')
      .select('id')
      .in('package_item_id', packageItemIds)
      .limit(1)
    if (error || !alloc || alloc.length === 0) return null

    const po = await getPurchaseOrderByNumber(trimmed)
    return po.success ? new Set(po.data.items.map((i) => i.inventoryItemId)) : null
  } catch {
    return null
  }
}

/**
 * Fetch the proof-of-delivery record (receiver/witness details + signatures)
 * for a package, or null if none exists. Ported from `getPodForPackage`.
 */
export async function getPodForPackage(packageId: string): Promise<PodRecord | null> {
  try {
    const { data, error } = await supabase
      .from('pods')
      .select(
        'id, package_id, pod_reference, is_locked, locked_at, ' +
          'receiver_name, receiver_employee_number, receiver_phone, receiver_signature, ' +
          'witness_name, witness_employee_number, witness_phone, witness_signature, ' +
          'completed_at, completed_by, staff_name, completion_status'
      )
      .eq('package_id', packageId)
      .maybeSingle()

    if (error || !data) return null
    return data as unknown as PodRecord
  } catch {
    return null
  }
}

/** A single package audit-log row (admin-only view). Ported from the details panel. */
export interface AuditLogEntry {
  readonly id: string
  readonly action: string
  readonly performed_by?: string | null
  readonly metadata?: Record<string, unknown> | null
  readonly created_at: string
}

/**
 * Load the audit-log rows for a package (`audit_logs`), newest first. RLS limits
 * this table to active staff; the UI further gates the view to admins. Best-effort:
 * returns `[]` on any error. Ported from `PackageDetailsPanel.loadAuditLog`.
 */
export async function getPackageAuditLog(packageId: string): Promise<AuditLogEntry[]> {
  try {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, action, performed_by, metadata, created_at')
      .eq('entity_type', 'package')
      .eq('entity_id', packageId)
      .order('created_at', { ascending: false })

    if (error || !data) return []
    return data as AuditLogEntry[]
  } catch {
    return []
  }
}
