import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseService } from '../../../shared/services/supabase.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  computeRemainingQuantity,
  toPurchaseOrderItemBalance,
} from '../purchase-orders.models';

describe('Purchase order contracts', () => {
  let service: PurchaseOrdersService;
  const from = vi.fn();

  beforeEach(() => {
    from.mockReset();

    TestBed.configureTestingModule({
      providers: [
        PurchaseOrdersService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              from,
            },
          },
        },
      ],
    });

    service = TestBed.inject(PurchaseOrdersService);
  });

  it('loads purchase orders from purchase_orders table instead of grouping packages by po_number', async () => {
    const purchaseOrdersSelect = vi.fn().mockReturnThis();
    const purchaseOrdersResponse = {
      data: [
        {
          id: 'po-id-1',
          po_number: 'PO-1',
          status: 'draft',
          created_at: '2026-06-11T10:00:00.000Z',
          updated_at: '2026-06-11T11:00:00.000Z',
          items: [
            {
              id: 'poi-1',
              inventory_item_id: 'inv-1',
              ordered_quantity: 5,
              balances: [
                {
                  ordered_quantity: 5,
                  allocated_quantity: 2,
                  remaining_quantity: 3,
                },
              ],
            },
          ],
        },
      ],
      error: null,
    };
    const inventoryResponse = {
      data: [
        {
          id: 'inv-1',
          name: 'Widget',
          sku: 'WGT-001',
          unit: 'pcs',
          category: 'General',
        },
      ],
      error: null,
    };
    const packagesResponse = {
      data: [
        {
          id: 'pkg-1',
          reference: 'PKG-1',
          receiver_email: 'receiver@example.com',
          notes: null,
          status: 'draft',
          created_at: '2026-06-11T10:30:00.000Z',
          updated_at: '2026-06-11T10:45:00.000Z',
          po_number: 'PO-1',
          items: [
            {
              id: 'pkg-item-1',
              quantity: 2,
              description: 'Widget',
              inventory_item_id: 'inv-1',
            },
          ],
        },
      ],
      error: null,
    };

    from.mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          select: purchaseOrdersSelect,
          order: vi.fn().mockResolvedValue(purchaseOrdersResponse),
        };
      }

      if (table === 'inventory_items') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(inventoryResponse),
        };
      }

      if (table === 'packages') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue(packagesResponse),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await service.load();

    expect(from).toHaveBeenNthCalledWith(1, 'purchase_orders');
    expect(purchaseOrdersSelect).toHaveBeenCalledWith(expect.stringContaining('balances:purchase_order_item_balances'));
    expect(service.filteredPurchaseOrders()).toHaveLength(1);
    expect(service.filteredPurchaseOrders()[0]).toMatchObject({
      poNumber: 'PO-1',
      derivedStatus: 'draft',
      totalItems: 5,
      inventoryRefs: [
        {
          orderedQuantity: 5,
          allocatedQuantity: 2,
          remainingQuantity: 3,
        },
      ],
    });
  });

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
