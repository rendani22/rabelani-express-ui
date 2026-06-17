import { TestBed, getTestBed } from '@angular/core/testing';
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseService } from '../../../shared/services/supabase.service';
import { PurchaseOrdersService } from './purchase-orders.service';
import {
  computeRemainingQuantity,
  toPurchaseOrderItemBalance,
  computeCompletionPercentage,
  computeInventoryCompletionPercentage,
  computeInventoryProgress,
  computeOrderBreakdown,
  derivePurchaseOrderStatus,
} from '../purchase-orders.models';
import type { Package } from '../../../core';

try {
  getTestBed().initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting());
} catch {
  // Already initialized by Angular test runner.
}

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

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function buildPackagesQuery(response: unknown) {
    const result = Promise.resolve(response);

    return {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      then: result.then.bind(result),
      catch: result.catch.bind(result),
      finally: result.finally.bind(result),
    };
  }

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
    const allocationsResponse = {
      data: [
        {
          purchase_order_item_id: 'poi-1',
          allocated_quantity: 2,
        },
      ],
      error: null,
    };
    let packagesCallCount = 0;

    from.mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          select: purchaseOrdersSelect,
          order: vi.fn().mockResolvedValue(purchaseOrdersResponse),
        };
      }

      if (table === 'purchase_order_item_allocations') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(allocationsResponse),
        };
      }

      if (table === 'inventory_items') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue(inventoryResponse),
        };
      }

      if (table === 'packages') {
        packagesCallCount += 1;
        return buildPackagesQuery(
          packagesCallCount === 1
            ? packagesResponse
            : { data: [], error: null }
        );
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await service.load();

    expect(from).toHaveBeenNthCalledWith(1, 'purchase_orders');
    expect(service.filteredPurchaseOrders()).toHaveLength(1);
    expect(service.filteredPurchaseOrders()[0]).toMatchObject({
      poNumber: 'PO-1',
      derivedStatus: 'draft',
      totalItems: 5,
      completionPercentage: 0,
      orderBreakdown: { total: 1, terminal: 0, active: 0, draft: 1 },
      inventoryRefs: [
        {
          orderedQuantity: 5,
          allocatedQuantity: 2,
          remainingQuantity: 3,
        },
      ],
    });
  });

  it('keeps order-derived PO completion based on linked package statuses', async () => {
    const orderPackagesResponse = {
      data: [
        {
          id: 'pkg-1',
          reference: 'PKG-1',
          receiver_email: 'receiver1@example.com',
          notes: null,
          status: 'delivered',
          created_at: '2026-06-11T10:30:00.000Z',
          updated_at: '2026-06-11T10:45:00.000Z',
          po_number: 'PO-ORDER-1',
          items: [
            {
              id: 'pkg-item-1',
              quantity: 2,
              description: 'Widget',
              inventory_item_id: 'inv-1',
            },
          ],
        },
        {
          id: 'pkg-2',
          reference: 'PKG-2',
          receiver_email: 'receiver2@example.com',
          notes: null,
          status: 'pending',
          created_at: '2026-06-11T11:30:00.000Z',
          updated_at: '2026-06-11T11:45:00.000Z',
          po_number: 'PO-ORDER-1',
          items: [
            {
              id: 'pkg-item-2',
              quantity: 1,
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
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }

      if (table === 'inventory_items') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({
            data: [{ id: 'inv-1', name: 'Widget', sku: 'WGT-001', unit: 'pcs' }],
            error: null,
          }),
        };
      }

      if (table === 'packages') {
        return buildPackagesQuery(orderPackagesResponse);
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await service.load();

    expect(service.filteredPurchaseOrders()).toHaveLength(1);
    expect(service.filteredPurchaseOrders()[0]).toMatchObject({
      poNumber: 'PO-ORDER-1',
      source: 'order',
      completionPercentage: 50,
      orderBreakdown: { total: 2, terminal: 1, active: 1, draft: 0 },
    });
  });

  it('sets error and aborts when inventory_items query fails', async () => {
    const purchaseOrdersResponse = {
      data: [
        {
          id: 'po-id-1',
          po_number: 'PO-1',
          status: 'draft',
          created_at: '2026-06-11T10:00:00.000Z',
          updated_at: '2026-06-11T11:00:00.000Z',
          items: [{ id: 'poi-1', inventory_item_id: 'inv-1', ordered_quantity: 5 }],
        },
      ],
      error: null,
    };
    const packagesOrder = vi.fn();

    from.mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue(purchaseOrdersResponse),
        };
      }

      if (table === 'purchase_order_item_allocations') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }

      if (table === 'inventory_items') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: null, error: { message: 'Inventory load failed' } }),
        };
      }

      if (table === 'packages') {
        return {
          ...buildPackagesQuery({ data: [], error: null }),
          order: packagesOrder.mockResolvedValue({ data: [], error: null }),
        };
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await service.load();

    expect(service.error()).toBe('Inventory load failed');
    expect(service.filteredPurchaseOrders()).toHaveLength(0);
    expect(packagesOrder).not.toHaveBeenCalled();
  });

  it('sets error and aborts when packages query fails', async () => {
    const purchaseOrdersResponse = {
      data: [
        {
          id: 'po-id-1',
          po_number: 'PO-1',
          status: 'draft',
          created_at: '2026-06-11T10:00:00.000Z',
          updated_at: '2026-06-11T11:00:00.000Z',
          items: [{ id: 'poi-1', inventory_item_id: 'inv-1', ordered_quantity: 5 }],
        },
      ],
      error: null,
    };

    from.mockImplementation((table: string) => {
      if (table === 'purchase_orders') {
        return {
          select: vi.fn().mockReturnThis(),
          order: vi.fn().mockResolvedValue(purchaseOrdersResponse),
        };
      }

      if (table === 'purchase_order_item_allocations') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }

      if (table === 'inventory_items') {
        return {
          select: vi.fn().mockReturnThis(),
          in: vi.fn().mockResolvedValue({ data: [{ id: 'inv-1', name: 'Widget', sku: 'W1' }], error: null }),
        };
      }

      if (table === 'packages') {
        return buildPackagesQuery({ data: null, error: { message: 'Packages load failed' } });
      }

      throw new Error(`Unexpected table ${table}`);
    });

    await service.load();

    expect(service.error()).toBe('Packages load failed');
    expect(service.filteredPurchaseOrders()).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// Model helper unit tests (Task 7)
// ---------------------------------------------------------------------------

function pkg(status: Package['status']): Package {
  return { id: status, status } as unknown as Package;
}

describe('derivePurchaseOrderStatus', () => {
  it('returns draft when package list is empty', () => {
    expect(derivePurchaseOrderStatus([])).toBe('draft');
  });

  it('returns draft when all packages are draft', () => {
    expect(derivePurchaseOrderStatus([pkg('draft'), pkg('draft')])).toBe('draft');
  });

  it('returns completed when all packages are terminal', () => {
    expect(derivePurchaseOrderStatus([pkg('collected'), pkg('delivered'), pkg('returned')])).toBe('completed');
  });

  it('returns in_progress when at least one package is active', () => {
    expect(derivePurchaseOrderStatus([pkg('draft'), pkg('in_transit')])).toBe('in_progress');
  });

  it('returns mixed for a combination that is neither all-terminal nor contains active', () => {
    // draft + returned (but not all terminal, not all draft, no active) → mixed
    expect(derivePurchaseOrderStatus([pkg('draft'), pkg('returned')])).toBe('mixed');
  });
});

describe('computeCompletionPercentage', () => {
  it('returns 0 for an empty list', () => {
    expect(computeCompletionPercentage([])).toBe(0);
  });

  it('returns 0 when no packages are terminal', () => {
    expect(computeCompletionPercentage([pkg('draft'), pkg('pending')])).toBe(0);
  });

  it('returns 100 when all packages are terminal', () => {
    expect(computeCompletionPercentage([pkg('collected'), pkg('delivered')])).toBe(100);
  });

  it('rounds to nearest integer', () => {
    // 1 of 3 terminal → 33.33…% → 33
    expect(computeCompletionPercentage([pkg('collected'), pkg('draft'), pkg('pending')])).toBe(33);
  });
});

describe('computeInventoryProgress', () => {
  it('returns zero totals for an empty list', () => {
    expect(computeInventoryProgress([])).toEqual({
      orderedQuantity: 0,
      allocatedQuantity: 0,
      remainingQuantity: 0,
    });
  });

  it('aggregates ordered, allocated, and remaining quantities across inventory refs', () => {
    expect(
      computeInventoryProgress([
        {
          inventoryItemId: 'inv-1',
          item: null,
          totalQuantity: 5,
          orderedQuantity: 5,
          allocatedQuantity: 2,
          remainingQuantity: 3,
          packageCount: 1,
        },
        {
          inventoryItemId: 'inv-2',
          item: null,
          totalQuantity: 4,
          orderedQuantity: 4,
          allocatedQuantity: 4,
          remainingQuantity: 0,
          packageCount: 1,
        },
      ])
    ).toEqual({
      orderedQuantity: 9,
      allocatedQuantity: 6,
      remainingQuantity: 3,
    });
  });
});

describe('computeInventoryCompletionPercentage', () => {
  it('returns 0 when there is no ordered inventory quantity', () => {
    expect(computeInventoryCompletionPercentage([])).toBe(0);
  });

  it('uses allocated vs ordered inventory quantities for completion', () => {
    expect(
      computeInventoryCompletionPercentage([
        {
          inventoryItemId: 'inv-1',
          item: null,
          totalQuantity: 5,
          orderedQuantity: 5,
          allocatedQuantity: 2,
          remainingQuantity: 3,
          packageCount: 1,
        },
        {
          inventoryItemId: 'inv-2',
          item: null,
          totalQuantity: 4,
          orderedQuantity: 4,
          allocatedQuantity: 4,
          remainingQuantity: 0,
          packageCount: 1,
        },
      ])
    ).toBe(67);
  });

  it('clamps over-allocated inventory to 100 percent', () => {
    expect(
      computeInventoryCompletionPercentage([
        {
          inventoryItemId: 'inv-1',
          item: null,
          totalQuantity: 5,
          orderedQuantity: 5,
          allocatedQuantity: 7,
          remainingQuantity: 0,
          packageCount: 1,
        },
      ])
    ).toBe(100);
  });
});

describe('computeOrderBreakdown', () => {
  it('returns all-zero breakdown for empty list', () => {
    expect(computeOrderBreakdown([])).toEqual({ total: 0, terminal: 0, active: 0, draft: 0 });
  });

  it('buckets packages correctly across all three categories', () => {
    const packages = [
      pkg('draft'),
      pkg('pending'),     // active
      pkg('in_transit'), // active
      pkg('collected'),  // terminal
      pkg('returned'),   // terminal
    ];
    expect(computeOrderBreakdown(packages)).toEqual({
      total: 5,
      terminal: 2,
      active: 2,
      draft: 1,
    });
  });

  it('uses terminal count matching derivePurchaseOrderStatus completed rule', () => {
    const packages = [pkg('collected'), pkg('delivered'), pkg('returned')];
    const breakdown = computeOrderBreakdown(packages);
    expect(breakdown.terminal).toBe(packages.length);
    expect(breakdown.active).toBe(0);
    expect(breakdown.draft).toBe(0);
  });
});
