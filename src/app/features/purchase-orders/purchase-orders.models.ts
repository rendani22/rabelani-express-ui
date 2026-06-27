/**
 * Purchase Order models — a PO groups one or more packages that share the
 * same `po_number`. Each PO may also have inventory items linked through
 * the `package_items.inventory_item_id` column.
 */

import { InventoryItem, Package, PackageStatus } from '../../core';

// ============================================================================
// Core entity
// ============================================================================

/** Raw PO item balance row returned from Supabase */
export interface PurchaseOrderItemBalanceDto {
  readonly purchase_order_item_id: string;
  readonly purchase_order_id: string;
  readonly inventory_item_id: string;
  readonly ordered_quantity: number | string;
  readonly allocated_quantity: number | string;
  readonly remaining_quantity?: number | string | null;
}

/** Remaining quantity model used by PO-aware order creation UI */
export interface PurchaseOrderItemBalance {
  readonly purchaseOrderItemId: string;
  readonly purchaseOrderId: string;
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
  readonly allocatedQuantity: number;
  readonly remainingQuantity: number;
}

export function computeRemainingQuantity(ordered: number, allocated: number): number {
  return Math.max(0, ordered - allocated);
}

export function toPurchaseOrderItemBalance(
  dto: PurchaseOrderItemBalanceDto
): PurchaseOrderItemBalance {
  const orderedQuantity = Number(dto.ordered_quantity);
  const allocatedQuantity = Number(dto.allocated_quantity);
  const remainingFromDto =
    dto.remaining_quantity === null || dto.remaining_quantity === undefined
      ? null
      : Number(dto.remaining_quantity);

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
  };
}

/** An inventory item reference found inside a PO's package items */
export interface PurchaseOrderInventoryRef {
  readonly inventoryItemId: string;
  readonly item: InventoryItem | null;
  /** Total quantity across all packages that reference this inventory item */
  readonly totalQuantity: number;
  readonly orderedQuantity: number;
  readonly allocatedQuantity: number;
  readonly remainingQuantity: number;
  /** Number of packages referencing this item */
  readonly packageCount: number;
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
export type PurchaseOrderStatus = 'completed' | 'in_progress' | 'draft' | 'mixed';

export const TERMINAL_STATUSES: ReadonlySet<PackageStatus> = new Set([
  'delivered',
  'collected',
  'returned',
]);

export const ACTIVE_STATUSES: ReadonlySet<PackageStatus> = new Set([
  'pending',
  'notified',
  'in_transit',
  'ready_for_collection',
]);

export function derivePurchaseOrderStatus(packages: readonly Package[]): PurchaseOrderStatus {
  if (packages.length === 0) return 'draft';
  const statuses = packages.map(p => p.status);
  const allTerminal = statuses.every(s => TERMINAL_STATUSES.has(s));
  if (allTerminal) return 'completed';
  const allDraft = statuses.every(s => s === 'draft');
  if (allDraft) return 'draft';
  const hasActive = statuses.some(s => ACTIVE_STATUSES.has(s));
  if (hasActive) return 'in_progress';
  return 'mixed';
}

// ============================================================================
// Progress / completion
// ============================================================================

/**
 * Breakdown of linked orders by lifecycle bucket.
 * Used to power the progress bar and status counts in the UI.
 */
export interface PurchaseOrderOrderBreakdown {
  readonly total: number;
  /** Packages in a terminal state (collected / delivered / returned) */
  readonly terminal: number;
  /** Packages actively in-flight (pending → ready_for_collection) */
  readonly active: number;
  readonly draft: number;
}

export interface PurchaseOrderInventoryProgress {
  readonly orderedQuantity: number;
  readonly allocatedQuantity: number;
  readonly remainingQuantity: number;
}

export function computeInventoryProgress(
  inventoryRefs: readonly PurchaseOrderInventoryRef[]
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
    }
  );
}

/**
 * Returns the percentage of ordered inventory that has been allocated.
 * Returns 0 when there is no ordered quantity.
 */
export function computeInventoryCompletionPercentage(
  inventoryRefs: readonly PurchaseOrderInventoryRef[]
): number {
  const progress = computeInventoryProgress(inventoryRefs);
  if (progress.orderedQuantity <= 0) return 0;

  const allocatedQuantity = Math.min(
    Math.max(progress.allocatedQuantity, 0),
    progress.orderedQuantity
  );

  return Math.round((allocatedQuantity / progress.orderedQuantity) * 100);
}

