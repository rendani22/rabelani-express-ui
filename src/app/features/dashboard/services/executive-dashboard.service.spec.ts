import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ExecutiveDashboardService } from './executive-dashboard.service';
import { SupabaseService } from '../../../shared/services/supabase.service';

/**
 * A thenable query-builder stub: every chainable method returns `this`, and
 * awaiting it resolves to the configured `{ data, error }` for its table.
 */
function makeClient(resultsByTable: Record<string, { data: unknown; error: unknown }>) {
  const builder = (table: string) => {
    const result = resultsByTable[table] ?? { data: [], error: null };
    const self: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'is', 'limit', 'eq', 'order', 'gte', 'lte']) {
      self[method] = () => self;
    }
    self['then'] = (resolve: (v: unknown) => unknown) => resolve(result);
    return self;
  };
  return { from: vi.fn((table: string) => builder(table)) };
}

describe('ExecutiveDashboardService', () => {
  function setup(resultsByTable: Record<string, { data: unknown; error: unknown }>) {
    const mockSupabase = { client: makeClient(resultsByTable) };
    TestBed.configureTestingModule({
      providers: [
        ExecutiveDashboardService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });
    return TestBed.inject(ExecutiveDashboardService);
  }

  const nowIso = new Date().toISOString();

  // Two orders: one ready-for-collection (pipeline), one collected (realized).
  // Prices: widget = 100, gadget = 50.
  const packages = [
    {
      id: 'pkg-1',
      reference: 'REF-1',
      receiver_email: 'alice@example.com',
      status: 'ready_for_collection',
      created_at: nowIso,
      updated_at: nowIso,
      received_at: nowIso,
      collected_at: null,
      items: [
        { quantity: 2, description: 'Widget', inventory_item_id: 'inv-widget' }, // 2 × 100 = 200
        { quantity: 1, description: 'Gadget', inventory_item_id: 'inv-gadget' }, // 1 × 50 = 50
      ],
    },
    {
      id: 'pkg-2',
      reference: 'REF-2',
      receiver_email: 'bob@example.com',
      status: 'collected',
      created_at: nowIso,
      updated_at: nowIso,
      received_at: nowIso,
      collected_at: nowIso,
      items: [
        { quantity: 3, description: 'Widget', inventory_item_id: 'inv-widget' }, // 3 × 100 = 300
      ],
    },
  ];

  const inventory = [
    { id: 'inv-widget', unit_price: 100 },
    { id: 'inv-gadget', unit_price: 50 },
  ];

  it('counts only collected orders as realized revenue, ready-for-collection as pipeline', async () => {
    const service = setup({
      packages: { data: packages, error: null },
      inventory_items: { data: inventory, error: null },
    });

    await service.load();

    const summary = service.summary();
    expect(summary.totalOrders).toBe(1); // only pkg-2 (collected)
    expect(summary.totalValue).toBe(300); // realized
    expect(summary.avgOrderValue).toBe(300);
    expect(summary.pipelineValue).toBe(250); // pkg-1 (ready for collection)
    expect(summary.pipelineOrders).toBe(1);
    expect(summary.truncated).toBe(false);
  });

  it('exposes an all-time KPI matching the realized (collected) value', async () => {
    const service = setup({
      packages: { data: packages, error: null },
      inventory_items: { data: inventory, error: null },
    });

    await service.load();

    const all = service.kpis().find(k => k.key === 'all');
    expect(all).toBeDefined();
    expect(all!.value).toBe(300);
    expect(all!.orders).toBe(1);
    expect(all!.deltaPercent).toBeNull(); // no comparison for all-time
  });

  it('ranks top items by collected value only (pipeline excluded)', async () => {
    const service = setup({
      packages: { data: packages, error: null },
      inventory_items: { data: inventory, error: null },
    });

    await service.load();

    const items = service.topItems();
    expect(items).toHaveLength(1); // Gadget was only on the ready-for-collection order
    expect(items[0]).toMatchObject({ description: 'Widget', value: 300, quantity: 3, orders: 1 });
  });

  it('ranks top customers by collected value only', async () => {
    const service = setup({
      packages: { data: packages, error: null },
      inventory_items: { data: inventory, error: null },
    });

    await service.load();

    const customers = service.topCustomers();
    expect(customers).toHaveLength(1); // alice's order is ready-for-collection, not collected
    expect(customers[0]).toMatchObject({ email: 'bob@example.com', value: 300, orders: 1 });
  });

  it('treats collected items with no priced inventory as zero value', async () => {
    const service = setup({
      packages: {
        data: [
          {
            ...packages[1], // collected order
            items: [{ quantity: 5, description: 'Mystery', inventory_item_id: null }],
          },
        ],
        error: null,
      },
      inventory_items: { data: [], error: null },
    });

    await service.load();

    expect(service.summary().totalValue).toBe(0);
    expect(service.topItems()).toHaveLength(0);
  });
});
