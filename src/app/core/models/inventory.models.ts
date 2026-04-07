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
  readonly totalValue: number;
  readonly categories: string[];
}

// ============================================================================
// Service result
// ============================================================================

export type InventoryResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };
