# CEO Invoicing Dashboard Design Spec

**Date:** 2026-06-21  
**Project:** Rabelani Express UI  
**Objective:** Create a revenue-focused dashboard for the CEO, replacing operational metrics with invoice-centric insights

---

## Executive Summary

The current dashboard is operations-focused (deliveries, drivers, inventory levels). The CEO needs a revenue-focused view centered on **total revenue generated from inventory delivered** and **breakdown by product type**. This spec defines a new CEO Dashboard (`/ceo-dashboard`) that displays:

1. **Revenue summary** with Today / Week / Month toggles and period-over-period comparisons
2. **Revenue breakdown by item type** as an interactive bar chart
3. **Supporting quick metrics** (items delivered, avg revenue per item, unique customers)
4. **Optional detail view** with full item-level breakdown, filtering, and CSV export

---

## Problem Statement

Current operational dashboard answers: "How many deliveries did we complete? How are drivers performing? What's our inventory health?"

CEO needs to answer: "How much revenue did we generate? Which products are driving that revenue? How does it compare to last period?"

The CEO's decision-making centers on **invoicing and revenue**, not operations. A separate, focused dashboard prevents cognitive overload and surfaces the right metrics.

---

## Design Approach: Hybrid Executive Summary + Optional Detail

The design follows **Approach C** from brainstorming:

- **Top section (always visible):** Executive summary — revenue hero card, time toggle, item type breakdown chart, quick metrics
- **Bottom section (collapsed by default):** Detail view — expandable accordion with filters, full item table, export options
- **Time period:** Default to "This Week"; support Today / Week / Month toggles
- **Comparison:** Each period shows % change vs. previous period (previous day, previous week, previous month)

---

## Architecture

### Directory Structure

```
src/app/features/ceo-dashboard/
├── ceo-dashboard.ts           (main component)
├── ceo-dashboard.html
├── ceo-dashboard.css
├── ceo-dashboard.spec.ts
├── services/
│   └── ceo-dashboard.service.ts
└── cards/
    ├── revenue-summary/
    │   ├── revenue-summary.ts
    │   ├── revenue-summary.html
    │   └── revenue-summary.css
    ├── revenue-breakdown-chart/
    │   ├── revenue-breakdown-chart.ts
    │   ├── revenue-breakdown-chart.html
    │   └── revenue-breakdown-chart.css
    ├── quick-metrics/
    │   ├── quick-metrics.ts
    │   ├── quick-metrics.html
    │   └── quick-metrics.css
    └── detail-table/
        ├── detail-table.ts
        ├── detail-table.html
        └── detail-table.css
```

### Data Models

**New types in `src/app/core/models/package.models.ts`:**

```typescript
/** Single invoice line item (delivered package item) */
export interface InvoiceLineItem {
  readonly item_id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unit_price: number; // Nullable until pricing is added
  readonly total_revenue: number; // quantity × unit_price
  readonly delivered_at: string; // ISO timestamp when package was marked delivered/collected
  readonly customer_email: string;
  readonly delivery_location_id?: string;
}

/** Aggregated metrics for a billing period */
export interface InvoiceMetrics {
  readonly period: 'today' | 'week' | 'month';
  readonly total_revenue: number; // Sum of all line item totals
  readonly previous_period_revenue: number;
  readonly revenue_change_percent: number; // (current - previous) / previous * 100
  readonly items_delivered: number; // Total quantity of items
  readonly unique_customers: number;
  readonly avg_revenue_per_item: number; // total_revenue / items_delivered
  readonly by_item_type: ReadonlyMap<string, number>; // item name → total revenue
  readonly line_items: readonly InvoiceLineItem[];
}
```

**Model exports:** Add to `src/app/core/index.ts` barrel export.

### Service: CeoDashboardService

**File:** `src/app/features/ceo-dashboard/services/ceo-dashboard.service.ts`

