import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../../shared/services/supabase.service';
import { InventoryItem, Package } from '../../../core';
import {
  PurchaseOrder,
  PurchaseOrderStats,
  PurchaseOrderInventoryRef,
  derivePurchaseOrderStatus,
  computeCompletionPercentage,
  computeOrderBreakdown,
  PurchaseOrderFilters,
  PurchaseOrderSource,
  computePurchaseOrderCreatedCompletionPercentage,
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
        .order('created_at', { ascending: false });

      if (ordersError) {
        this.error.set(ordersError.message);
        return;
      }

      const orders = (rawOrders ?? []) as PurchaseOrderRow[];
      const poNumbers = orders.map(order => order.po_number);

      // PO-item ids (for allocations) and receiver ids (for customer hydration)
      const allItemIds = orders.flatMap(order => (order.items ?? []).map(i => i.id));
      const receiverIds = Array.from(
        new Set(
          orders
            .map(order => order.receiver_id)
            .filter((id): id is string => !!id)
        )
      );

      // ── Wave 2: independent fetches in parallel ─────────────────────────────
      // Allocations, customers, and ALL packages carrying a po_number are
      // mutually independent once we have the PO rows, so fetch them together
      // instead of one-after-another. The single packages query replaces the
      // previous first-class + order-created pair (and its brittle NOT IN filter).
      const [allocationsResult, receiversResult, packagesResult] = await Promise.all([
        allItemIds.length > 0
          ? this.supabase.client
              .from('purchase_order_item_allocations')
              .select('purchase_order_item_id, allocated_quantity')
              .in('purchase_order_item_id', allItemIds)
          : Promise.resolve({ data: [] as AllocationRow[], error: null }),
        receiverIds.length > 0
          ? this.supabase.client
              .from('receiver_profiles')
              .select('id, name, surname, email')
              .in('id', receiverIds)
          : Promise.resolve({ data: [] as ReceiverProfileRow[], error: null }),
        this.supabase.client
          .from('packages')
          .select('*, items:package_items(id, quantity, description, inventory_item_id)')
          .not('po_number', 'is', null)
          .is('deleted_at', null)
          .order('created_at', { ascending: false }),
      ]);

      // Allocations — best-effort (treated as 0 when unavailable, as before)
      const allocationsByPoItemId = new Map<string, number>();
      for (const alloc of (allocationsResult.data ?? []) as AllocationRow[]) {
        const current = allocationsByPoItemId.get(alloc.purchase_order_item_id) ?? 0;
        allocationsByPoItemId.set(
          alloc.purchase_order_item_id,
          current + (Number(alloc.allocated_quantity) || 0)
        );
      }

      // Customers (receiver profiles)
      if (receiversResult.error) {
        this.error.set(receiversResult.error.message);
        return;
      }
      const receiverMap = new Map<string, ReceiverProfileRow>();
      for (const receiver of (receiversResult.data ?? []) as ReceiverProfileRow[]) {
        receiverMap.set(receiver.id, receiver);
      }

      // Packages — bucket every po_number-carrying package by its PO number
      if (packagesResult.error) {
        this.error.set(packagesResult.error.message);
        return;
      }
      const packagesByPoNumber = new Map<string, Package[]>();
      for (const pkg of (packagesResult.data ?? []) as Package[]) {
        const poNumber = pkg.po_number;
        if (!poNumber) continue;
        if (!packagesByPoNumber.has(poNumber)) {
          packagesByPoNumber.set(poNumber, []);
        }
        packagesByPoNumber.get(poNumber)!.push(pkg);
      }

      // ── Wave 3: a single inventory fetch for every referenced item ──────────
      // Union of inventory ids referenced by PO items and by package items, so
      // the synthetic order-PO block below needs no further round-trip.
      const inventoryItemIds = Array.from(
        new Set<string>([
          ...orders.flatMap(order =>
            (order.items ?? [])
              .map(item => item.inventory_item_id)
              .filter((id): id is string => !!id)
          ),
          ...Array.from(packagesByPoNumber.values()).flat().flatMap(pkg =>
            (pkg.items ?? [])
              .map(item => item.inventory_item_id)
              .filter((id): id is string => !!id)
          ),
        ])
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
             const orderedQuantity = Number(item.ordered_quantity);
             const allocatedQuantity = allocationsByPoItemId.get(item.id) ?? 0;
             const remainingQuantity = Math.max(0, orderedQuantity - allocatedQuantity);
             const agg = refsByInventory.get(item.inventory_item_id) ?? {
               orderedQty: 0,
               allocatedQty: 0,
               remainingQty: 0,
               packageIds: new Set<string>(),
             };
             agg.orderedQty += orderedQuantity;
             agg.allocatedQty += allocatedQuantity;
             agg.remainingQty += remainingQuantity;

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

          const receiver = order.receiver_id ? receiverMap.get(order.receiver_id) ?? null : null;
          const poValue =
            order.po_value === null || order.po_value === undefined
              ? null
              : Number(order.po_value);

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
              packages
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
          };
        })
      );

      // ── Append order-created POs ────────────────────────────────────────────
      // Collect all po_numbers that are NOT in the purchase_orders table
      const orderOnlyPoNumbers = Array.from(packagesByPoNumber.keys()).filter(
        poNum => !poNumbers.includes(poNum)
      );

      if (orderOnlyPoNumbers.length > 0) {
        // Inventory for these packages was already hydrated in the wave-3 fetch.
        const syntheticPOs: PurchaseOrder[] = orderOnlyPoNumbers.map(poNum => {
          const packages = packagesByPoNumber.get(poNum) ?? [];

          // Build inventory refs from package items (no ordered/allocated metadata available)
          const invRefMap = new Map<string, { qty: number; packageIds: Set<string> }>();
          for (const pkg of packages) {
            for (const pkgItem of pkg.items ?? []) {
              if (!pkgItem.inventory_item_id) continue;
              const agg = invRefMap.get(pkgItem.inventory_item_id) ?? {
                qty: 0,
                packageIds: new Set<string>(),
              };
              agg.qty += Number(pkgItem.quantity) || 0;
              agg.packageIds.add(pkg.id);
              invRefMap.set(pkgItem.inventory_item_id, agg);
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
            })
          );

          const totalItems = packages.reduce(
            (sum, pkg) =>
              sum + (pkg.items ?? []).reduce((s, i) => s + (Number(i.quantity) || 0), 0),
            0
          );

          const dates = packages.map(p => p.created_at).sort();
          const updatedDates = packages.map(p => p.updated_at ?? p.created_at).sort();

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
          };
        });

        this._allPurchaseOrders.update(existing => [
          ...existing,
          ...syntheticPOs.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          ),
        ]);
      }
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
  readonly document_url?: string | null;
  readonly receiver_id?: string | null;
  readonly po_value?: number | string | null;
  readonly po_date?: string | null;
  readonly details?: string | null;
  readonly created_at: string;
  readonly updated_at: string;
  readonly items?: readonly PurchaseOrderItemRow[];
}

interface ReceiverProfileRow {
  readonly id: string;
  readonly name: string;
  readonly surname: string;
  readonly email: string;
}

interface AllocationRow {
  readonly purchase_order_item_id: string;
  readonly allocated_quantity: number | string;
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
