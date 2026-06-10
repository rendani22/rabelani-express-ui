import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../../shared/services/supabase.service';
import { InventoryService } from '../../../core/services/inventory.service';
import { Package } from '../../../core/models/package.models';
import { InventoryItem } from '../../../core/models/inventory.models';
import {
  PurchaseOrder,
  PurchaseOrderStats,
  PurchaseOrderInventoryRef,
  PurchaseOrderFilters,
  derivePurchaseOrderStatus,
} from '../purchase-orders.models';

/**
 * Feature-local service for the Purchase Orders section.
 *
 * Loads all packages that have a `po_number`, groups them by PO, then
 * resolves the linked inventory items via `package_items.inventory_item_id`.
 */
@Injectable()
export class PurchaseOrdersService {
  private readonly supabase = inject(SupabaseService);
  private readonly inventoryService = inject(InventoryService);

  // ============================================================================
  // State
  // ============================================================================

  private readonly _allPurchaseOrders = signal<PurchaseOrder[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /** Filters driving the derived `filteredPurchaseOrders` */
  readonly filters = signal<PurchaseOrderFilters>({ search: '', status: 'all' });

  // ============================================================================
  // Computed
  // ============================================================================

  readonly filteredPurchaseOrders = computed<PurchaseOrder[]>(() => {
    const { search, status } = this.filters();
    let orders = this._allPurchaseOrders();

    if (search?.trim()) {
      const q = search.trim().toLowerCase();
      orders = orders.filter(po =>
        po.poNumber.toLowerCase().includes(q) ||
        po.packages.some(p =>
          p.reference.toLowerCase().includes(q) ||
          p.receiver_email.toLowerCase().includes(q)
        ) ||
        po.inventoryRefs.some(ref =>
          ref.item?.name.toLowerCase().includes(q) ||
          (ref.item?.sku ?? '').toLowerCase().includes(q)
        )
      );
    }

    if (status && status !== 'all') {
      orders = orders.filter(po => po.derivedStatus === status);
    }

    return orders;
  });

  readonly stats = computed<PurchaseOrderStats>(() => {
    const all = this._allPurchaseOrders();
    const uniqueInventoryIds = new Set(
      all.flatMap(po => po.inventoryRefs.map(r => r.inventoryItemId))
    );
    return {
      totalPOs: all.length,
      activePOs: all.filter(po => po.derivedStatus === 'in_progress').length,
      completedPOs: all.filter(po => po.derivedStatus === 'completed').length,
      draftPOs: all.filter(po => po.derivedStatus === 'draft').length,
      totalPackages: all.reduce((s, po) => s + po.packages.length, 0),
      totalInventoryItems: uniqueInventoryIds.size,
    };
  });

  // ============================================================================
  // Data loading
  // ============================================================================

  async load(): Promise<void> {
    this.isLoading.set(true);
    this.error.set(null);

    try {
      // 1. Load all packages that have a po_number, with their items
      const { data: rawPackages, error: pkgError } = await this.supabase.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .not('po_number', 'is', null)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (pkgError) {
        this.error.set(pkgError.message);
        return;
      }

      const packages = (rawPackages ?? []) as Package[];

      // 2. Collect all unique inventory_item_ids across all package items
      const inventoryItemIds = Array.from(
        new Set(
          packages.flatMap(pkg =>
            (pkg.items ?? [])
              .map(item => item.inventory_item_id)
              .filter((id): id is string => !!id)
          )
        )
      );

      // 3. Fetch referenced inventory items in one query
      let inventoryMap = new Map<string, InventoryItem>();
      if (inventoryItemIds.length > 0) {
        const { data: invItems } = await this.supabase.client
          .from('inventory_items')
          .select('*')
          .in('id', inventoryItemIds);

        inventoryMap = new Map(
          (invItems ?? []).map((item: InventoryItem) => [item.id, item])
        );
      }

      // 4. Group packages by po_number
      const groupMap = new Map<string, Package[]>();
      for (const pkg of packages) {
        const po = pkg.po_number!;
        if (!groupMap.has(po)) groupMap.set(po, []);
        groupMap.get(po)!.push(pkg);
      }

      // 5. Build PurchaseOrder objects
      const purchaseOrders: PurchaseOrder[] = [];
      for (const [poNumber, pkgs] of groupMap.entries()) {
        // Build inventory refs: aggregate by inventory_item_id
        const refMap = new Map<string, { qty: number; pkgCount: number }>();
        for (const pkg of pkgs) {
          for (const item of pkg.items ?? []) {
            if (!item.inventory_item_id) continue;
            const existing = refMap.get(item.inventory_item_id) ?? { qty: 0, pkgCount: 0 };
            refMap.set(item.inventory_item_id, {
              qty: existing.qty + item.quantity,
              pkgCount: existing.pkgCount + 1,
            });
          }
        }

        const inventoryRefs: PurchaseOrderInventoryRef[] = Array.from(refMap.entries()).map(
          ([id, agg]) => ({
            inventoryItemId: id,
            item: inventoryMap.get(id) ?? null,
            totalQuantity: agg.qty,
            packageCount: agg.pkgCount,
          })
        );

        const allDates = pkgs.map(p => p.created_at).sort();
        const allUpdated = pkgs.map(p => p.updated_at ?? p.created_at).sort();
        const totalItems = pkgs.reduce((s, p) => s + (p.items ?? []).length, 0);

        purchaseOrders.push({
          poNumber,
          packages: pkgs,
          inventoryRefs,
          createdAt: allDates[0],
          updatedAt: allUpdated[allUpdated.length - 1],
          derivedStatus: derivePurchaseOrderStatus(pkgs),
          totalItems,
        });
      }

      // Sort by most recent first
      purchaseOrders.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      this._allPurchaseOrders.set(purchaseOrders);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : 'Failed to load purchase orders');
    } finally {
      this.isLoading.set(false);
    }
  }

  // ============================================================================
  // Filter helpers
  // ============================================================================

  setSearch(search: string): void {
    this.filters.update(f => ({ ...f, search }));
  }

  setStatusFilter(status: PurchaseOrderFilters['status']): void {
    this.filters.update(f => ({ ...f, status }));
  }
}