```typescript
@Injectable({ providedIn: 'root' })
export class CeoDashboardService {
  private readonly supabaseService = inject(SupabaseService);

  // Readonly signals exposed to component
  readonly isLoading = signal(false);
  readonly invoiceMetrics = signal<InvoiceMetrics | null>(null);
  readonly selectedPeriod = signal<'today' | 'week' | 'month'>('week');

  /**
   * Load invoice metrics for the selected period.
   * Queries packages with 'delivered' or 'collected' status and aggregates revenue.
   */
  async loadInvoiceMetrics(period?: 'today' | 'week' | 'month'): Promise<void> {
    if (period) this.selectedPeriod.set(period);
    
    this.isLoading.set(true);
    try {
      const metrics = await this.calculateInvoiceMetrics(this.selectedPeriod());
      this.invoiceMetrics.set(metrics);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Calculate metrics by:
   * 1. Query packages with delivered/collected status within period
   * 2. Join with package_items to get quantities and unit_prices
   * 3. Sum revenue (quantity × unit_price) grouped by item type
   * 4. Calculate period-over-period comparison
   */
  private async calculateInvoiceMetrics(period: 'today' | 'week' | 'month'): Promise<InvoiceMetrics> {
    const now = new Date();
    const [startDate, endDate] = this.getDateRange(period, now);
    const [prevStart, prevEnd] = this.getDateRange(period, new Date(now.getTime() - this.getPeriodMs(period)));

    // Query current period
    const currentData = await this.queryInvoiceData(startDate, endDate);
    
    // Query previous period
    const previousData = await this.queryInvoiceData(prevStart, prevEnd);

    return this.aggregateMetrics(currentData, previousData, period);
  }

  /**
   * Query database for packages with line items in date range.
   * Returns items only if unit_price is set (prevent null revenue issues).
   */
  private async queryInvoiceData(startDate: Date, endDate: Date): Promise<InvoiceLineItem[]> {
    const { data, error } = await this.supabaseService.client
      .from('packages')
      .select(`
        id,
        receiver_email,
        delivery_location_id,
        collected_at,
        created_at,
        package_items (
          id,
          quantity,
          description,
          unit_price
        )
      `)
      .in('status', ['delivered', 'collected'])
      .gte('collected_at', startDate.toISOString())
      .lte('collected_at', endDate.toISOString());

    if (error) throw error;

    // Flatten and filter out items without unit_price
    return (data || [])
      .flatMap(pkg => 
        (pkg.package_items || [])
          .filter(item => item.unit_price !== null)
          .map(item => ({
            item_id: item.id,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_revenue: item.quantity * item.unit_price,
            delivered_at: pkg.collected_at || pkg.created_at,
            customer_email: pkg.receiver_email,
            delivery_location_id: pkg.delivery_location_id,
          }))
      );
  }

  /**
   * Aggregate line items into totals, breakdowns, and comparisons.
   */
  private aggregateMetrics(
    current: InvoiceLineItem[],
    previous: InvoiceLineItem[],
    period: 'today' | 'week' | 'month'
  ): InvoiceMetrics {
    const currentTotal = current.reduce((sum, item) => sum + item.total_revenue, 0);
    const previousTotal = previous.reduce((sum, item) => sum + item.total_revenue, 0);
    const currentQty = current.reduce((sum, item) => sum + item.quantity, 0);

    const byItemType = new Map<string, number>();
    current.forEach(item => {
      byItemType.set(
        item.description,
        (byItemType.get(item.description) ?? 0) + item.total_revenue
      );
    });

    const revenueChange = previousTotal === 0 ? 0 : ((currentTotal - previousTotal) / previousTotal) * 100;

    return {
      period,
      total_revenue: currentTotal,
      previous_period_revenue: previousTotal,
      revenue_change_percent: revenueChange,
      items_delivered: currentQty,
      unique_customers: new Set(current.map(c => c.customer_email)).size,
      avg_revenue_per_item: currentQty === 0 ? 0 : currentTotal / currentQty,
      by_item_type: byItemType,
      line_items: current,
    };
  }

  private getDateRange(period: 'today' | 'week' | 'month', baseDate: Date): [Date, Date] {
    const start = new Date(baseDate);
    const end = new Date(baseDate);
    end.setHours(23, 59, 59, 999);

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      const day = start.getDay();
      start.setDate(start.getDate() - day); // Start of week (Sunday)
      start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }

    return [start, end];
  }

  private getPeriodMs(period: 'today' | 'week' | 'month'): number {
    if (period === 'today') return 24 * 60 * 60 * 1000;
    if (period === 'week') return 7 * 24 * 60 * 60 * 1000;
    return 30 * 24 * 60 * 60 * 1000; // Month approximation
  }
}
```

### Components

#### RevenueSummaryCardComponent

**Purpose:** Display total revenue with period toggle and comparison.

**Inputs:**
- `metrics: InvoiceMetrics | null`
- `isLoading: boolean`

**Outputs:**
- `periodChanged: EventEmitter<'today' | 'week' | 'month'>`

**Template highlights:**
- Large revenue number (e.g., "R 45,230.50") centered
- Comparison badge: "↑ +12.3% vs last week" (color-coded: green for positive, red for negative)
- Three pill buttons: Today | This Week | This Month
- Loading state with skeleton

#### RevenueBreakdownChartComponent

**Purpose:** Horizontal bar chart of top 8 items by revenue.

**Inputs:**
- `byItemType: Map<string, number>`
- `isLoading: boolean`

**Data handling:**
- Sort by revenue descending
- Show top 8 items
- If more than 8, show "Other" category with rollup
- Use chart.js with horizontal bar chart type

**Colors:** Use Tailwind palette with consistent colors per item

#### QuickMetricsCardComponent

**Purpose:** Three stat boxes for key insights.

**Displays:**
- Total Items Delivered (this period)
- Avg Revenue per Item
- Unique Customers Billed

**Styling:** 3-column grid, each box has metric + icon

#### DetailTableComponent

