import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import {
  InventoryItem,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  InventoryFilters,
  InventoryStats,
  InventoryResult,
} from '../models/inventory.models';

/**
 * Service for managing inventory items via direct Supabase queries.
 * Exposes readonly signals for reactive state and computed analytics.
 */
@Injectable({
  providedIn: 'root',
})
export class InventoryService {
  private readonly supabase = inject(SupabaseService);

  // =========================================================================
  // State
  // =========================================================================

  private readonly _items = signal<InventoryItem[]>([]);
  readonly items = this._items.asReadonly();

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // =========================================================================
  // Computed analytics
  // =========================================================================

  readonly stats = computed<InventoryStats>(() => {
    const all = this._items();
    const active = all.filter(i => i.is_active);
    const categories = [...new Set(active.map(i => i.category).filter((c): c is string => !!c))].sort();

    return {
      totalItems: active.length,
      activeItems: active.length,
      totalStock: active.reduce((sum, i) => sum + i.quantity, 0),
      lowStockCount: active.filter(i => i.quantity > 0 && i.quantity <= i.low_stock_threshold).length,
      outOfStockCount: active.filter(i => i.quantity === 0).length,
      totalValue: active.reduce((sum, i) => sum + (i.unit_price ?? 0) * i.quantity, 0),
      categories,
    };
  });

  /** Active items only – used by the create-package modal dropdown */
  readonly activeItems = computed(() => this._items().filter(i => i.is_active));

  // =========================================================================
  // CRUD
  // =========================================================================

  /**
   * Load all inventory items (active and inactive) ordered by name.
   */
  async loadItems(): Promise<InventoryItem[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        this.error.set(error.message);
        return [];
      }

      this._items.set((data ?? []) as InventoryItem[]);
      return (data ?? []) as InventoryItem[];
    } catch {
      this.error.set('An unexpected error occurred while loading inventory.');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Create a new inventory item.
   */
  async createItem(dto: CreateInventoryItemDto): Promise<InventoryResult<InventoryItem>> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .insert(dto)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { success: false, error: error.message };
      }

      await this.loadItems();
      return { success: true, data: data as InventoryItem };
    } catch {
      const msg = 'An unexpected error occurred while creating the inventory item.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing inventory item.
   */
  async updateItem(id: string, dto: UpdateInventoryItemDto): Promise<InventoryResult<InventoryItem>> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { success: false, error: error.message };
      }

      await this.loadItems();
      return { success: true, data: data as InventoryItem };
    } catch {
      const msg = 'An unexpected error occurred while updating the inventory item.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Permanently delete an inventory item.
   */
  async deleteItem(id: string): Promise<InventoryResult<void>> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { error } = await this.supabase.client
        .from('inventory_items')
        .delete()
        .eq('id', id);

      if (error) {
        this.error.set(error.message);
        return { success: false, error: error.message };
      }

      await this.loadItems();
      return { success: true, data: undefined };
    } catch {
      const msg = 'An unexpected error occurred while deleting the inventory item.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deduct stock for a list of items consumed by a package.
   * Called after a package is successfully created.
   * Errors are non-fatal – the package was already created.
   */
  async deductStock(items: Array<{ inventoryItemId: string; quantity: number }>): Promise<void> {
    if (!items.length) return;

    for (const { inventoryItemId, quantity } of items) {
      const current = this._items().find(i => i.id === inventoryItemId);
      if (!current) continue;

      const newQty = Math.max(0, current.quantity - quantity);
      await this.supabase.client
        .from('inventory_items')
        .update({ quantity: newQty })
        .eq('id', inventoryItemId);
    }

    // Refresh to reflect new quantities
    await this.loadItems();
  }

  /**
   * Toggle the active status of an inventory item.
   */
  async toggleActive(item: InventoryItem): Promise<InventoryResult<InventoryItem>> {
    return this.updateItem(item.id, { is_active: !item.is_active });
  }
}
