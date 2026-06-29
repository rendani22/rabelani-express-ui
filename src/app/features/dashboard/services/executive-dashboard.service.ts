import { Injectable, computed, inject, signal } from '@angular/core';
import { PACKAGE_STATUS, PackageStatus } from '../../../core';
import { SupabaseService } from '../../../shared/services/supabase.service';

/**
 * A single completed order, priced from inventory unit prices. Internal to the
 * service — aggregations are derived from these rows.
 */
interface CompletedOrder {
  id: string;
  reference: string;
  receiverEmail: string;
  status: PackageStatus;
  /** When the order was completed (collected → received → updated → created). */
  completedAt: Date;
  /** Σ(item.quantity × inventory unit_price) over the order's items. */
  value: number;
  items: Array<{ description: string; inventoryItemId: string | null; quantity: number; lineValue: number }>;
}

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
  /** True when the underlying query hit its row cap (figures may be partial). */
  truncated: boolean;
}

/** Status whose value counts as realized revenue (receiver has collected). */
const REALIZED_STATUS = PACKAGE_STATUS.COLLECTED;

/** Status at the collection point, awaiting pickup but not yet collected (pipeline). */
const PIPELINE_STATUS = PACKAGE_STATUS.READY_FOR_COLLECTION;

/** Statuses pulled from the DB: realized revenue + awaiting-collection pipeline. */
const LOADED_STATUSES: readonly PackageStatus[] = [REALIZED_STATUS, PIPELINE_STATUS];

/** Safety cap on rows pulled in one go. Logged when hit. */
const MAX_ROWS = 5000;

