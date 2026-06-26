# CEO Invoicing Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the operations-first dashboard with a CEO-focused revenue dashboard that turns delivered inventory into invoiceable revenue, shows today/week/month comparisons, and breaks revenue down by item type.

**Architecture:** A new `CeoDashboardService` will read delivered/collected package rows from Supabase, compute revenue from `quantity * unit_price`, and aggregate period-over-period metrics into `InvoiceMetrics`. The UI will be a standalone feature under `src/app/features/ceo-dashboard/` composed of four focused cards plus a shell component that owns the time-period toggle, filters, and CSV export.

**Tech Stack:** Angular 21 standalone components, Angular signals, Supabase direct reads, Tailwind CSS, Vitest.

---

## File structure map

- **Modify:** `src/app/core/models/package.models.ts` — add dashboard revenue types.
- **Modify:** `src/app/core/index.ts` — re-export the new model types.
- **Create:** `src/app/features/ceo-dashboard/services/ceo-dashboard.service.ts` — Supabase reads and revenue aggregation.
- **Create:** `src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts` — service and aggregation tests.
- **Create:** `src/app/features/ceo-dashboard/ceo-dashboard.ts|html|css|spec.ts` — main shell component.
- **Create:** `src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.ts|html|css|spec.ts`
- **Create:** `src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.ts|html|css|spec.ts`
- **Create:** `src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.ts|html|css|spec.ts`
- **Create:** `src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.ts|html|css|spec.ts`
- **Modify:** `src/app/app.routes.ts` — point the `dashboard` route at the CEO dashboard.

---

### Task 1: Add revenue model types

**Files:**
- Modify: `src/app/core/models/package.models.ts`
- Modify: `src/app/core/index.ts`
- Test: `src/app/core/models/package.models.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { InvoiceLineItem, InvoiceMetrics, RevenuePeriod } from './package.models';

describe('invoice revenue models', () => {
  it('accepts line items and dashboard totals', () => {
    const item: InvoiceLineItem = {
      package_id: 'pkg-1',
      package_reference: 'PKG-001',
      item_id: 'item-1',
      description: 'A4 paper',
      item_type: 'Paper',
      quantity: 3,
      unit_price: 120,
      total_revenue: 360,
      delivered_at: '2026-06-21T08:30:00Z',
      customer_email: 'ceo@example.com',
      delivery_location_id: 'loc-1',
    };

    const metrics: InvoiceMetrics = {
      period: 'week',
      total_revenue: 360,
      previous_period_revenue: 300,
      revenue_change_percent: 20,
      items_delivered: 3,
      unique_customers: 1,
      avg_revenue_per_item: 120,
      by_item_type: new Map([['Paper', 360]]),
      line_items: [item],
    };

    const period: RevenuePeriod = 'today';

    expect(metrics.line_items[0].total_revenue).toBe(360);
    expect(metrics.by_item_type.get('Paper')).toBe(360);
    expect(period).toBe('today');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/core/models/package.models.spec.ts`

Expected: TypeScript fails with missing `InvoiceLineItem`, `InvoiceMetrics`, and `RevenuePeriod` exports.

- [ ] **Step 3: Write minimal implementation**

```ts
export type RevenuePeriod = 'today' | 'week' | 'month';

export interface InvoiceLineItem {
  readonly package_id: string;
  readonly package_reference: string;
  readonly item_id: string;
  readonly description: string;
  readonly item_type: string | null;
  readonly quantity: number;
  readonly unit_price: number;
  readonly total_revenue: number;
  readonly delivered_at: string;
  readonly customer_email: string;
  readonly delivery_location_id: string | null;
}

export interface InvoiceMetrics {
  readonly period: RevenuePeriod;
  readonly total_revenue: number;
  readonly previous_period_revenue: number;
  readonly revenue_change_percent: number;
  readonly items_delivered: number;
  readonly unique_customers: number;
  readonly avg_revenue_per_item: number;
  readonly by_item_type: ReadonlyMap<string, number>;
  readonly line_items: readonly InvoiceLineItem[];
}
```

