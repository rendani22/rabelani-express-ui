import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ExecutiveDashboardService } from './executive-dashboard.service';
import { SupabaseService } from '../../../shared/services/supabase.service';

interface RpcResult {
  data: unknown;
  error: unknown;
}

interface ClientResults {
  /** get_executive_metrics result. */
  exec: RpcResult;
  /** get_dashboard_metrics result. */
  ops?: RpcResult;
  /** purchase_orders read result. */
  po?: RpcResult;
}

/**
 * Supabase stub. `rpc()` dispatches by function name (executive vs dashboard
 * metrics); `from('purchase_orders').select()` resolves the order-book read.
 */
function makeClient(results: ClientResults) {
  const ops = results.ops ?? { data: null, error: null };
  const po = results.po ?? { data: [], error: null };
  return {
    rpc: vi.fn(async (name: string) =>
      name === 'get_dashboard_metrics' ? ops : results.exec,
    ),
    from: vi.fn(() => ({ select: vi.fn(async () => po) })),
  };
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

/**
 * A representative `get_dashboard_metrics` payload subset: 10 orders across the
 * funnel, a 36h average cycle time, two SLA breaches, and one out-of-stock item.
 */
const OPS = {
  stats: { total: 10, completed: 4, readyForCollection: 1, inTransit: 2, pending: 3, returned: 0 },
  statusCounts: { pending: 2, notified: 1, in_transit: 2, ready_for_collection: 1, collected: 4 },
  lifecycleMetrics: {
    avgTotalCycleHours: 36,
    avgCreateToPickupHours: null,
    avgPickupToReceiveHours: null,
    avgReceiveToCollectHours: null,
    completedSampleSize: 4,
  },
  stuckPackages: [{ id: 'x' }, { id: 'y' }],
  inventoryHealth: {
    totalValue: 5000,
    lowStock: 2,
    outOfStock: 1,
    activeItems: 12,
    topLowStock: [{ id: 'i1', name: 'Bolt', quantity: 0, threshold: 10 }],
  },
};

/** Purchase-order rows: R1 250 open across two POs, R500 completed. */
const PO_ROWS = [
  { status: 'draft', po_value: 1000, po_date: '2026-06-10', created_at: '2026-06-01' },
  { status: 'completed', po_value: 500, po_date: '2026-05-20', created_at: '2026-05-01' },
  { status: 'in_progress', po_value: 250, po_date: null, created_at: '2026-06-15' },
];

describe('ExecutiveDashboardService', () => {
  function setup(result: RpcResult, extra: Omit<ClientResults, 'exec'> = {}) {
    const mockSupabase = { client: makeClient({ exec: result, ...extra }) };
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

  // ── Story layer ────────────────────────────────────────────────────────────

  it('builds the fulfilment funnel with per-stage counts, value and conversion', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { ops: { data: OPS, error: null } });

    await service.load();

    const funnel = service.funnel();
    expect(funnel.stages.map(s => s.key)).toEqual(['pending', 'transit', 'ready', 'collected']);
    expect(funnel.stages.find(s => s.key === 'pending')!.orders).toBe(3); // pending + notified
    expect(funnel.stages.find(s => s.key === 'ready')!.value).toBe(250); // pipeline value
    expect(funnel.stages.find(s => s.key === 'collected')!.value).toBe(300); // realized value
    expect(funnel.totalInFunnel).toBe(10);
    expect(funnel.conversionRate).toBe(40); // 4 collected / 10
  });

  it('builds a five-tile scorecard rating money and operations', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { ops: { data: OPS, error: null } });

    await service.load();

    const tiles = service.scorecard();
    expect(tiles.map(t => t.key)).toEqual(['revenue', 'pipeline', 'cycle', 'risk', 'conversion']);
    expect(tiles.find(t => t.key === 'cycle')!.display).toBe('36h');
    expect(tiles.find(t => t.key === 'cycle')!.level).toBe('good');
    expect(tiles.find(t => t.key === 'risk')!.level).toBe('watch'); // 2 breaches
    expect(tiles.find(t => t.key === 'conversion')!.display).toBe('40%');
  });

  it('derives the forward order book from purchase orders', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { po: { data: PO_ROWS, error: null } });

    await service.load();

    const ob = service.orderBook();
    expect(ob.available).toBe(true);
    expect(ob.openValue).toBe(1250); // 1000 + 250 (non-completed)
    expect(ob.openCount).toBe(2);
    expect(ob.completedValue).toBe(500);
    expect(ob.monthly.map(m => m.key)).toEqual(['2026-05', '2026-06']);
  });

  it('flags customer concentration risk from top-customer share', async () => {
    const service = setup({ data: PAYLOAD, error: null });

    await service.load();

    const conc = service.concentration();
    expect(conc.topCustomerShare).toBe(100); // sole customer holds all revenue
    expect(conc.topFiveShare).toBe(100);
    expect(conc.level).toBe('risk');
  });

  it('writes a briefing per period, each surfacing the top SLA risk', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { ops: { data: OPS, error: null } });

    await service.load();

    const briefings = service.briefings();
    expect(Object.keys(briefings)).toEqual(['today', 'week', 'month', 'year']);

    const month = briefings.month;
    expect(month.headline).toContain('R');
    expect(month.headline).toContain('this month');
    // Two SLA breaches outrank other watch items in every period.
    expect(month.watchItem).toContain('breached SLA');
    expect(month.watchLevel).toBe('watch');
    expect(month.paragraphs.length).toBeGreaterThan(0);

    // Each period narrates its own window.
    expect(briefings.today.headline).toContain('today');
    expect(briefings.week.headline).toContain('this week');
    expect(briefings.year.headline).toContain('this year');
  });

  it('still loads revenue when the operational and PO reads fail', async () => {
    const service = setup(
      { data: PAYLOAD, error: null },
      { ops: { data: null, error: { message: 'ops down' } }, po: { data: null, error: { message: 'po down' } } },
    );

    await service.load();

    expect(service.loaded()).toBe(true);
    expect(service.error()).toBeNull();
    expect(service.summary().totalValue).toBe(300);
    expect(service.funnel().totalInFunnel).toBe(0); // ops unavailable → empty funnel
    expect(service.orderBook().available).toBe(false);
    // Scorecard still renders five tiles, with ops-derived ones neutral/blank.
    expect(service.scorecard()).toHaveLength(5);
  });

  // ── Operations layer ─────────────────────────────────────────────────────────

  /** Ops payload extended with the Operations-band fields. */
  const OPS_OPERATIONS = {
    ...OPS,
    locationDistribution: [
      { id: 'l1', name: 'Polokwane', count: 60 },
      { id: 'l2', name: 'Thohoyandou', count: 30 },
      { id: 'l3', name: 'Louis Trichardt', count: 10 },
      { id: 'unassigned', name: 'No Location', count: 5, unassigned: true },
    ],
    podStats: { total: 20, withPdf: 14, locked: 12, today: 2, thisWeek: 8 },
    returns: {
      returnedTotal: 12,
      ordersTotal: 100,
      monthly: [
        { key: '2026-04', returned: 1, total: 40 }, // 2.5%
        { key: '2026-05', returned: 3, total: 40 }, // 7.5%
        { key: '2026-06', returned: 5, total: 40 }, // 12.5% → rising 3 months
      ],
      byLocation: [
        { id: 'l1', name: 'Polokwane', returned: 3, total: 60 }, // 5%
        { id: 'l3', name: 'Louis Trichardt', returned: 5, total: 10 }, // 50% → >=2x overall
      ],
    },
  };

  it('builds delivery geography with shares, unassigned gap and concentration', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { ops: { data: OPS_OPERATIONS, error: null } });

    await service.load();

    const geo = service.geography();
    expect(geo.available).toBe(true);
    expect(geo.locations.map(l => l.name)).toEqual(['Polokwane', 'Thohoyandou', 'Louis Trichardt']);
    expect(geo.totalAssigned).toBe(100);
    expect(geo.locations[0].share).toBe(60); // 60 / 100
    expect(geo.unassigned).toBe(5); // pulled out, not in locations
    expect(geo.topShare).toBe(60);
    expect(geo.concentrationLevel).toBe('risk'); // top >= 50%
  });

  it('builds POD compliance rates and rates the PDF-capture level', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { ops: { data: OPS_OPERATIONS, error: null } });

    await service.load();

    const pod = service.podCompliance();
    expect(pod.available).toBe(true);
    expect(pod.pdfRate).toBe(70); // 14 / 20
    expect(pod.lockedRate).toBe(60); // 12 / 20
    expect(pod.level).toBe('risk'); // < 75%
  });

  it('builds the returns report with rate, rising trend and worst location', async () => {
    const service = setup({ data: PAYLOAD, error: null }, { ops: { data: OPS_OPERATIONS, error: null } });

    await service.load();

    const ret = service.returns();
    expect(ret.available).toBe(true);
    expect(ret.returnRate).toBe(12); // 12 / 100
    expect(ret.monthly.map(m => m.rate)).toEqual([2.5, 7.5, 12.5]);
    expect(ret.trendingUp).toBe(true);
    expect(ret.worstLocation?.name).toBe('Louis Trichardt'); // 50% >= 2 * 12%
    expect(ret.level).toBe('watch'); // rate 12% < 15 (not risk), but trend + worst location → watch
  });

  it('marks operations metrics unavailable when the ops read fails', async () => {
    const service = setup(
      { data: PAYLOAD, error: null },
      { ops: { data: null, error: { message: 'ops down' } } },
    );

    await service.load();

    expect(service.geography().available).toBe(false);
    expect(service.podCompliance().available).toBe(false);
    expect(service.returns().available).toBe(false);
  });
});