/**
 * Executive (CEO) revenue analytics.
 *
 * Revenue is realized when the receiver **collects** an order. The service
 * loads collected orders (realized) plus ready-for-collection orders awaiting
 * pickup (pipeline), prices each from inventory `unit_price`, and exposes
 * money-centric aggregations: period KPIs, value-over-time trends, and top
 * customers/items — all computed on collected (realized) orders. The pricing
 * basis (qty × unit_price) matches the Purchase Orders "delivered value", so
 * figures reconcile across the app.
 *
 * Admin-only: the Executive tab that consumes this is gated on `isAdmin`, and
 * the underlying tables are additionally protected by Supabase RLS.
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

  /** Collected (realized-revenue) orders — the basis for every aggregation. */
  private readonly _orders = signal<CompletedOrder[]>([]);
  /** Value/count of delivered orders awaiting collection (pipeline). */
  private readonly _pipelineValue = signal(0);
  private readonly _pipelineOrders = signal(0);
  private readonly _truncated = signal(false);

  // ============================================================================
  // Derived aggregations
  // ============================================================================

  readonly summary = computed<RevenueSummary>(() => {
    const orders = this._orders();
    const totalValue = orders.reduce((s, o) => s + o.value, 0);
    return {
      totalValue,
      totalOrders: orders.length,
      avgOrderValue: orders.length > 0 ? totalValue / orders.length : 0,
      pipelineValue: this._pipelineValue(),
      pipelineOrders: this._pipelineOrders(),
      truncated: this._truncated(),
    };
  });

  readonly kpis = computed<RevenueKpi[]>(() => {
    const orders = this._orders();
    const now = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = addDays(startOfToday, -1);

    const startOfWeek = startOfISOWeek(now);
    const startOfPrevWeek = addDays(startOfWeek, -7);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const startOfPrevYear = new Date(now.getFullYear() - 1, 0, 1);

    const today = this.window(orders, startOfToday, null);
    const yesterday = this.window(orders, startOfYesterday, startOfToday);
    const thisWeek = this.window(orders, startOfWeek, null);
    const prevWeek = this.window(orders, startOfPrevWeek, startOfWeek);
    const thisMonth = this.window(orders, startOfMonth, null);
    const prevMonth = this.window(orders, startOfPrevMonth, startOfMonth);
    const thisYear = this.window(orders, startOfYear, null);
    const prevYear = this.window(orders, startOfPrevYear, startOfYear);
    const all = this.window(orders, null, null);

    return [
      this.toKpi('today', 'Today', 'vs yesterday', today, yesterday),
      this.toKpi('week', 'This Week', 'vs last week', thisWeek, prevWeek),
      this.toKpi('month', 'This Month', 'vs last month', thisMonth, prevMonth),
      this.toKpi('year', 'This Year', 'vs last year', thisYear, prevYear),
      this.toKpi('all', 'All Time', null, all, null),
    ];
  });

  readonly trends = computed<RevenueTrends>(() => {
    const orders = this._orders();
    return {
      day: this.bucketDays(orders, 30),
      week: this.bucketWeeks(orders, 12),
      month: this.bucketMonths(orders, 12),
      year: this.bucketYears(orders, 5),
    };
  });

  readonly topCustomers = computed<TopRevenueCustomer[]>(() => {
    const grouped = new Map<string, { value: number; orders: number }>();
    for (const o of this._orders()) {
      const key = o.receiverEmail || '(unknown)';
      const bucket = grouped.get(key) ?? { value: 0, orders: 0 };
      bucket.value += o.value;
      bucket.orders += 1;
      grouped.set(key, bucket);
    }
    return Array.from(grouped.entries())
      .map(([email, b]) => ({
        email,
        name: prettifyEmail(email),
        value: b.value,
        orders: b.orders,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  });

  readonly topItems = computed<TopRevenueItem[]>(() => {
    const grouped = new Map<string, { value: number; quantity: number; orders: Set<string>; invId: string | null }>();
    for (const o of this._orders()) {
      for (const item of o.items) {
        if (item.lineValue <= 0) continue;
        const key = (item.description || '').trim().toLowerCase() || '(unnamed)';
        const bucket = grouped.get(key) ?? { value: 0, quantity: 0, orders: new Set<string>(), invId: item.inventoryItemId };
        bucket.value += item.lineValue;
        bucket.quantity += item.quantity;
        bucket.orders.add(o.id);
        if (!bucket.invId && item.inventoryItemId) bucket.invId = item.inventoryItemId;
        grouped.set(key, bucket);
      }
    }
    return Array.from(grouped.entries())
      .map(([key, b]) => ({
        description: titleCase(key),
        inventoryItemId: b.invId,
        value: b.value,
        quantity: b.quantity,
        orders: b.orders.size,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  });

  // ============================================================================
  // Loading
  // ============================================================================

  /** Loads completed orders and prices them. Safe to call repeatedly (refresh). */
  async load(force = false): Promise<void> {
    if (this._isLoading()) return;
    if (this._loaded() && !force) return;

    this._isLoading.set(true);
    this._error.set(null);

    try {
      const { data, error } = await this.supabase.client
        .from('packages')
        .select(
          'id, reference, receiver_email, status, created_at, updated_at, received_at, collected_at, ' +
            'items:package_items(quantity, description, inventory_item_id)',
        )
        .in('status', LOADED_STATUSES as PackageStatus[])
        .is('deleted_at', null)
        .limit(MAX_ROWS);

      if (error) {
        this._error.set(error.message);
        return;
      }

      const rows = (data ?? []) as unknown as PackageRow[];
      this._truncated.set(rows.length >= MAX_ROWS);

      // Price every referenced inventory item in one round-trip.
      const inventoryIds = Array.from(
        new Set(
          rows.flatMap(r => (r.items ?? []).map(i => i.inventory_item_id).filter((id): id is string => !!id)),
        ),
      );
      const priceByItemId = await this.loadUnitPrices(inventoryIds);

      const orders: CompletedOrder[] = rows.map(r => {
        const items = (r.items ?? []).map(i => {
          const qty = Number(i.quantity) || 0;
          const unitPrice = i.inventory_item_id ? priceByItemId.get(i.inventory_item_id) ?? 0 : 0;
          return {
            description: i.description ?? '',
            inventoryItemId: i.inventory_item_id ?? null,
            quantity: qty,
            lineValue: qty * unitPrice,
          };
        });
        return {
          id: r.id,
          reference: r.reference,
          receiverEmail: r.receiver_email,
          status: r.status,
          completedAt: completionDate(r),
          value: items.reduce((s, it) => s + it.lineValue, 0),
          items,
        };
      });

      // Split into realized revenue (collected) and awaiting-collection pipeline
      // (ready for collection). All aggregations run on collected orders only.
      const collected = orders.filter(o => o.status === REALIZED_STATUS);
      const pipeline = orders.filter(o => o.status === PIPELINE_STATUS);

      this._orders.set(collected);
      this._pipelineValue.set(pipeline.reduce((s, o) => s + o.value, 0));
      this._pipelineOrders.set(pipeline.length);
      this._lastUpdated.set(new Date());
      this._loaded.set(true);

      if (this._truncated()) {
        console.warn(`[ExecutiveDashboardService] Completed-order query hit the ${MAX_ROWS}-row cap; figures may be partial.`);
      }
    } catch (err) {
      this._error.set(err instanceof Error ? err.message : 'Failed to load executive analytics.');
    } finally {
      this._isLoading.set(false);
    }
  }

  private async loadUnitPrices(inventoryIds: string[]): Promise<Map<string, number>> {
    const priceByItemId = new Map<string, number>();
    if (inventoryIds.length === 0) return priceByItemId;

    const { data, error } = await this.supabase.client
      .from('inventory_items')
      .select('id, unit_price')
      .in('id', inventoryIds);

    if (error || !data) return priceByItemId;

    for (const item of data as Array<{ id: string; unit_price: number | null }>) {
      const price = Number(item.unit_price);
      if (!Number.isNaN(price)) priceByItemId.set(item.id, price);
    }
    return priceByItemId;
  }

  // ============================================================================
  // Aggregation helpers
  // ============================================================================

  /** Orders whose completion falls in [start, end). Null bound = open-ended. */
  private window(orders: CompletedOrder[], start: Date | null, end: Date | null): { value: number; orders: number } {
    let value = 0;
    let count = 0;
    for (const o of orders) {
      const t = o.completedAt.getTime();
      if (start && t < start.getTime()) continue;
      if (end && t >= end.getTime()) continue;
      value += o.value;
      count += 1;
    }
    return { value, orders: count };
  }

  private toKpi(
    key: RevenueKpi['key'],
    label: string,
    comparisonLabel: string | null,
    current: { value: number; orders: number },
    previous: { value: number; orders: number } | null,
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

  private bucketDays(orders: CompletedOrder[], count: number): RevenueTrendPoint[] {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const points: RevenueTrendPoint[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const day = addDays(start, -i);
      points.push({ key: isoDate(day), label: shortDate(day), value: 0, orders: 0 });
    }
    const index = new Map(points.map((p, i) => [p.key, i]));
    for (const o of orders) {
      const idx = index.get(isoDate(o.completedAt));
      if (idx !== undefined) {
        points[idx].value += o.value;
        points[idx].orders += 1;
      }
    }
    return points;
  }

  private bucketWeeks(orders: CompletedOrder[], count: number): RevenueTrendPoint[] {
    const thisWeek = startOfISOWeek(new Date());
    const points: RevenueTrendPoint[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const weekStart = addDays(thisWeek, -7 * i);
      points.push({ key: isoDate(weekStart), label: shortDate(weekStart), value: 0, orders: 0 });
    }
    const starts = points.map(p => new Date(`${p.key}T00:00:00`).getTime());
    for (const o of orders) {
      const t = o.completedAt.getTime();
      if (t < starts[0]) continue;
      // Find the latest week-start that is <= completion time.
      let idx = -1;
      for (let i = 0; i < starts.length; i++) {
        if (t >= starts[i]) idx = i;
      }
      if (idx >= 0) {
        points[idx].value += o.value;
        points[idx].orders += 1;
      }
    }
    return points;
  }

  private bucketMonths(orders: CompletedOrder[], count: number): RevenueTrendPoint[] {
    const now = new Date();
    const points: RevenueTrendPoint[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      points.push({ key: monthKey(d), label: monthLabel(d), value: 0, orders: 0 });
    }
    const index = new Map(points.map((p, i) => [p.key, i]));
    for (const o of orders) {
      const idx = index.get(monthKey(o.completedAt));
      if (idx !== undefined) {
        points[idx].value += o.value;
        points[idx].orders += 1;
      }
    }
    return points;
  }

  private bucketYears(orders: CompletedOrder[], count: number): RevenueTrendPoint[] {
    const thisYear = new Date().getFullYear();
    const points: RevenueTrendPoint[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const year = thisYear - i;
      points.push({ key: String(year), label: String(year), value: 0, orders: 0 });
    }
    const index = new Map(points.map((p, i) => [p.key, i]));
    for (const o of orders) {
      const idx = index.get(String(o.completedAt.getFullYear()));
      if (idx !== undefined) {
        points[idx].value += o.value;
        points[idx].orders += 1;
      }
    }
    return points;
  }
}

// ============================================================================
// Row types & pure date/format helpers
// ============================================================================

interface PackageRow {
  id: string;
  reference: string;
  receiver_email: string;
  status: PackageStatus;
  created_at: string;
  updated_at: string | null;
  received_at: string | null;
  collected_at: string | null;
  items?: Array<{ quantity: number | string; description: string | null; inventory_item_id: string | null }>;
}

/** Best available "completed at" timestamp for a finished order. */
function completionDate(r: PackageRow): Date {
  const iso = r.collected_at ?? r.received_at ?? r.updated_at ?? r.created_at;
  return new Date(iso);
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Monday-based start of the ISO week containing `date`, at local midnight. */
function startOfISOWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift back to Monday
  return addDays(d, diff);
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
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
