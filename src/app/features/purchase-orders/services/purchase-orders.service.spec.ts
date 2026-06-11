import { describe, expect, it } from 'vitest';
import {
  computeRemainingQuantity,
  toPurchaseOrderItemBalance,
} from '../purchase-orders.models';

describe('Purchase order contracts', () => {
  it('computes remaining quantity from ordered and allocated totals', () => {
    expect(computeRemainingQuantity(10, 4)).toBe(6);
    expect(computeRemainingQuantity(5, 8)).toBe(0);
  });

  it('maps PO balance DTOs and derives remaining quantity when missing', () => {
    const mapped = toPurchaseOrderItemBalance({
      purchase_order_item_id: 'poi-1',
      purchase_order_id: 'po-1',
      inventory_item_id: 'inv-1',
      ordered_quantity: '7',
      allocated_quantity: '2',
      remaining_quantity: null,
    });

    expect(mapped).toEqual({
      purchaseOrderItemId: 'poi-1',
      purchaseOrderId: 'po-1',
      inventoryItemId: 'inv-1',
      orderedQuantity: 7,
      allocatedQuantity: 2,
      remainingQuantity: 5,
    });
  });
});
