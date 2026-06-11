import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../../shared/services/supabase.service';
import { Package } from '../../../core/models/package.models';
import { InventoryItem } from '../../../core/models/inventory.models';
import {
  PurchaseOrder,
  PurchaseOrderStats,
  PurchaseOrderInventoryRef,
  computeRemainingQuantity,
  PurchaseOrderFilters,
} from '../purchase-orders.models';

/**
 * Feature-local service for the Purchase Orders section.
 *
 * Loads first-class purchase orders and items from `purchase_orders`, then
 * hydrates linked inventory and package context for display/search behavior.
 */
@Injectable()
export class PurchaseOrdersService {
  private readonly supabase = inject(SupabaseService);

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
      const { data: rawOrders, error: ordersError } = await this.supabase.client
        .from('purchase_orders')
        .select(`
          id,
          po_number,
          status,
          created_at,
          updated_at,
          items:purchase_order_items(
            id,
            inventory_item_id,
            ordered_quantity,
            balances:purchase_order_item_balances(
              ordered_quantity,
              allocated_quantity,
              remaining_quantity
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (ordersError) {
        this.error.set(ordersError.message);
        return;
      }

      const orders = (rawOrders ?? []) as PurchaseOrderRow[];
      if (orders.length === 0) {
        this._allPurchaseOrders.set([]);
        return;
      }

      const poNumbers = orders.map(order => order.po_number);
      const inventoryItemIds = Array.from(
        new Set(
          orders.flatMap(order =>
            (order.items ?? [])
              .map(item => item.inventory_item_id)
              .filter((id): id is string => !!id)
          )
        )
      );

      const inventoryMap = new Map<string, InventoryItem>();
      if (inventoryItemIds.length > 0) {
        const { data: invItems, error: inventoryError } = await this.supabase.client
          .from('inventory_items')
          .select('*')
          .in('id', inventoryItemIds);

        if (inventoryError) {
          this.error.set(inventoryError.message);
          return;
        }

        for (const item of (invItems ?? []) as InventoryItem[]) {
          inventoryMap.set(item.id, item);
        }
      }

      const packagesByPoNumber = new Map<string, Package[]>();
      const { data: rawPackages, error: packagesError } = await this.supabase.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .in('po_number', poNumbers)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (packagesError) {
        this.error.set(packagesError.message);
        return;
      }

      for (const pkg of (rawPackages ?? []) as Package[]) {
        const poNumber = pkg.po_number;
        if (!poNumber) continue;
        if (!packagesByPoNumber.has(poNumber)) {
          packagesByPoNumber.set(poNumber, []);
        }
        packagesByPoNumber.get(poNumber)!.push(pkg);
      }

      this._allPurchaseOrders.set(
        orders.map(order => {
          const packages = packagesByPoNumber.get(order.po_number) ?? [];
          const refsByInventory = new Map<
            string,
            {
              orderedQty: number;
              allocatedQty: number;
              remainingQty: number;
              packageIds: Set<string>;
            }
          >();

          for (const item of order.items ?? []) {
            if (!item.inventory_item_id) continue;
            const balance = item.balances?.[0];
            const orderedQuantity = balance
              ? Number(balance.ordered_quantity)
              : Number(item.ordered_quantity);
            const allocatedQuantity = balance ? Number(balance.allocated_quantity) : 0;
            const remainingQuantity = balance
              ? balance.remaining_quantity === null || balance.remaining_quantity === undefined
                ? computeRemainingQuantity(orderedQuantity, allocatedQuantity)
                : Number(balance.remaining_quantity)
              : orderedQuantity;
            const agg = refsByInventory.get(item.inventory_item_id) ?? {
              orderedQty: 0,
              allocatedQty: 0,
              remainingQty: 0,
              packageIds: new Set<string>(),
            };
            agg.orderedQty += orderedQuantity;
            agg.allocatedQty += allocatedQuantity;
            agg.remainingQty += Math.max(0, remainingQuantity);

            for (const pkg of packages) {
              const hasMatch = (pkg.items ?? []).some(
                pkgItem => pkgItem.inventory_item_id === item.inventory_item_id
              );
              if (hasMatch) agg.packageIds.add(pkg.id);
            }

            refsByInventory.set(item.inventory_item_id, agg);
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
            })
          );

          const totalItems = (order.items ?? []).reduce(
            (sum, item) => sum + Number(item.ordered_quantity),
            0
          );

          return {
            poNumber: order.po_number,
            packages,
            inventoryRefs,
            createdAt: order.created_at,
            updatedAt: order.updated_at,
            derivedStatus: mapPurchaseOrderStatus(order.status),
            totalItems,
          };
        })
      );
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

interface PurchaseOrderRow {
  readonly id: string;
  readonly po_number: string;
  readonly status: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly items?: readonly PurchaseOrderItemRow[];
}

interface PurchaseOrderItemRow {
  readonly id: string;
  readonly inventory_item_id: string;
  readonly ordered_quantity: number | string;
  readonly balances?: readonly PurchaseOrderItemBalanceNestedRow[];
}

interface PurchaseOrderItemBalanceNestedRow {
  readonly ordered_quantity: number | string;
  readonly allocated_quantity: number | string;
  readonly remaining_quantity?: number | string | null;
}

function mapPurchaseOrderStatus(status: string): PurchaseOrder['derivedStatus'] {
  switch (status) {
    case 'completed':
    case 'in_progress':
    case 'draft':
      return status;
    default:
      return 'mixed';
  }
}