**Purpose:** Full item-level breakdown with filtering.

**Features:**
- **Expandable:** Collapsed by default; toggle with "View Details" button
- **Table columns:** Item Name | Qty | Unit Price | Total Revenue | Customer | Delivered Date
- **Sorting:** Clickable headers to sort by any column
- **Filters (above table):**
  - Customer email (text input)
  - Delivery location (select dropdown)
  - Date range picker (flatpickr)
- **Actions:**
  - CSV export button (downloads current filtered results)
  - Loading state

**CSV export format:**
```
Item Name,Quantity,Unit Price,Total Revenue,Customer,Delivered Date
...
```

#### Main CeoDashboardComponent

**Structure:**
```html
<app-layout>
  <div class="ceo-dashboard">
    <!-- Header -->
    <div class="header">
      <h1>Revenue Dashboard</h1>
      <p class="subtitle">Invoice metrics focused view</p>
    </div>

    <!-- Revenue Summary Card -->
    <app-revenue-summary
      [metrics]="invoiceMetrics()"
      [isLoading]="isLoading()"
      (periodChanged)="onPeriodChanged($event)">
    </app-revenue-summary>

    <!-- Revenue Breakdown Chart -->
    <app-revenue-breakdown-chart
      [byItemType]="invoiceMetrics()?.by_item_type"
      [isLoading]="isLoading()">
    </app-revenue-breakdown-chart>

    <!-- Quick Metrics -->
    <app-quick-metrics
      [metrics]="invoiceMetrics()"
      [isLoading]="isLoading()">
    </app-quick-metrics>

    <!-- Detail Table (Expandable) -->
    <app-detail-table
      [lineItems]="invoiceMetrics()?.line_items"
      [isLoading]="isLoading()">
    </app-detail-table>
  </div>
</app-layout>
```

**Lifecycle:**
- `ngOnInit`: Call `ceo-dashboard.service.loadInvoiceMetrics()`
- `onPeriodChanged`: Call service with new period, component updates via signal

---

## Styling & Responsive Design

- **Tailwind CSS:** Use existing color palette (dark mode support included)
- **Layout:** Single-column on mobile, multi-column on desktop using Tailwind grid utilities
- **Card styling:** Reuse existing `.card` pattern from dashboard
- **Chart:** Full-width on desktop, scrollable on mobile
- **Table:** Horizontal scroll on small screens, sticky header

---

## Data Model Assumptions & Constraints

1. **Unit price field:** We assume `package_items` table has a `unit_price` column. If not, it will need to be added during implementation.
2. **Delivered/Collected status:** Only packages with status `'delivered'` or `'collected'` count toward revenue.
3. **Timestamp:** We use `collected_at` if available, otherwise `created_at` for grouping by period.
4. **Revenue calculation:** `quantity × unit_price`. No discounts or adjustments assumed.
5. **Null prices:** Items without a unit_price are excluded from invoice calculations.

---

## Success Criteria

- ✅ CEO can see total revenue for any 7-day period at a glance
- ✅ Period-over-period comparison shows growth / decline clearly
- ✅ Top revenue-driving products are immediately visible
- ✅ CEO can toggle between Today / Week / Month without page reload
- ✅ Detail view allows ad-hoc filtering and export for deeper analysis
- ✅ Dashboard loads within 2 seconds for typical data volumes
- ✅ Dark mode is fully supported

---

## Future Enhancements (Out of Scope)

- Forecasting / trendlines
- Real-time updates
- Custom date range picker
- Drill-down to customer-specific revenue
- Margin analysis (requires cost data)
- Invoice generation directly from dashboard

---

## Testing Strategy

- **Unit tests:** Service aggregation logic, date range calculations
- **Component tests:** Signal updates, period toggle behavior, empty states
- **Integration tests:** Service + component end-to-end (load metrics, toggle period, verify updates)
- **Mock data:** Pre-defined invoice metrics for component story tests

---

## Routing

Add route to `src/app/app.routes.ts`:

```typescript
{
  path: 'ceo-dashboard',
  loadComponent: () => import('./features/ceo-dashboard/ceo-dashboard').then(m => m.CeoDashboardComponent),
  canActivate: [authGuard], // Restrict to authenticated users
}
```

**Note:** Consider adding a role check (e.g., `isAdmin` or `isCEO`) if this should only be visible to the CEO. For now, treat it as admin-only.

---

## Dependencies

- Existing: Angular signals, Supabase client, chart.js, flatpickr, Tailwind CSS
- No new dependencies required

---

## Implementation Order

1. Add data models to `package.models.ts`
2. Create `ceo-dashboard.service.ts` with database queries
3. Build `revenue-summary` card component
4. Build `revenue-breakdown-chart` component
5. Build `quick-metrics` card component
6. Build `detail-table` component
7. Build main `ceo-dashboard` component
8. Add route and test end-to-end
9. Styling refinement and dark mode verification
10. Performance optimization (lazy loading, data caching)

