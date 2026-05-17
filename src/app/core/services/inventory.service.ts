import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import {
  InventoryItem,
  InventoryMovement,
  InventoryMovementSource,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
  InventoryStats,
  InventoryResult,
  RecentMovement,
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

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    return {
      totalItems: active.length,
      activeItems: active.length,
      totalStock: active.reduce((sum, i) => sum + i.quantity, 0),
      lowStockCount: active.filter(i => i.quantity > 0 && i.quantity <= i.low_stock_threshold).length,
      outOfStockCount: active.filter(i => i.quantity === 0).length,
      staleStockCount: active.filter(i => i.quantity > 0 && new Date(i.updated_at) < twoMonthsAgo).length,
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

      const created = data as InventoryItem;

      // Log initial stock movement if the item was created with quantity > 0
      if (created.quantity > 0) {
        this.logMovement({
          item_id: created.id,
          delta: created.quantity,
          quantity_before: 0,
          quantity_after: created.quantity,
          source: 'initial',
        });
      }

      await this.loadItems();
      return { success: true, data: created };
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

    // Capture current quantity before the update for movement logging
    const quantityBefore = this._items().find(i => i.id === id)?.quantity ?? 0;

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

      const updated = data as InventoryItem;

      // Log a movement if the quantity actually changed
      if (dto.quantity !== undefined && updated.quantity !== quantityBefore) {
        const delta = updated.quantity - quantityBefore;
        this.logMovement({
          item_id: id,
          delta,
          quantity_before: quantityBefore,
          quantity_after: updated.quantity,
          source: delta > 0 ? 'restock' : 'manual_edit',
        });
      }

      await this.loadItems();
      return { success: true, data: updated };
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
   * Uses parallel atomic database-level decrements to avoid race conditions.
   * Called after a package is successfully created.
   * Errors are non-fatal – the package was already created.
   */
  async deductStock(
    items: Array<{ inventoryItemId: string; quantity: number }>,
    packageReference?: string,
  ): Promise<void> {
    if (!items.length) return;

    // Capture before-quantities from in-memory state for movement logging
    const beforeMap = new Map(this._items().map(i => [i.id, i.quantity]));

    // Execute all decrements in parallel using atomic RPC to avoid race conditions.
    // The RPC now performs a straight subtraction so inventory may go negative
    // (representing allocated-but-unavailable stock / backorders).
    await Promise.all(
      items.map(({ inventoryItemId, quantity }) =>
        this.supabase.client.rpc('decrement_inventory_quantity', {
          item_id: inventoryItemId,
          decrement_by: quantity,
        })
      )
    );

    // Log a movement for each deducted item (fire-and-forget, non-fatal)
    for (const { inventoryItemId, quantity } of items) {
      const quantityBefore = beforeMap.get(inventoryItemId) ?? 0;
      // Allow negative quantities to represent allocated/backordered stock
      const quantityAfter = quantityBefore - quantity;
      this.logMovement({
        item_id: inventoryItemId,
        delta: quantityAfter - quantityBefore,
        quantity_before: quantityBefore,
        quantity_after: quantityAfter,
        source: 'package_deduct',
        reference: packageReference ?? null,
      });
    }

    // Refresh to reflect updated quantities in the UI
    await this.loadItems();
  }

  /**
   * Toggle the active status of an inventory item.
   */
  async toggleActive(item: InventoryItem): Promise<InventoryResult<InventoryItem>> {
    return this.updateItem(item.id, { is_active: !item.is_active });
  }

  // =========================================================================
  // Restock
  // =========================================================================

  /**
   * Add stock to an item with an optional note. Bypasses `updateItem` to avoid
   * double-logging the auto-movement and to capture the user-supplied note.
   */
  async restock(
    itemId: string,
    quantity: number,
    note?: string | null,
  ): Promise<InventoryResult<InventoryItem>> {
    if (quantity <= 0) {
      return { success: false, error: 'Quantity to add must be greater than zero.' };
    }

    const quantityBefore = this._items().find(i => i.id === itemId)?.quantity ?? 0;
    const quantityAfter = quantityBefore + quantity;

    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabase.client
        .from('inventory_items')
        .update({ quantity: quantityAfter })
        .eq('id', itemId)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { success: false, error: error.message };
      }

      const updated = data as InventoryItem;

      this.logMovement({
        item_id: itemId,
        delta: quantity,
        quantity_before: quantityBefore,
        quantity_after: updated.quantity,
        source: 'restock',
        note: note?.trim() ? note.trim() : null,
      });

      await this.loadItems();
      return { success: true, data: updated };
    } catch {
      const msg = 'An unexpected error occurred while restocking the item.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  // =========================================================================
  // Bulk operations
  // =========================================================================

  /**
   * Activate or deactivate multiple items in parallel.
   */
  async bulkToggleActive(ids: string[], active: boolean): Promise<InventoryResult<void>> {
    if (!ids.length) return { success: true, data: undefined };

    this.loading.set(true);
    this.error.set(null);

    try {
      const results = await Promise.all(
        ids.map(id =>
          this.supabase.client
            .from('inventory_items')
            .update({ is_active: active })
            .eq('id', id)
        )
      );
      const firstError = results.find(r => r.error)?.error;
      await this.loadItems();
      if (firstError) {
        this.error.set(firstError.message);
        return { success: false, error: firstError.message };
      }
      return { success: true, data: undefined };
    } catch {
      const msg = 'An unexpected error occurred during the bulk update.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Permanently delete multiple items in parallel.
   */
  async bulkDelete(ids: string[]): Promise<InventoryResult<void>> {
    if (!ids.length) return { success: true, data: undefined };

    this.loading.set(true);
    this.error.set(null);

    try {
      const results = await Promise.all(
        ids.map(id =>
          this.supabase.client.from('inventory_items').delete().eq('id', id)
        )
      );
      const firstError = results.find(r => r.error)?.error;
      await this.loadItems();
      if (firstError) {
        this.error.set(firstError.message);
        return { success: false, error: firstError.message };
      }
      return { success: true, data: undefined };
    } catch {
      const msg = 'An unexpected error occurred during the bulk delete.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  // =========================================================================
  // Movement History
  // =========================================================================

  /**
   * Load stock movement history for a specific inventory item,
   * ordered most-recent first.
   */
  async loadMovements(itemId: string): Promise<InventoryMovement[]> {
    const { data, error } = await this.supabase.client
      .from('inventory_movements')
      .select('*')
      .eq('item_id', itemId)
      .order('created_at', { ascending: false });

    if (error) {
      console.warn('[InventoryService] Failed to load movements:', error.message);
      return [];
    }

    return (data ?? []) as InventoryMovement[];
  }

  /**
   * Load the most recent N stock movements across all items, joining the parent
   * item for display. Used by the global "Recent Movements" page.
   *
   * Tries the embedded FK select first; if PostgREST cannot resolve the
   * relationship (e.g. stale schema cache), falls back to a separate items
   * query and joins client-side.
   */
  async loadRecentMovements(limit = 100): Promise<RecentMovement[]> {
    // 1st attempt – use the FK embed for a single round-trip.
    const embedded = await this.supabase.client
      .from('inventory_movements')
      .select('*, inventory_items(name, sku, unit)')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!embedded.error && embedded.data) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (embedded.data as any[]).map(row => {
        const { inventory_items, ...rest } = row;
        return { ...rest, item: inventory_items ?? null } as RecentMovement;
      });
    }

    // Fallback – PostgREST didn't expose the relationship. Do two queries and
    // join client-side so the page still works.
    console.warn(
      '[InventoryService] FK-embedded select failed, falling back to manual join:',
      embedded.error?.message,
    );

    const { data: movements, error } = await this.supabase.client
      .from('inventory_movements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.warn('[InventoryService] Failed to load recent movements:', error.message);
      return [];
    }

    // Build a lookup table of the items referenced by this batch.
    const rows = (movements ?? []) as InventoryMovement[];
    const itemIds = [...new Set(rows.map(r => r.item_id))];
    const itemMap = new Map<string, { name: string; sku: string | null; unit: string }>();

    if (itemIds.length > 0) {
      const { data: items } = await this.supabase.client
        .from('inventory_items')
        .select('id, name, sku, unit')
        .in('id', itemIds);

      for (const item of (items ?? []) as Array<{
        id: string; name: string; sku: string | null; unit: string;
      }>) {
        itemMap.set(item.id, { name: item.name, sku: item.sku, unit: item.unit });
      }
    }

    return rows.map(m => ({ ...m, item: itemMap.get(m.item_id) ?? null }));
  }

  /**
   * Inserts a movement record. Fire-and-forget — errors are logged but do not
   * propagate. The `user_id` is resolved from the current auth session.
   */
  private logMovement(payload: {
    item_id: string;
    delta: number;
    quantity_before: number;
    quantity_after: number;
    source: InventoryMovementSource;
    reference?: string | null;
    note?: string | null;
  }): void {
    const userId = this.supabase.currentUser()?.id ?? null;

    void this.supabase.client
      .from('inventory_movements')
      .insert({
        item_id: payload.item_id,
        user_id: userId,
        delta: payload.delta,
        quantity_before: payload.quantity_before,
        quantity_after: payload.quantity_after,
        source: payload.source,
        reference: payload.reference ?? null,
        note: payload.note ?? null,
      })
      .then(({ error }) => {
        if (error) {
          console.warn('[InventoryService] Failed to log movement:', error.message);
        }
      });
  }
}
