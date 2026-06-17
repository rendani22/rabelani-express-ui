import { Injectable, inject } from '@angular/core';
import { SupabaseService } from '../../../shared/services/supabase.service';

export interface CreatePurchaseOrderInput {
  readonly poNumber: string;
  readonly items: readonly CreatePurchaseOrderItemInput[];
}

export interface CreatePurchaseOrderItemInput {
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
}

export interface PurchaseOrderCrudResult {
  readonly success: boolean;
  readonly error?: string;
}

export interface UpdatePurchaseOrderInput {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly items: readonly UpdatePurchaseOrderItemInput[];
}

export interface UpdatePurchaseOrderItemInput {
  readonly purchaseOrderItemId: string;
  readonly orderedQuantity: number;
}

export interface PurchaseOrderEditLine {
  readonly purchaseOrderItemId: string;
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
  readonly minAllowedQuantity: number;
}

export interface PurchaseOrderEditPayload {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly items: readonly PurchaseOrderEditLine[];
}

export type PurchaseOrderCrudDataResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

interface AtomicCreatePurchaseOrderRpcResponse {
  readonly purchase_order_id: string;
}

interface AtomicUpdatePurchaseOrderRpcResponse {
  readonly purchase_order_id: string;
}

interface PurchaseOrderForEditRow {
  readonly id: string;
  readonly po_number: string;
  readonly items: readonly PurchaseOrderForEditItemRow[];
}

interface PurchaseOrderForEditItemRow {
  readonly id: string;
  readonly inventory_item_id: string;
  readonly ordered_quantity: number | string;
  readonly balances?: readonly { allocated_quantity: number | string }[] | null;
}

interface PackageItemsByPoNumberRow {
  readonly items?: readonly {
    readonly quantity: number | string;
    readonly inventory_item_id?: string | null;
  }[] | null;
}

@Injectable()
export class PurchaseOrderCrudService {
  private readonly supabase = inject(SupabaseService);

  async createPurchaseOrder(input: CreatePurchaseOrderInput): Promise<PurchaseOrderCrudResult> {
    const poNumber = input.poNumber.trim();
    const items = input.items
      .map(item => ({
        inventoryItemId: item.inventoryItemId.trim(),
        orderedQuantity: Number(item.orderedQuantity),
      }))
      .filter(item => item.inventoryItemId.length > 0 && item.orderedQuantity > 0);

    if (!poNumber) {
      return { success: false, error: 'PO number is required' };
    }

    if (items.length === 0) {
      return { success: false, error: 'At least one PO line is required' };
    }

    const { data, error } = await this.supabase.client.rpc('create_purchase_order_with_items', {
      p_po_number: poNumber,
      p_items: items.map(item => ({
        inventory_item_id: item.inventoryItemId,
        ordered_quantity: item.orderedQuantity,
      })),
    }).single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!(data as AtomicCreatePurchaseOrderRpcResponse | null)?.purchase_order_id) {
      return { success: false, error: 'Failed to create purchase order' };
    }

    return { success: true };
  }

  async updatePurchaseOrder(input: UpdatePurchaseOrderInput): Promise<PurchaseOrderCrudResult> {
    const purchaseOrderId = input.purchaseOrderId.trim();
    const poNumber = input.poNumber.trim();
    const items = input.items
      .map(item => ({
        purchaseOrderItemId: item.purchaseOrderItemId.trim(),
        orderedQuantity: Number(item.orderedQuantity),
      }))
      .filter(item => item.purchaseOrderItemId.length > 0 && item.orderedQuantity > 0);

    if (!purchaseOrderId) {
      return { success: false, error: 'Purchase order id is required' };
    }

    if (!poNumber) {
      return { success: false, error: 'PO number is required' };
    }

    if (items.length === 0) {
      return { success: false, error: 'At least one PO line is required' };
    }

    const { data, error } = await this.supabase.client.rpc('update_purchase_order_with_items', {
      p_purchase_order_id: purchaseOrderId,
      p_po_number: poNumber,
      p_items: items.map(item => ({
        purchase_order_item_id: item.purchaseOrderItemId,
        ordered_quantity: item.orderedQuantity,
      })),
    }).single();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!(data as AtomicUpdatePurchaseOrderRpcResponse | null)?.purchase_order_id) {
      return { success: false, error: 'Failed to update purchase order' };
    }

    return { success: true };
  }

  async getPurchaseOrderForEdit(
    purchaseOrderId: string
  ): Promise<PurchaseOrderCrudDataResult<PurchaseOrderEditPayload>> {
    const normalizedPurchaseOrderId = purchaseOrderId.trim();
    if (!normalizedPurchaseOrderId) {
      return { success: false, error: 'Purchase order id is required' };
    }

    const { data, error } = await this.supabase.client
      .from('purchase_orders')
      .select(`
        id,
        po_number,
        items:purchase_order_items(
          id,
          inventory_item_id,
          ordered_quantity,
          balances:purchase_order_item_balances(
            allocated_quantity
          )
        )
      `)
      .eq('id', normalizedPurchaseOrderId)
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }

    if (!data) {
      return { success: false, error: 'Purchase order not found' };
    }

    const poRow = data as PurchaseOrderForEditRow;
    const poNumber = poRow.po_number.trim();

    const consumedByInventoryItemId = new Map<string, number>();
    if (poNumber) {
      const { data: packageRows, error: packageRowsError } = await this.supabase.client
        .from('packages')
        .select('items:package_items(quantity, inventory_item_id)')
        .eq('po_number', poNumber)
        .is('deleted_at', null);

      if (packageRowsError) {
        return { success: false, error: packageRowsError.message };
      }

      for (const pkg of (packageRows ?? []) as readonly PackageItemsByPoNumberRow[]) {
        for (const item of pkg.items ?? []) {
          if (!item.inventory_item_id) continue;
          const current = consumedByInventoryItemId.get(item.inventory_item_id) ?? 0;
          consumedByInventoryItemId.set(
            item.inventory_item_id,
            current + (Number(item.quantity) || 0)
          );
        }
      }
    }

    const items: PurchaseOrderEditLine[] = (poRow.items ?? []).map(line => {
      const orderedQuantity = Number(line.ordered_quantity) || 0;
      const allocatedQuantity = Number(line.balances?.[0]?.allocated_quantity ?? 0) || 0;
      const consumedQuantity = consumedByInventoryItemId.get(line.inventory_item_id) ?? 0;
      const minAllowedQuantity = Math.min(
        orderedQuantity,
        Math.max(allocatedQuantity, consumedQuantity)
      );

      return {
        purchaseOrderItemId: line.id,
        inventoryItemId: line.inventory_item_id,
        orderedQuantity,
        minAllowedQuantity,
      };
    });

    return {
      success: true,
      data: {
        purchaseOrderId: poRow.id,
        poNumber,
        items,
      },
    };
  }
}
