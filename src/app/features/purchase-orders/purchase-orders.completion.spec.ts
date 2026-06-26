import { describe, expect, it } from 'vitest';

import type { Package } from '../../core';
import {
  computePurchaseOrderCreatedCompletionPercentage,
  type PurchaseOrderInventoryRef,
} from './purchase-orders.models';

function pkg(status: Package['status'], items: Array<{ inventory_item_id: string; quantity: number }>): Package {
  return {
    id: `${status}-${items.length}`,
    reference: 'PKG',
    receiver_email: 'receiver@example.com',
    notes: null,
    status,
    created_at: '2026-06-17T10:00:00.000Z',
    items: items.map((item, index) => ({
      id: `${status}-item-${index}`,
      quantity: item.quantity,
      description: 'Item',
      inventory_item_id: item.inventory_item_id,
    })),
  };
}

function ref(inventoryItemId: string, orderedQuantity: number, allocatedQuantity: number): PurchaseOrderInventoryRef {
  return {
    inventoryItemId,
    item: null,
    totalQuantity: orderedQuantity,
    orderedQuantity,
    allocatedQuantity,
    remainingQuantity: Math.max(0, orderedQuantity - allocatedQuantity),
    packageCount: 1,
  };
}

describe('computePurchaseOrderCreatedCompletionPercentage', () => {
  it('uses collected and delivered inventory quantities, not allocation totals', () => {
    const inventoryRefs = [ref('inv-1', 10, 10)];
    const packages = [pkg('pending', [{ inventory_item_id: 'inv-1', quantity: 10 }])];

    expect(computePurchaseOrderCreatedCompletionPercentage(inventoryRefs, packages)).toBe(0);
  });

  it('counts only delivered or collected quantities for tracked PO inventory items', () => {
    const inventoryRefs = [ref('inv-1', 10, 2)];
    const packages = [
      pkg('delivered', [{ inventory_item_id: 'inv-1', quantity: 3 }]),
      pkg('collected', [{ inventory_item_id: 'inv-1', quantity: 2 }]),
      pkg('pending', [{ inventory_item_id: 'inv-1', quantity: 5 }]),
    ];

    expect(computePurchaseOrderCreatedCompletionPercentage(inventoryRefs, packages)).toBe(50);
  });

  it('ignores returned quantities for created purchase-order completion', () => {
    const inventoryRefs = [ref('inv-1', 8, 8)];
    const packages = [pkg('returned', [{ inventory_item_id: 'inv-1', quantity: 8 }])];

    expect(computePurchaseOrderCreatedCompletionPercentage(inventoryRefs, packages)).toBe(0);
  });
});
