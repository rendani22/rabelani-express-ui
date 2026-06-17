import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseService } from '../../../shared/services/supabase.service';
import { PurchaseOrderCrudService } from './purchase-order-crud.service';

try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
  // Already initialized by Angular test runner.
}

describe('PurchaseOrderCrudService', () => {
  let service: PurchaseOrderCrudService;
  const rpc = vi.fn();
  const from = vi.fn();

  beforeEach(() => {
    rpc.mockReset();
    from.mockReset();

    TestBed.configureTestingModule({
      providers: [
        PurchaseOrderCrudService,
        {
          provide: SupabaseService,
          useValue: {
            client: {
              rpc,
              from,
            },
          },
        },
      ],
    });

    service = TestBed.inject(PurchaseOrderCrudService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('creates purchase order with items using atomic rpc', async () => {
    const single = vi.fn().mockResolvedValue({ data: { purchase_order_id: 'po-1' }, error: null });
    rpc.mockReturnValue({ single });

    const result = await service.createPurchaseOrder({
      poNumber: ' PO-1001 ',
      items: [
        { inventoryItemId: ' inv-1 ', orderedQuantity: 3 },
        { inventoryItemId: 'inv-2', orderedQuantity: 2 },
      ],
    });

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('create_purchase_order_with_items', {
      p_po_number: 'PO-1001',
      p_items: [
        { inventory_item_id: 'inv-1', ordered_quantity: 3 },
        { inventory_item_id: 'inv-2', ordered_quantity: 2 },
      ],
    });
    expect(single).toHaveBeenCalledTimes(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns rpc error message when atomic create fails', async () => {
    rpc.mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Duplicate PO number' } }),
    });

    const result = await service.createPurchaseOrder({
      poNumber: 'PO-1001',
      items: [{ inventoryItemId: 'inv-1', orderedQuantity: 3 }],
    });

    expect(result).toEqual({ success: false, error: 'Duplicate PO number' });
  });

  it('maps update payload to rpc contract', async () => {
    const single = vi.fn().mockResolvedValue({ data: { purchase_order_id: 'po-1' }, error: null });
    rpc.mockReturnValue({ single });

    const result = await service.updatePurchaseOrder({
      purchaseOrderId: ' po-1 ',
      poNumber: ' PO-2001 ',
      items: [{ purchaseOrderItemId: ' poi-1 ', orderedQuantity: 8 }],
    });

    expect(result).toEqual({ success: true });
    expect(rpc).toHaveBeenCalledWith('update_purchase_order_with_items', {
      p_purchase_order_id: 'po-1',
      p_po_number: 'PO-2001',
      p_items: [{ purchase_order_item_id: 'poi-1', ordered_quantity: 8 }],
    });
    expect(single).toHaveBeenCalledTimes(1);
  });

  it('returns rpc error message when update fails', async () => {
    rpc.mockReturnValue({
      single: vi
        .fn()
        .mockResolvedValue({ data: null, error: { message: 'A purchase order with this number already exists' } }),
    });

    const result = await service.updatePurchaseOrder({
      purchaseOrderId: 'po-1',
      poNumber: 'PO-2001',
      items: [{ purchaseOrderItemId: 'poi-1', orderedQuantity: 8 }],
    });

    expect(result).toEqual({
      success: false,
      error: 'A purchase order with this number already exists',
    });
  });

  it('loads editable PO payload for modal', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'po-1',
        po_number: ' PO-2001 ',
        items: [
          {
            id: 'poi-1',
            inventory_item_id: 'inv-1',
            ordered_quantity: '10',
            balances: [{ allocated_quantity: '3' }],
          },
        ],
      },
      error: null,
    });
    const poEq = vi.fn().mockReturnValue({ maybeSingle });
    const poSelect = vi.fn().mockReturnValue({ eq: poEq });

    const pkgIs = vi.fn().mockResolvedValue({
      data: [{ items: [{ quantity: '5', inventory_item_id: 'inv-1' }] }],
      error: null,
    });
    const pkgEq = vi.fn().mockReturnValue({ is: pkgIs });
    const pkgSelect = vi.fn().mockReturnValue({ eq: pkgEq });

    from.mockImplementation((table: string) =>
      table === 'purchase_orders' ? { select: poSelect } : { select: pkgSelect }
    );

    const result = await service.getPurchaseOrderForEdit(' po-1 ');

    expect(result).toEqual({
      success: true,
      data: {
        purchaseOrderId: 'po-1',
        poNumber: 'PO-2001',
        items: [
          {
            purchaseOrderItemId: 'poi-1',
            inventoryItemId: 'inv-1',
            orderedQuantity: 10,
            minAllowedQuantity: 5,
          },
        ],
      },
    });
    expect(from).toHaveBeenNthCalledWith(1, 'purchase_orders');
    expect(from).toHaveBeenNthCalledWith(2, 'packages');
  });

  it('returns load-edit query errors', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Permission denied' },
    });
    const poEq = vi.fn().mockReturnValue({ maybeSingle });
    const poSelect = vi.fn().mockReturnValue({ eq: poEq });

    from.mockImplementation((table: string) =>
      table === 'purchase_orders' ? { select: poSelect } : { select: vi.fn() }
    );

    const result = await service.getPurchaseOrderForEdit('po-1');

    expect(result).toEqual({ success: false, error: 'Permission denied' });
  });
});
