import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseService } from '../../../shared/services/supabase.service';
import { PurchaseOrderCrudService } from './purchase-order-crud.service';

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
});
