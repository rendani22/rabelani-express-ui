/**
 * Purchase Order models — a PO groups one or more packages that share the
 * same `po_number`. Each PO may also have inventory items linked through
 * the `package_items.inventory_item_id` column.
 */

import { Package, PackageStatus } from '../../core/models/package.models';
import { InventoryItem } from '../../core/models/inventory.models';

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

/** A Purchase Order: a logical grouping of packages that share a PO number */
export interface PurchaseOrder {
  readonly poNumber: string;
  readonly packages: readonly Package[];
  readonly inventoryRefs: readonly PurchaseOrderInventoryRef[];
  /** Earliest created_at among the packages */
  readonly createdAt: string;
  /** Latest updated_at among the packages */
  readonly updatedAt: string;
  readonly derivedStatus: PurchaseOrderStatus;
  readonly totalItems: number;
}

// ============================================================================
// Status derivation
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
