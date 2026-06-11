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

interface AtomicCreatePurchaseOrderRpcResponse {
  readonly purchase_order_id: string;
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
}