Add the exports in `src/app/core/index.ts` so downstream files can import from `../../core`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/core/models/package.models.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/core/models/package.models.ts src/app/core/index.ts src/app/core/models/package.models.spec.ts
git commit -m "feat: add CEO revenue dashboard models"
```

---

### Task 2: Add pure revenue aggregation helpers

**Files:**
- Create: `src/app/features/ceo-dashboard/services/ceo-dashboard.service.ts`
- Create: `src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildInvoiceMetrics } from './ceo-dashboard.service';

describe('buildInvoiceMetrics', () => {
  it('aggregates delivered rows into period revenue and item-type totals', () => {
    const rows = [
      {
        package_id: 'pkg-1',
        package_reference: 'PKG-001',
        item_id: 'item-1',
        description: 'A4 paper',
        item_type: 'Paper',
        quantity: 2,
        unit_price: 100,
        delivered_at: '2026-06-21T09:00:00Z',
        customer_email: 'ceo@example.com',
        delivery_location_id: 'loc-1',
      },
      {
        package_id: 'pkg-2',
        package_reference: 'PKG-002',
        item_id: 'item-2',
        description: 'Ink cartridge',
        item_type: 'Ink',
        quantity: 1,
        unit_price: 250,
        delivered_at: '2026-06-21T10:00:00Z',
        customer_email: 'ops@example.com',
        delivery_location_id: 'loc-2',
      },
    ] as const;

    const metrics = buildInvoiceMetrics(rows, 'today', new Date('2026-06-21T12:00:00Z'));

    expect(metrics.total_revenue).toBe(450);
    expect(metrics.previous_period_revenue).toBe(0);
    expect(metrics.revenue_change_percent).toBe(100);
    expect(metrics.items_delivered).toBe(3);
    expect(metrics.unique_customers).toBe(2);
    expect(metrics.avg_revenue_per_item).toBe(150);
    expect(metrics.by_item_type.get('Paper')).toBe(200);
    expect(metrics.by_item_type.get('Ink')).toBe(250);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts`

Expected: FAIL because `buildInvoiceMetrics` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
export function buildInvoiceMetrics(
  rows: readonly RevenueRow[],
  period: RevenuePeriod,
  now = new Date(),
  previousPeriodRevenue = 0,
): InvoiceMetrics {
  const lineItems = rows
    .filter(row => row.unit_price !== null)
    .map(row => ({
      package_id: row.package_id,
      package_reference: row.package_reference,
      item_id: row.item_id,
      description: row.description,
      item_type: row.item_type,
      quantity: row.quantity,
      unit_price: row.unit_price,
      total_revenue: row.quantity * row.unit_price,
      delivered_at: row.delivered_at,
      customer_email: row.customer_email,
      delivery_location_id: row.delivery_location_id,
    }));

  const total_revenue = lineItems.reduce((sum, item) => sum + item.total_revenue, 0);
  const total_quantity = lineItems.reduce((sum, item) => sum + item.quantity, 0);
  const by_item_type = new Map<string, number>();
  for (const item of lineItems) {
    const key = item.item_type ?? 'Uncategorized';
    by_item_type.set(key, (by_item_type.get(key) ?? 0) + item.total_revenue);
  }

  return {
    period,
    total_revenue,
    previous_period_revenue: previousPeriodRevenue,
    revenue_change_percent: previousPeriodRevenue
      ? ((total_revenue - previousPeriodRevenue) / previousPeriodRevenue) * 100
      : total_revenue > 0
        ? 100
        : 0,
    items_delivered: total_quantity,
    unique_customers: new Set(lineItems.map(item => item.customer_email)).size,
    avg_revenue_per_item: total_quantity ? total_revenue / total_quantity : 0,
    by_item_type,
    line_items: lineItems,
  };
}
```

Add the query-facing service helpers in the same file so the aggregator stays close to the data source:

```ts
export type RevenueRow = Omit<InvoiceLineItem, 'total_revenue'>;

export interface RevenuePackageRow {
  readonly id: string;
  readonly reference: string;
  readonly receiver_email: string;
  readonly delivered_at: string;
  readonly delivery_location_id: string | null;
  readonly package_items: readonly {
    readonly id: string;
    readonly description: string;
    readonly quantity: number;
    readonly unit_price: number | null;
    readonly inventory_items: {
      readonly category: string | null;
    } | null;
  }[];
}

export function flattenRevenueRows(packages: readonly RevenuePackageRow[]): RevenueRow[] {
  return packages.flatMap(pkg =>
    pkg.package_items
      .filter(item => item.unit_price !== null)
      .map(item => ({
        package_id: pkg.id,
        package_reference: pkg.reference,
        item_id: item.id,
        description: item.description,
        item_type: item.inventory_items?.category ?? null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        delivered_at: pkg.delivered_at,
        customer_email: pkg.receiver_email,
        delivery_location_id: pkg.delivery_location_id,
      })),
  );
}

export function calculateRevenueTotal(rows: readonly RevenueRow[]): number {
  return rows.reduce((sum, row) => sum + row.quantity * row.unit_price, 0);
}

export function getPeriodWindow(period: RevenuePeriod, now = new Date()): { start: Date; end: Date } {
  const end = new Date(now);
  const start = new Date(now);

  if (period === 'today') {
    start.setDate(start.getDate() - 1);
    return { start, end };
  }

  if (period === 'week') {
    start.setDate(start.getDate() - 7);
    return { start, end };
  }

  start.setMonth(start.getMonth() - 1);
  return { start, end };
}

export function getPreviousPeriodWindow(period: RevenuePeriod, now = new Date()): { start: Date; end: Date } {
  const current = getPeriodWindow(period, now);
  const duration = current.end.getTime() - current.start.getTime();
  return {
    start: new Date(current.start.getTime() - duration),
    end: new Date(current.start.getTime()),
  };
}
```

Add the service class in the same file so the dashboard can inject a single data source:

```ts
@Injectable({ providedIn: 'root' })
export class CeoDashboardService {
  readonly period = signal<RevenuePeriod>('week');
  readonly metrics = signal<InvoiceMetrics | null>(null);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  constructor(private readonly supabaseService: SupabaseService) {}
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard/services/ceo-dashboard.service.ts src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts
git commit -m "feat: add CEO revenue aggregation helpers"
```

---

### Task 3: Implement the Supabase revenue query

**Files:**
- Modify: `src/app/features/ceo-dashboard/services/ceo-dashboard.service.ts`
- Modify: `src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('loads delivered inventory rows from Supabase and stores metrics', async () => {
  const currentSelect = vi.fn().mockResolvedValue({
    data: [
      {
        id: 'pkg-1',
        reference: 'PKG-001',
        receiver_email: 'ceo@example.com',
        delivered_at: '2026-06-21T09:00:00Z',
        delivery_location_id: 'loc-1',
        package_items: [
          {
            id: 'item-1',
            description: 'A4 paper',
            quantity: 2,
            unit_price: 100,
            inventory_items: { category: 'Paper' },
          },
        ],
      },
    ],
    error: null,
  });
  const previousSelect = vi.fn().mockResolvedValue({
    data: [
      {
        id: 'pkg-9',
        reference: 'PKG-099',
        receiver_email: 'ceo@example.com',
        delivered_at: '2026-06-14T09:00:00Z',
        delivery_location_id: 'loc-1',
        package_items: [
          {
            id: 'item-9',
            description: 'A4 paper',
            quantity: 1,
            unit_price: 150,
            inventory_items: { category: 'Paper' },
          },
        ],
      },
    ],
    error: null,
  });
  const from = vi
    .fn()
    .mockReturnValueOnce({ select: currentSelect })
    .mockReturnValueOnce({ select: previousSelect });
  const supabaseService = { client: { from } } as unknown as SupabaseService;

  const service = new CeoDashboardService(supabaseService);
  await service.loadMetrics('today');

  expect(from).toHaveBeenCalledWith('packages');
  expect(service.metrics()?.total_revenue).toBe(200);
  expect(service.metrics()?.previous_period_revenue).toBe(150);
  expect(service.metrics()?.revenue_change_percent).toBeCloseTo(33.33, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts`

Expected: FAIL because `loadMetrics` does not exist yet and the query chain is not wired.

- [ ] **Step 3: Write minimal implementation**

```ts
async loadMetrics(period: RevenuePeriod = 'week'): Promise<void> {
  this.isLoading.set(true);
  this.error.set(null);

  try {
    const { start, end } = getPeriodWindow(period, new Date());

    const currentQuery = this.supabaseService.client
      .from('packages')
      .select(`
      id,
      reference,
      receiver_email,
      status,
      delivered_at,
      delivery_location_id,
      package_items (
        id,
        description,
        quantity,
        unit_price,
        inventory_items (
          category
        )
      )
    `)
      .in('status', ['delivered', 'collected'])
      .gte('delivered_at', start.toISOString())
      .lte('delivered_at', end.toISOString());

    const previousWindow = getPreviousPeriodWindow(period, new Date());
    const previousQuery = this.supabaseService.client
      .from('packages')
      .select(`
      id,
      reference,
      receiver_email,
      status,
      delivered_at,
      delivery_location_id,
      package_items (
        id,
        description,
        quantity,
        unit_price,
        inventory_items (
          category
        )
      )
    `)
      .in('status', ['delivered', 'collected'])
      .gte('delivered_at', previousWindow.start.toISOString())
      .lte('delivered_at', previousWindow.end.toISOString());

    const [{ data, error }, { data: previousData, error: previousError }] = await Promise.all([
      currentQuery,
      previousQuery,
    ]);

    if (error) {
      this.error.set(error.message);
      throw error;
    }

    if (previousError) {
      this.error.set(previousError.message);
      throw previousError;
    }

    const currentRows = flattenRevenueRows(data ?? []);
    const previousRows = flattenRevenueRows(previousData ?? []);

    this.metrics.set(
      buildInvoiceMetrics(currentRows, period, new Date(), calculateRevenueTotal(previousRows)),
    );
  } finally {
    this.isLoading.set(false);
  }
}

setPeriod(period: RevenuePeriod): void {
  this.period.set(period);
  void this.loadMetrics(period);
}

exportCsv(): void {
  const metrics = this.metrics();
  if (!metrics) {
    return;
  }

  const header = ['package_reference', 'customer_email', 'item_type', 'quantity', 'unit_price', 'total_revenue', 'delivered_at'];
  const rows = metrics.line_items.map(item => [
    item.package_reference,
    item.customer_email,
    item.item_type ?? 'Uncategorized',
    String(item.quantity),
    String(item.unit_price),
    String(item.total_revenue),
    item.delivered_at,
  ]);

  const csv = [header, ...rows].map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ceo-invoice-${this.period()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
```

Use `inventory_items.category` as the item-type source and fall back to `Uncategorized` when it is null.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard/services/ceo-dashboard.service.ts src/app/features/ceo-dashboard/services/ceo-dashboard.service.spec.ts
git commit -m "feat: load CEO revenue metrics from Supabase"
```

---

### Task 4: Build the revenue summary card

**Files:**
- Create: `src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.ts`
- Create: `src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.html`
- Create: `src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.css`
- Create: `src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('renders the current revenue, previous revenue, and change badge', () => {
  component.metrics = {
    period: 'week',
    total_revenue: 12500,
    previous_period_revenue: 10000,
    revenue_change_percent: 25,
    items_delivered: 36,
    unique_customers: 9,
    avg_revenue_per_item: 347.22,
    by_item_type: new Map(),
    line_items: [],
  };
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('12,500');
  expect(fixture.nativeElement.textContent).toContain('25%');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.spec.ts`

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
@Component({
  selector: 'app-revenue-summary-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './revenue-summary-card.html',
  styleUrl: './revenue-summary-card.css',
})
export class RevenueSummaryCardComponent {
  @Input({ required: true }) metrics!: InvoiceMetrics;

  readonly isPositive = computed(() => this.metrics.revenue_change_percent >= 0);
}
```

Template:

```html
<section class="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
  <p class="text-sm text-slate-500 dark:text-slate-400">Invoiceable revenue</p>
  <div class="mt-2 flex items-end justify-between gap-4">
    <div>
      <h2 class="text-3xl font-semibold text-slate-900 dark:text-white">
        {{ metrics.total_revenue | number:'1.0-0' }}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        Previous period {{ metrics.previous_period_revenue | number:'1.0-0' }}
      </p>
    </div>
    <span [class.text-emerald-600]="isPositive()" [class.text-rose-600]="!isPositive()">
      {{ metrics.revenue_change_percent | number:'1.0-0' }}%
    </span>
  </div>
</section>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/revenue-summary-card/revenue-summary-card.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard/cards/revenue-summary-card
git commit -m "feat: add CEO revenue summary card"
```

---

### Task 5: Build the revenue breakdown chart

**Files:**
- Create: `src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.ts`
- Create: `src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.html`
- Create: `src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.css`
- Create: `src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('renders one bar per item type', () => {
  component.metrics = {
    period: 'month',
    total_revenue: 5000,
    previous_period_revenue: 4500,
    revenue_change_percent: 11.11,
    items_delivered: 18,
    unique_customers: 5,
    avg_revenue_per_item: 277.78,
    by_item_type: new Map([
      ['Paper', 3000],
      ['Ink', 2000],
    ]),
    line_items: [],
  };
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('Paper');
  expect(fixture.nativeElement.textContent).toContain('Ink');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.spec.ts`

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
@Component({
  selector: 'app-revenue-breakdown-chart',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './revenue-breakdown-chart.html',
  styleUrl: './revenue-breakdown-chart.css',
})
export class RevenueBreakdownChartComponent {
  @Input({ required: true }) metrics!: InvoiceMetrics;

  get breakdownEntries(): readonly { label: string; value: number }[] {
    return [...this.metrics.by_item_type.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }
}
```

Render a simple horizontal bar list using `breakdownEntries`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/revenue-breakdown-chart/revenue-breakdown-chart.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard/cards/revenue-breakdown-chart
git commit -m "feat: add CEO revenue breakdown chart"
```

---

### Task 6: Build the quick metrics card

**Files:**
- Create: `src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.ts`
- Create: `src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.html`
- Create: `src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.css`
- Create: `src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('shows delivered items, unique customers, and average revenue', () => {
  component.metrics = {
    period: 'today',
    total_revenue: 2400,
    previous_period_revenue: 1800,
    revenue_change_percent: 33.33,
    items_delivered: 12,
    unique_customers: 4,
    avg_revenue_per_item: 200,
    by_item_type: new Map(),
    line_items: [],
  };
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('12');
  expect(fixture.nativeElement.textContent).toContain('4');
  expect(fixture.nativeElement.textContent).toContain('200');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.spec.ts`

Expected: FAIL because the component does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
@Component({
  selector: 'app-quick-metrics-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './quick-metrics-card.html',
  styleUrl: './quick-metrics-card.css',
})
export class QuickMetricsCardComponent {
  @Input({ required: true }) metrics!: InvoiceMetrics;
}
```

Render three compact stat tiles for delivered items, unique customers, and average revenue per item.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/quick-metrics-card/quick-metrics-card.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard/cards/quick-metrics-card
git commit -m "feat: add CEO quick metrics card"
```

---

### Task 7: Build the detail table card

**Files:**
- Create: `src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.ts`
- Create: `src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.html`
- Create: `src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.css`
- Create: `src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('renders invoice line items and emits csv export requests', () => {
  const exportSpy = vi.spyOn(component.exportRequested, 'emit');
  component.lineItems = [
    {
      package_id: 'pkg-1',
      package_reference: 'PKG-001',
      item_id: 'item-1',
      description: 'A4 paper',
      item_type: 'Paper',
      quantity: 2,
      unit_price: 100,
      total_revenue: 200,
      delivered_at: '2026-06-21T09:00:00Z',
      customer_email: 'ceo@example.com',
      delivery_location_id: 'loc-1',
    },
  ];
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('PKG-001');
  component.onExportClick();
  expect(exportSpy).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.spec.ts`

Expected: FAIL because the component and export output do not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
@Component({
  selector: 'app-detail-table-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './detail-table-card.html',
  styleUrl: './detail-table-card.css',
})
export class DetailTableCardComponent {
  @Input({ required: true }) lineItems!: readonly InvoiceLineItem[];
  @Output() exportRequested = new EventEmitter<void>();

  onExportClick(): void {
    this.exportRequested.emit();
  }
}
```

Template should render the full invoice table with columns for package reference, customer, location, item type, quantity, unit price, and revenue.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/cards/detail-table-card/detail-table-card.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard/cards/detail-table-card
git commit -m "feat: add CEO invoice detail table"
```

---

### Task 8: Build the main CEO dashboard shell

**Files:**
- Create: `src/app/features/ceo-dashboard/ceo-dashboard.ts`
- Create: `src/app/features/ceo-dashboard/ceo-dashboard.html`
- Create: `src/app/features/ceo-dashboard/ceo-dashboard.css`
- Create: `src/app/features/ceo-dashboard/ceo-dashboard.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('renders the revenue hero, time toggle, and detail section', () => {
  fixture.detectChanges();

  expect(fixture.nativeElement.textContent).toContain('Revenue');
  expect(fixture.nativeElement.textContent).toContain('Today');
  expect(fixture.nativeElement.textContent).toContain('This week');
  expect(fixture.nativeElement.textContent).toContain('This month');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/ceo-dashboard.spec.ts`

Expected: FAIL because the shell component does not exist yet.

- [ ] **Step 3: Write minimal implementation**

```ts
@Component({
  selector: 'app-ceo-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    RevenueSummaryCardComponent,
    RevenueBreakdownChartComponent,
    QuickMetricsCardComponent,
    DetailTableCardComponent,
  ],
  templateUrl: './ceo-dashboard.html',
  styleUrl: './ceo-dashboard.css',
})
export class CeoDashboardComponent implements OnInit {
  private readonly dashboardService = inject(CeoDashboardService);

  readonly period = this.dashboardService.period;
  readonly metrics = this.dashboardService.metrics;
  readonly isLoading = this.dashboardService.isLoading;
  readonly error = this.dashboardService.error;

  async ngOnInit(): Promise<void> {
    await this.dashboardService.loadMetrics();
  }

  onPeriodChange(period: RevenuePeriod): void {
    this.dashboardService.setPeriod(period);
  }

  onExportCsv(): void {
    this.dashboardService.exportCsv();
  }
}
```

The template should render:

```html
<ng-container *ngIf="metrics() as metrics">
  <app-revenue-summary-card [metrics]="metrics"></app-revenue-summary-card>
  <app-revenue-breakdown-chart [metrics]="metrics"></app-revenue-breakdown-chart>
  <app-quick-metrics-card [metrics]="metrics"></app-quick-metrics-card>
  <app-detail-table-card [lineItems]="metrics.line_items" (exportRequested)="onExportCsv()"></app-detail-table-card>
</ng-container>
```

Also include the `Today / This week / This month` toggle and a comparison badge for the current period versus the previous period.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/ceo-dashboard.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard
git commit -m "feat: add CEO dashboard shell"
```

---

### Task 9: Point the dashboard route at the new CEO dashboard

**Files:**
- Modify: `src/app/app.routes.ts`
- Create: `src/app/app.routes.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { routes } from './app.routes';

describe('app routes', () => {
it('loads the CEO dashboard component at /dashboard', async () => {
  const route = routes.find(r => r.path === 'dashboard');
  expect(route?.loadComponent).toBeTruthy();
});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/app.routes.spec.ts`

Expected: FAIL until the route points to the new component.

- [ ] **Step 3: Write minimal implementation**

```ts
{
  path: 'dashboard',
  loadComponent: () => import('./features/ceo-dashboard/ceo-dashboard').then(m => m.CeoDashboardComponent),
  canActivate: [authGuard],
}
```

Remove the old `./features/dashboard/dashboard` load target from the route table so the CEO dashboard becomes the default experience.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/app.routes.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/app.routes.ts
git commit -m "feat: route dashboard to CEO view"
```

---

### Task 10: Polish layout, dark mode, and final verification

**Files:**
- Modify: `src/app/features/ceo-dashboard/ceo-dashboard.css`
- Modify: `src/app/features/ceo-dashboard/cards/*/*.css`
- Modify: `src/app/features/ceo-dashboard/ceo-dashboard.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('uses green and red comparison badge classes', () => {
  expect(component.comparisonBadgeClass(12)).toContain('text-emerald-600');
  expect(component.comparisonBadgeClass(-4)).toContain('text-rose-600');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/ceo-dashboard.spec.ts`

Expected: FAIL until the comparison badge helper and dark-mode layout polish are done.

- [ ] **Step 3: Write minimal implementation**

```ts
comparisonBadgeClass(changePercent: number): string {
  return changePercent >= 0
    ? 'text-emerald-600 dark:text-emerald-400'
    : 'text-rose-600 dark:text-rose-400';
}
```

```css
:host {
  display: block;
}

.dashboard-shell {
  @apply min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100;
}

.dashboard-grid {
  @apply grid gap-6 xl:grid-cols-12;
}

.summary-column {
  @apply xl:col-span-8;
}

.detail-column {
  @apply xl:col-span-12;
}
```

Finish the CSS pass so the dashboard is readable in dark mode, the summary stays above the fold, and the detail card collapses cleanly on mobile.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --watch=false --include src/app/features/ceo-dashboard/ceo-dashboard.spec.ts`

Expected: PASS.

Then run the repository build:

Run: `npm run build`

Expected: PASS with the new CEO dashboard as the dashboard route target.

- [ ] **Step 5: Commit**

```bash
git add src/app/features/ceo-dashboard src/app/app.routes.ts
git commit -m "feat: finish CEO invoicing dashboard"
```

---

## Self-review checklist

### 1. Spec coverage

- Revenue based on delivered inventory and `quantity * unit_price` calculation: Tasks 1-3.
- Today / This week / This month toggles and comparison view: Tasks 2, 3, and 8.
- Revenue by item type: Task 5.
- Quick metrics for executive view: Task 6.
- Detailed invoice table and CSV export: Tasks 7 and 3.
- CEO-focused dashboard route replacement: Task 9.
- Dark mode and responsive layout: Task 10.

### 2. Placeholder scan

- No `TBD`, `TODO`, or “implement later” placeholders are used in the task steps.
- Each code step shows concrete names: `InvoiceLineItem`, `InvoiceMetrics`, `CeoDashboardService`, `CeoDashboardComponent`, and the four card components.

### 3. Type consistency

- `RevenuePeriod` is used consistently across models, service, and shell component.
- `InvoiceLineItem` and `InvoiceMetrics` stay aligned between the model file, service helper, and UI components.
- `buildInvoiceMetrics` is the aggregation entry point named in every task that depends on the revenue math.
- `CeoDashboardComponent` is the route target, and `CeoDashboardService` is the data source.
