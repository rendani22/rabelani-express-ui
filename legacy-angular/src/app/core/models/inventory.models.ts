/**
 * Inventory item models for the inventory_items Supabase table.
 */

// ============================================================================
// Entity
// ============================================================================

/** Inventory item as returned from the database */
export interface InventoryItem {
  readonly id: string;
  readonly name: string;
  readonly sku: string | null;
  readonly description: string | null;
  readonly category: string | null;
  readonly unit: string;
  readonly quantity: number;
  readonly low_stock_threshold: number;
  readonly unit_price: number | null;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}

// ============================================================================
// DTOs
// ============================================================================

/** Payload for creating a new inventory item */
export interface CreateInventoryItemDto {
  readonly name: string;
  readonly sku?: string | null;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly unit?: string;
  readonly quantity?: number;
  readonly low_stock_threshold?: number;
  readonly unit_price?: number | null;
}

/** Payload for updating an existing inventory item */
export interface UpdateInventoryItemDto {
  readonly name?: string;
  readonly sku?: string | null;
  readonly description?: string | null;
  readonly category?: string | null;
  readonly unit?: string;
  readonly quantity?: number;
  readonly low_stock_threshold?: number;
  readonly unit_price?: number | null;
  readonly is_active?: boolean;
}

// ============================================================================
// Filters
// ============================================================================

/** Filters for querying inventory items */
export interface InventoryFilters {
  readonly search?: string;
  readonly category?: string;
  readonly showLowStock?: boolean;
  readonly showOutOfStock?: boolean;
  readonly showInactive?: boolean;
}

// ============================================================================
// Analytics
// ============================================================================

/** Aggregated analytics for the inventory page header */
export interface InventoryStats {
  readonly totalItems: number;
  readonly activeItems: number;
  readonly totalStock: number;
  readonly lowStockCount: number;
  readonly outOfStockCount: number;
  /** Active items with quantity > 0 whose stock count hasn't changed in 2+ months */
  readonly staleStockCount: number;
  readonly totalValue: number;
  readonly categories: string[];
}

// ============================================================================
// Stock Movement History
// ============================================================================

/**
 * Records a single stock quantity change.
 * positive delta = stock added, negative delta = stock removed.
 */
export type InventoryMovementSource =
  | 'initial'         // item created with opening stock > 0
  | 'manual_edit'     // quantity changed via the edit form
  | 'package_deduct'  // stock deducted when a delivery package was created
  | 'package_backorder' // reservation/allocation for a package when stock was insufficient
  | 'restock';        // stock added via a restock action

export interface InventoryMovement {
  readonly id: string;
  readonly item_id: string;
  readonly user_id: string | null;
  readonly delta: number;
  readonly quantity_before: number;
  readonly quantity_after: number;
  readonly source: InventoryMovementSource;
  readonly reference: string | null;
  readonly note: string | null;
  readonly created_at: string;
}

/**
 * A movement with the parent item embedded — used by the
 * global "Recent Movements" view.
 */
export interface RecentMovement extends InventoryMovement {
  readonly item: {
    readonly name: string;
    readonly sku: string | null;
    readonly unit: string;
  } | null;
}

// ============================================================================
// Service result
// ============================================================================

export type InventoryResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };
