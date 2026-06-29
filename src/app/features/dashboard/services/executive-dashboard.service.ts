import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../../shared/services/supabase.service';

/** Revenue + volume for a named reporting period, with period-over-period delta. */
export interface RevenueKpi {
  key: 'today' | 'week' | 'month' | 'year' | 'all';
  label: string;
  /** Sub-label describing the comparison baseline (e.g. "vs yesterday"). */
  comparisonLabel: string | null;
  value: number;
  orders: number;
  /** Average value per completed order in the period. */
  avgOrderValue: number;
  /** Value change vs the previous comparable period, as a percentage. Null for all-time. */
  deltaPercent: number | null;
  /** Whether the delta is an increase (for arrow direction/colour). */
  deltaUp: boolean;
}

/** A point on a revenue-over-time series. */
export interface RevenueTrendPoint {
  key: string;
  label: string;
  value: number;
  orders: number;
}

/** All four granularities of the revenue trend, pre-bucketed. */
export interface RevenueTrends {
  day: RevenueTrendPoint[];
  week: RevenueTrendPoint[];
  month: RevenueTrendPoint[];
  year: RevenueTrendPoint[];
}

/** Top customer (receiver) ranked by completed-order value. */
export interface TopRevenueCustomer {
  email: string;
  name: string;
  value: number;
  orders: number;
}

/** Top inventory item ranked by completed-order value. */
export interface TopRevenueItem {
  description: string;
  inventoryItemId: string | null;
  value: number;
  quantity: number;
  orders: number;
}

/** Headline figures across the collected-order book. */
export interface RevenueSummary {
  /** Realized value — orders the receiver has collected. */
  totalValue: number;
  totalOrders: number;
  avgOrderValue: number;
  /** Value at the collection point, awaiting pickup (not yet collected). */
  pipelineValue: number;
  pipelineOrders: number;
  /**
   * True when the underlying query hit its row cap (figures may be partial).
   * Always false now that aggregation runs server-side, but retained so the
   * UI banner contract is stable.
   */
  truncated: boolean;
}

/** Current + prior-period value/volume, used to derive KPI deltas. */
interface PeriodFigure {
  value: number;
  orders: number;
}

/** A raw, unlabelled trend point as returned by the RPC. */
interface RawTrendPoint {
  key: string;
  value: number;
  orders: number;
}

/**
 * Raw shape of the JSON document returned by the `get_executive_metrics`
 * Postgres RPC. All aggregation happens server-side; this service only maps
 * the payload onto the presentation signals below and applies presentation
 * concerns (labels, customer display names).
 */
interface ExecutiveMetricsPayload {
  summary: RevenueSummary;
  periods: {
    today: PeriodFigure;
    yesterday: PeriodFigure;
    week: PeriodFigure;
    prevWeek: PeriodFigure;
    month: PeriodFigure;
    prevMonth: PeriodFigure;
    year: PeriodFigure;
    prevYear: PeriodFigure;
    all: PeriodFigure;
  };
  trends: {
    day: RawTrendPoint[];
    week: RawTrendPoint[];
    month: RawTrendPoint[];
    year: RawTrendPoint[];
  };
  topCustomers: Array<{ email: string; value: number; orders: number }>;
  topItems: Array<{
    description: string;
    inventoryItemId: string | null;
    value: number;
    quantity: number;
    orders: number;
  }>;
}

const EMPTY_SUMMARY: RevenueSummary = {
  totalValue: 0,
  totalOrders: 0,
  avgOrderValue: 0,
  pipelineValue: 0,
  pipelineOrders: 0,
  truncated: false,
};

const EMPTY_TRENDS: RevenueTrends = { day: [], week: [], month: [], year: [] };

/**
 * Executive (CEO) revenue analytics.
 *
 * Fetches pre-aggregated revenue metrics from the `get_executive_metrics`
 * Postgres RPC and exposes them as reactive signals. Revenue is realized when
 * the receiver **collects** an order; the RPC prices each order from inventory
 * `unit_price` (qty × unit_price, matching the Purchase Orders "delivered
 * value") and computes period KPIs, value-over-time trends, and top
 * customers/items across the full tables — one round trip, no PostgREST
 * row cap. This service only maps the payload and applies presentation
 * (labels, display names).
 *
 * Admin-only: the Executive tab that consumes this is gated on `isAdmin`, and
 * the underlying RPC/tables are additionally protected by Supabase RLS.
 */
@Injectable({ providedIn: 'root' })
export class ExecutiveDashboardService {
  private readonly supabase = inject(SupabaseService);

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  private readonly _loaded = signal(false);
  readonly loaded = this._loaded.asReadonly();

  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  /** Most recent successful refresh time, for the "as of" label. */
  private readonly _lastUpdated = signal<Date | null>(null);
  readonly lastUpdated = this._lastUpdated.asReadonly();

