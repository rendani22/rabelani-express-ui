import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ExecutiveDashboardService } from './executive-dashboard.service';
import { SupabaseService } from '../../../shared/services/supabase.service';

/** Minimal Supabase stub whose `rpc()` resolves to a fixed `{ data, error }`. */
function makeClient(result: { data: unknown; error: unknown }) {
  return { rpc: vi.fn(async () => result) };
}

/**
 * A representative `get_executive_metrics` payload: R300 realized across one
 * collected order (Widget ×3), with R250 of pipeline awaiting collection.
 */
const PAYLOAD = {
  summary: {
    totalValue: 300,
    totalOrders: 1,
    avgOrderValue: 300,
    pipelineValue: 250,
    pipelineOrders: 1,
    truncated: false,
  },
  periods: {
    today: { value: 300, orders: 1 },
    yesterday: { value: 100, orders: 1 },
    week: { value: 300, orders: 1 },
    prevWeek: { value: 0, orders: 0 },
    month: { value: 300, orders: 1 },
    prevMonth: { value: 0, orders: 0 },
    year: { value: 300, orders: 1 },
    prevYear: { value: 0, orders: 0 },
    all: { value: 300, orders: 1 },
  },
  trends: {
    day: [{ key: '2026-06-29', value: 300, orders: 1 }],
    week: [{ key: '2026-06-29', value: 300, orders: 1 }],
    month: [{ key: '2026-06', value: 300, orders: 1 }],
    year: [{ key: '2026', value: 300, orders: 1 }],
  },
  topCustomers: [{ email: 'bob@example.com', value: 300, orders: 1 }],
  topItems: [
    { description: 'widget', inventoryItemId: 'inv-widget', value: 300, quantity: 3, orders: 1 },
  ],
};

describe('ExecutiveDashboardService', () => {
  function setup(result: { data: unknown; error: unknown }) {
    const mockSupabase = { client: makeClient(result) };
    TestBed.configureTestingModule({
      providers: [
        ExecutiveDashboardService,
        { provide: SupabaseService, useValue: mockSupabase },
      ],
    });
    return TestBed.inject(ExecutiveDashboardService);
  }

  it('maps the realized/pipeline summary from the RPC payload', async () => {
    const service = setup({ data: PAYLOAD, error: null });

    await service.load();

    const summary = service.summary();
    expect(summary.totalOrders).toBe(1);
    expect(summary.totalValue).toBe(300);
    expect(summary.avgOrderValue).toBe(300);
    expect(summary.pipelineValue).toBe(250);
    expect(summary.pipelineOrders).toBe(1);
    expect(summary.truncated).toBe(false);
    expect(service.loaded()).toBe(true);
    expect(service.error()).toBeNull();
  });

  it('builds the five period KPIs with deltas relative to the prior period', async () => {
    const service = setup({ data: PAYLOAD, error: null });

    await service.load();

    const kpis = service.kpis();
    expect(kpis.map(k => k.key)).toEqual(['today', 'week', 'month', 'year', 'all']);

    const today = kpis.find(k => k.key === 'today')!;
    expect(today.value).toBe(300);
    expect(today.orders).toBe(1);
    expect(today.deltaPercent).toBe(200); // 300 vs 100 yesterday
    expect(today.deltaUp).toBe(true);

    const all = kpis.find(k => k.key === 'all')!;
    expect(all.value).toBe(300);
    expect(all.deltaPercent).toBeNull(); // no comparison for all-time
  });

  it('labels trend points and prettifies customers / title-cases items', async () => {
    const service = setup({ data: PAYLOAD, error: null });

    await service.load();

    expect(service.trends().year).toEqual([
      { key: '2026', label: '2026', value: 300, orders: 1 },
    ]);
    expect(service.trends().day[0].label).toBeTruthy();

    const customer = service.topCustomers()[0];
    expect(customer).toMatchObject({ email: 'bob@example.com', name: 'Bob', value: 300, orders: 1 });

    const item = service.topItems()[0];
    expect(item).toMatchObject({ description: 'Widget', value: 300, quantity: 3, orders: 1 });
  });

  it('surfaces an error and does not mark loaded when the RPC fails', async () => {
    const service = setup({ data: null, error: { message: 'boom' } });

    await service.load();

    expect(service.error()).toBe('boom');
    expect(service.loaded()).toBe(false);
    expect(service.isLoading()).toBe(false);
  });
});