/**
 * Completion for first-class purchase orders created from the PO UI.
 * Progress is based on quantities that have reached delivered/collected states.
 */
export function computePurchaseOrderCreatedCompletionPercentage(
  inventoryRefs: readonly PurchaseOrderInventoryRef[],
  packages: readonly Package[]
): number {
  const orderedQuantity = inventoryRefs.reduce((sum, ref) => sum + Number(ref.orderedQuantity || 0), 0);
  if (orderedQuantity <= 0) return 0;

  const trackedInventoryItemIds = new Set(
    inventoryRefs.map(ref => ref.inventoryItemId).filter((id): id is string => !!id)
  );

  const completedQuantity = packages.reduce((sum, pkg) => {
    if (pkg.status !== 'delivered' && pkg.status !== 'collected') return sum;

    return (
      sum +
      (pkg.items ?? []).reduce((itemSum, item) => {
        if (!item.inventory_item_id || !trackedInventoryItemIds.has(item.inventory_item_id)) {
          return itemSum;
        }
        return itemSum + (Number(item.quantity) || 0);
      }, 0)
    );
  }, 0);

  const clampedCompletedQuantity = Math.min(Math.max(completedQuantity, 0), orderedQuantity);
  return Math.round((clampedCompletedQuantity / orderedQuantity) * 100);
}

/**
 * Returns the percentage of linked packages that are in a terminal state.
 * Returns 0 when there are no packages.
 */
export function computeCompletionPercentage(packages: readonly Package[]): number {
  if (packages.length === 0) return 0;
  const terminal = packages.filter(p => TERMINAL_STATUSES.has(p.status)).length;
  return Math.round((terminal / packages.length) * 100);
}

/** Buckets linked packages into terminal / active / draft counts. */
export function computeOrderBreakdown(packages: readonly Package[]): PurchaseOrderOrderBreakdown {
  return {
    total: packages.length,
    terminal: packages.filter(p => TERMINAL_STATUSES.has(p.status)).length,
    active: packages.filter(p => ACTIVE_STATUSES.has(p.status)).length,
    draft: packages.filter(p => p.status === 'draft').length,
  };
}

// ============================================================================
// PurchaseOrder entity
// ============================================================================

/**
 * Indicates how the PO was created:
 * - `'purchase_order'` – created explicitly via the Purchase Orders UI (has a record in `purchase_orders` table)
 * - `'order'` – a `po_number` was set on packages when the order was created, but no explicit PO record exists
 */
export type PurchaseOrderSource = 'purchase_order' | 'order';

/** A Purchase Order: a logical grouping of packages that share a PO number */
export interface PurchaseOrder {
  readonly poNumber: string;
  readonly packages: readonly Package[];
  readonly inventoryRefs: readonly PurchaseOrderInventoryRef[];
  /** Earliest created_at among the packages */
  readonly createdAt: string;
  /** Latest updated_at among the packages */
  readonly updatedAt: string;
  /**
   * Derived from linked package statuses — NOT the raw DB `status` column.
   * Recomputed on every `load()` call so it stays in sync with order updates.
   */
  readonly derivedStatus: PurchaseOrderStatus;
  readonly totalItems: number;
  /**
   * 0–100 integer completion value:
   * - `purchase_order` source: collected/delivered inventory quantity vs ordered quantity
   * - `order` source: linked package status completion
   */
  readonly completionPercentage: number;
  /** Bucket counts used to render the progress breakdown. */
  readonly orderBreakdown: PurchaseOrderOrderBreakdown;
  /** How this PO entry was created — either from the PO form or inferred from an order's po_number. */
  readonly source: PurchaseOrderSource;
  /** URL of the uploaded PO document (only set for `purchase_order` source POs). */
  readonly documentUrl: string | null;
}

// ============================================================================
// Stats
// ============================================================================

export interface PurchaseOrderStats {
  readonly totalPOs: number;
  readonly activePOs: number;
  readonly completedPOs: number;
  readonly draftPOs: number;
  readonly totalPackages: number;
  readonly totalInventoryItems: number;
}

// ============================================================================
// Filters
// ============================================================================

export interface PurchaseOrderFilters {
  readonly search?: string;
  readonly status?: PurchaseOrderStatus | 'all';
}