  private readonly _summary = signal<RevenueSummary>(EMPTY_SUMMARY);
  readonly summary = this._summary.asReadonly();

  private readonly _kpis = signal<RevenueKpi[]>([]);
  readonly kpis = this._kpis.asReadonly();

  private readonly _trends = signal<RevenueTrends>(EMPTY_TRENDS);
  readonly trends = this._trends.asReadonly();

  private readonly _topCustomers = signal<TopRevenueCustomer[]>([]);
  readonly topCustomers = this._topCustomers.asReadonly();

  private readonly _topItems = signal<TopRevenueItem[]>([]);
  readonly topItems = this._topItems.asReadonly();

  // ============================================================================
  // Loading
  // ============================================================================

  /**
   * Loads executive metrics via the server-side aggregation RPC. Safe to call
   * repeatedly (refresh); skips redundant loads unless `force` is set.
   */
  async load(force = false): Promise<void> {
    if (this._isLoading()) return;
    if (this._loaded() && !force) return;

    this._isLoading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await this.supabase.client.rpc('get_executive_metrics');

      if (error || !data) {
        this._error.set(error?.message ?? 'Failed to load executive analytics.');
        return;
      }

      this.applyMetrics(data as ExecutiveMetricsPayload);
      this._lastUpdated.set(new Date());
      this._loaded.set(true);
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Failed to load executive analytics.');
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Payload mapping
  // ============================================================================

  /** Maps the RPC payload onto the presentation signals. */
  private applyMetrics(m: ExecutiveMetricsPayload): void {
    this._summary.set({ ...EMPTY_SUMMARY, ...m.summary });
    this._kpis.set(this.buildKpis(m.periods));
    this._trends.set(this.buildTrends(m.trends));
    this._topCustomers.set(
      (m.topCustomers ?? []).map(c => ({
        email: c.email,
        name: prettifyEmail(c.email),
        value: c.value,
        orders: c.orders,
      })),
    );
    this._topItems.set(
      (m.topItems ?? []).map(i => ({
        description: titleCase(i.description),
        inventoryItemId: i.inventoryItemId,
        value: i.value,
        quantity: i.quantity,
        orders: i.orders,
      })),
    );
  }

  private buildKpis(p: ExecutiveMetricsPayload['periods']): RevenueKpi[] {
    return [
      this.toKpi('today', 'Today', 'vs yesterday', p.today, p.yesterday),
      this.toKpi('week', 'This Week', 'vs last week', p.week, p.prevWeek),
      this.toKpi('month', 'This Month', 'vs last month', p.month, p.prevMonth),
      this.toKpi('year', 'This Year', 'vs last year', p.year, p.prevYear),
      this.toKpi('all', 'All Time', null, p.all, null),
    ];
  }

  private toKpi(
    key: RevenueKpi['key'],
    label: string,
    comparisonLabel: string | null,
    current: PeriodFigure,
    previous: PeriodFigure | null,
  ): RevenueKpi {
    let deltaPercent: number | null = null;
    if (previous) {
      if (previous.value > 0) {
        deltaPercent = ((current.value - previous.value) / previous.value) * 100;
      } else {
        deltaPercent = current.value > 0 ? 100 : 0;
      }
    }
    return {
      key,
      label,
      comparisonLabel,
      value: current.value,
      orders: current.orders,
      avgOrderValue: current.orders > 0 ? current.value / current.orders : 0,
      deltaPercent,
      deltaUp: (deltaPercent ?? 0) >= 0,
    };
  }

  private buildTrends(t: ExecutiveMetricsPayload['trends']): RevenueTrends {
    return {
      day: (t?.day ?? []).map(p => ({ ...p, label: shortDate(parseLocalDate(p.key)) })),
      week: (t?.week ?? []).map(p => ({ ...p, label: shortDate(parseLocalDate(p.key)) })),
      month: (t?.month ?? []).map(p => ({ ...p, label: monthLabel(parseMonthKey(p.key)) })),
      year: (t?.year ?? []).map(p => ({ ...p, label: p.key })),
    };
  }
}

// ============================================================================
// Pure date/format helpers
// ============================================================================

/** Parse a `YYYY-MM-DD` key as a local date (avoids UTC-midnight day shift). */
function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Parse a `YYYY-MM` month key to the first of that month, local time. */
function parseMonthKey(key: string): Date {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, 1);
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' });
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' });
}

function prettifyEmail(email: string): string {
  const local = email.split('@')[0] ?? email;
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}
