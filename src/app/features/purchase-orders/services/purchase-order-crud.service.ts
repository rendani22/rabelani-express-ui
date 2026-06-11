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

    const { data: createdOrder, error: orderError } = await this.supabase.client
      .from('purchase_orders')
      .insert({ po_number: poNumber, status: 'draft' })
      .select('id')
      .single();

    if (orderError || !createdOrder) {
      return { success: false, error: orderError?.message ?? 'Failed to create purchase order' };
    }

    const rows = items.map(item => ({
      purchase_order_id: createdOrder.id,
      inventory_item_id: item.inventoryItemId,
      ordered_quantity: item.orderedQuantity,
    }));

    const { error: itemsError } = await this.supabase.client
      .from('purchase_order_items')
      .insert(rows);

    if (itemsError) {
      await this.supabase.client
        .from('purchase_orders')
        .delete()
        .eq('id', createdOrder.id);

      return { success: false, error: itemsError.message };
    }

    return { success: true };
  }
}
