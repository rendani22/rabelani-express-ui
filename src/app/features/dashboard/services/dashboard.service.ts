import { Injectable, inject, signal, computed } from '@angular/core';
import { PACKAGE_STATUS, PackageStatus } from '../../../core';
import { SupabaseService } from '../../../shared/services/supabase.service';
import { StaffProfile } from '../../../core/models/staff-profile.model';

/**
 * Dashboard statistics for package overview
 */
export interface PackageStats {
  total: number;
  pending: number;
  inTransit: number;
  readyForCollection: number;
  completed: number;
  returned: number;
  todayCount: number;
  weeklyCount: number;
  monthlyCount: number;
}

/**
 * Status distribution item for charts
 */
export interface StatusDistribution {
  label: string;
  value: number;
  color: string;
  status: PackageStatus;
}

/**
 * Time series data point
 */
export interface TimeSeriesDataPoint {
  date: string;
  label: string;
  count: number;
}

/**
 * Recent package activity item
 */
export interface PackageActivity {
  id: string;
  reference: string;
  receiverEmail: string;
  status: PackageStatus;
  statusLabel: string;
  createdAt: Date;
  timeAgo: string;
}

/**
 * Driver statistics for dashboard
 */
export interface DriverStats {
  total: number;
  active: number;
  onDelivery: number;
  packagesInTransit: number;
  totalPackages: number;
  drivers: StaffProfile[];
}

/**
 * POD (Proof of Delivery) statistics
 */
export interface PodStats {
  total: number;
  withPdf: number;
  locked: number;
  today: number;
  thisWeek: number;
}

/**
 * Delivery location package count
 */
export interface LocationDistribution {
  id: string;
  name: string;
  count: number;
  unassigned?: boolean;
}

/**
 * Top receiver by package count
 */
export interface TopReceiver {
  email: string;
  name: string;
  count: number;
}

/**
 * Per-driver delivery performance row.
 */
export interface DriverPerformance {
  driverUserId: string;
  name: string;
  pickups: number;
  delivered: number;
  inTransit: number;
  /** Average hours from picked_up_at → received_at (or collected_at when no received) */
  avgDeliveryHours: number | null;
  completionRate: number;
}

/**
 * Aggregated package lifecycle / cycle-time metrics across the period.
 */
export interface LifecycleMetrics {
  /** Average hours: created → picked up */
  avgCreateToPickupHours: number | null;
  /** Average hours: picked up → received at collection point */
  avgPickupToReceiveHours: number | null;
  /** Average hours: received at collection point → collected by receiver */
  avgReceiveToCollectHours: number | null;
  /** Average hours: created → collected (full lifecycle) */
  avgTotalCycleHours: number | null;
  /** Number of fully-completed packages used to compute totalCycle */
  completedSampleSize: number;
}

/** A package that has been "stuck" in a status longer than the SLA threshold. */
export interface StuckPackage {
  id: string;
  reference: string;
  status: PackageStatus;
  statusLabel: string;
  hoursStuck: number;
  thresholdHours: number;
  receiverEmail: string;
}

/** Inventory health snapshot for the dashboard. */
export interface InventoryHealth {
  totalItems: number;
  activeItems: number;
  lowStock: number;
  outOfStock: number;
  totalQuantity: number;
  totalValue: number;
  /** Items below threshold sorted by severity, top 5. */
  topLowStock: Array<{ id: string; name: string; quantity: number; threshold: number }>;
}

/** A frequently-shipped item (joined from `package_items`). */
export interface TopShippedItem {
  description: string;
  /** Sum of `quantity` across package_items rows in scope. */
  totalQuantity: number;
  /** Number of packages this item appeared in. */
  packageCount: number;
  /** Optional inventory item id, when linked. */
  inventoryItemId: string | null;
  /** Matching package ids for deep-linking into Orders. */
  packageIds: string[];
}

/**
 * Hourly activity heatmap. 7 rows (Sun..Sat), 24 columns (00..23).
 * Values are package-creation counts.
 */
export interface HourlyHeatmap {
  /** counts[dayOfWeek0..6][hour0..23]. dayOfWeek 0=Sun … 6=Sat (matches Date#getDay()) */
  counts: number[][];
  max: number;
  total: number;
}

/**
 * Raw shape of the JSON document returned by the `get_dashboard_metrics`
 * Postgres RPC. All aggregation happens server-side; this service only maps
 * the payload onto the presentation signals below.
 */
interface DashboardMetricsPayload {
  stats: PackageStats;
  statusCounts: Record<string, number>;
  weeklyTimeSeries: Array<{ date: string; count: number }>;
  monthlyTimeSeries: Array<{ date: string; count: number }>;
  recentActivity: Array<{
    id: string;
    reference: string;
    receiverEmail: string;
    status: PackageStatus;
    createdAt: string;
  }>;
  topReceivers: Array<{ email: string; count: number }>;
  hourlyBuckets: Array<{ dow: number; hour: number; count: number }>;
  driverPerformance: DriverPerformance[];
  lifecycleMetrics: LifecycleMetrics;
  stuckPackages: Array<Omit<StuckPackage, 'statusLabel'>>;
  driverStats: DriverStats;
  podStats: PodStats;
  locationDistribution: LocationDistribution[];
  inventoryHealth: InventoryHealth;
  topShippedItems: Array<Omit<TopShippedItem, 'description'> & { description: string }>;
}

/**
 * Dashboard Service
 *
 * Fetches pre-aggregated dashboard metrics from the `get_dashboard_metrics`
 * Postgres RPC and exposes them as reactive signals. Aggregation is done in
 * the database (one round trip, no PostgREST 1000-row cap); this service is
 * only responsible for mapping the payload and applying presentation concerns
 * (labels, colours, relative times).
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly supabaseService = inject(SupabaseService);

  // ============================================================================
  // State Signals
  // ============================================================================

  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  private readonly _stats = signal<PackageStats>({
    total: 0,
    pending: 0,
    inTransit: 0,
    readyForCollection: 0,
    completed: 0,
    returned: 0,
    todayCount: 0,
    weeklyCount: 0,
    monthlyCount: 0,
  });
  readonly stats = this._stats.asReadonly();

  private readonly _statusDistribution = signal<StatusDistribution[]>([]);
  readonly statusDistribution = this._statusDistribution.asReadonly();

  private readonly _weeklyTimeSeries = signal<TimeSeriesDataPoint[]>([]);
  readonly weeklyTimeSeries = this._weeklyTimeSeries.asReadonly();

  private readonly _monthlyTimeSeries = signal<TimeSeriesDataPoint[]>([]);
  readonly monthlyTimeSeries = this._monthlyTimeSeries.asReadonly();

  private readonly _recentActivity = signal<PackageActivity[]>([]);
  readonly recentActivity = this._recentActivity.asReadonly();

  private readonly _driverStats = signal<DriverStats>({
    total: 0,
    active: 0,
    onDelivery: 0,
    packagesInTransit: 0,
    totalPackages: 0,
    drivers: [],
  });
  readonly driverStats = this._driverStats.asReadonly();

  private readonly _podStats = signal<PodStats>({
    total: 0,
    withPdf: 0,
    locked: 0,
    today: 0,
    thisWeek: 0,
  });
  readonly podStats = this._podStats.asReadonly();

  private readonly _locationDistribution = signal<LocationDistribution[]>([]);
  readonly locationDistribution = this._locationDistribution.asReadonly();

  private readonly _topReceivers = signal<TopReceiver[]>([]);
  readonly topReceivers = this._topReceivers.asReadonly();

  private readonly _driverPerformance = signal<DriverPerformance[]>([]);
  readonly driverPerformance = this._driverPerformance.asReadonly();

  private readonly _lifecycleMetrics = signal<LifecycleMetrics>({
    avgCreateToPickupHours: null,
    avgPickupToReceiveHours: null,
    avgReceiveToCollectHours: null,
    avgTotalCycleHours: null,
    completedSampleSize: 0,
  });
  readonly lifecycleMetrics = this._lifecycleMetrics.asReadonly();

  private readonly _stuckPackages = signal<StuckPackage[]>([]);
  readonly stuckPackages = this._stuckPackages.asReadonly();

  private readonly _inventoryHealth = signal<InventoryHealth>({
    totalItems: 0,
    activeItems: 0,
    lowStock: 0,
    outOfStock: 0,
    totalQuantity: 0,
    totalValue: 0,
    topLowStock: [],
  });
  readonly inventoryHealth = this._inventoryHealth.asReadonly();

  private readonly _topShippedItems = signal<TopShippedItem[]>([]);
  readonly topShippedItems = this._topShippedItems.asReadonly();

  private readonly _hourlyHeatmap = signal<HourlyHeatmap>({
    counts: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
    total: 0,
  });
  readonly hourlyHeatmap = this._hourlyHeatmap.asReadonly();

  // ============================================================================
  // Computed Values
  // ============================================================================

  readonly completionRate = computed(() => {
    const stats = this._stats();
    if (stats.total === 0) return 0;
    return Math.round((stats.completed / stats.total) * 100);
  });

  readonly pendingRate = computed(() => {
    const stats = this._stats();
    if (stats.total === 0) return 0;
    return Math.round((stats.pending / stats.total) * 100);
  });

  readonly returnRate = computed(() => {
    const stats = this._stats();
    if (stats.total === 0) return 0;
    return Math.round((stats.returned / stats.total) * 1000) / 10; // 1 decimal
  });

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Load all dashboard data via the server-side aggregation RPC.
   *
   * A single `get_dashboard_metrics` call returns every metric the dashboard
   * renders, computed across the full tables in Postgres. If the call fails
   * the existing signals are left untouched so a transient error doesn't blank
   * the dashboard.
   */
  async loadDashboardData(dateRange?: { start: Date; end?: Date }): Promise<void> {
    this._isLoading.set(true);

    const dateFrom = dateRange?.start?.toISOString() ?? null;
    const dateTo = dateRange?.end
      ? this.toEndOfDay(dateRange.end)
      : dateRange?.start
        ? this.toEndOfDay(dateRange.start)
        : null;

    try {
      const { data, error } = await this.supabaseService.client.rpc('get_dashboard_metrics', {
        p_date_from: dateFrom,
        p_date_to: dateTo,
      });

      if (error || !data) {
        console.error('[DashboardService] get_dashboard_metrics failed:', error);
        return;
      }

      this.applyMetrics(data as DashboardMetricsPayload);
    } catch (err) {
      console.warn('[DashboardService] Failed to load POD stats:', err);
    }
  }

  private async loadLocationDistribution(dateFrom?: string, dateTo?: string): Promise<void> {
    try {
      // Load active delivery locations
      const { data: locations } = await this.supabaseService.client
        .from('delivery_locations')
        .select('id, name')
        .eq('is_active', true)
        .order('name');

      // Load packages with their delivery_location_id, optionally filtered by date
      let pkgQuery = this.supabaseService.client
        .from('packages')
        .select('delivery_location_id')
        .is('deleted_at', null);

      if (dateFrom) {
        pkgQuery = pkgQuery.gte('created_at', dateFrom);
      }
      if (dateTo) {
        pkgQuery = pkgQuery.lte('created_at', dateTo);
      }

      const { data: packages } = await pkgQuery;

      if (!packages) return;

      // Count packages per location
      const countMap = new Map<string, number>();
      let unassignedCount = 0;

      for (const pkg of packages as Array<{ delivery_location_id: string | null }>) {
        if (pkg.delivery_location_id) {
          countMap.set(pkg.delivery_location_id, (countMap.get(pkg.delivery_location_id) ?? 0) + 1);
        } else {
          unassignedCount++;
        }
      }

      const locationList: LocationDistribution[] = (locations ?? [])
        .map((loc: { id: string; name: string }) => ({
          id: loc.id,
          name: loc.name,
          count: countMap.get(loc.id) ?? 0,
        }))
        .filter(l => l.count > 0)
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

      if (unassignedCount > 0) {
        locationList.push({ id: 'unassigned', name: 'No Location', count: unassignedCount, unassigned: true });
      }

      this._locationDistribution.set(locationList);
    } catch (err) {
      console.warn('[DashboardService] Failed to load location distribution:', err);
    }
  }

  /**
   * Loads per-driver pickup/delivery counts. Aggregations are done client-side
   * because Supabase REST does not support GROUP BY.
   */
  private async loadDriverPerformance(dateFrom?: string, dateTo?: string): Promise<void> {
    try {
      // 1. Load all drivers for name resolution
      const { data: driversData } = await this.supabaseService.client
        .from('staff_profiles')
        .select('user_id, full_name, is_active')
        .eq('role', 'driver');

      const drivers = (driversData ?? []) as Array<{ user_id: string; full_name: string; is_active: boolean }>;
      const nameByUserId = new Map(drivers.map(d => [d.user_id, d.full_name]));

      // 2. Load packages with driver assignment within the date range
      let pkgQuery = this.supabaseService.client
        .from('packages')
        .select('id, status, picked_up_by, picked_up_at, received_at, collected_at')
        .not('picked_up_by', 'is', null)
        .is('deleted_at', null);

      if (dateFrom) pkgQuery = pkgQuery.gte('created_at', dateFrom);
      if (dateTo) pkgQuery = pkgQuery.lte('created_at', dateTo);

      const { data: pkgs, error } = await pkgQuery;
      if (error || !pkgs) return;

      type Row = {
        id: string;
        status: PackageStatus;
        picked_up_by: string;
        picked_up_at: string | null;
        received_at: string | null;
        collected_at: string | null;
      };

      const byDriver = new Map<string, { pickups: number; delivered: number; inTransit: number; hours: number[] }>();

      (pkgs as Row[]).forEach(p => {
        const bucket = byDriver.get(p.picked_up_by) ?? { pickups: 0, delivered: 0, inTransit: 0, hours: [] };
        bucket.pickups++;

        if (p.status === PACKAGE_STATUS.IN_TRANSIT) bucket.inTransit++;
        const isDelivered =
          p.status === PACKAGE_STATUS.READY_FOR_COLLECTION ||
          p.status === PACKAGE_STATUS.COLLECTED ||
          p.status === PACKAGE_STATUS.DELIVERED;
        if (isDelivered) bucket.delivered++;

        // pickup → received (or collected when received_at missing)
        const endIso = p.received_at ?? p.collected_at;
        if (p.picked_up_at && endIso) {
          const hrs = (new Date(endIso).getTime() - new Date(p.picked_up_at).getTime()) / 3600000;
          if (hrs >= 0 && hrs < 24 * 30) bucket.hours.push(hrs); // sanity cap
        }

        byDriver.set(p.picked_up_by, bucket);
      });

      const totalDelivered = Array.from(byDriver.values()).reduce((s, b) => s + b.delivered, 0);

      const performance: DriverPerformance[] = Array.from(byDriver.entries())
        .map(([userId, b]) => ({
          driverUserId: userId,
          name: nameByUserId.get(userId) ?? 'Unknown driver',
          pickups: b.pickups,
          delivered: b.delivered,
          inTransit: b.inTransit,
          avgDeliveryHours:
            b.hours.length > 0
              ? Math.round((b.hours.reduce((s, h) => s + h, 0) / b.hours.length) * 10) / 10
              : null,
          completionRate: totalDelivered > 0 ? Math.round((b.delivered / totalDelivered) * 100) : 0,
        }))
        .sort((a, b) => b.delivered - a.delivered || b.pickups - a.pickups)
        .slice(0, 8);

      this._driverPerformance.set(performance);
    } catch (err) {
      console.warn('[DashboardService] Failed to load driver performance:', err);
    }
  }

  /**
   * Loads aggregate lifecycle/cycle-time metrics and the list of packages
   * stuck longer than the per-status SLA thresholds.
   */
  private async loadLifecycleAndStuck(dateFrom?: string, dateTo?: string): Promise<void> {
    try {
      // Pull lifecycle timestamps for all in-scope packages
      let q = this.supabaseService.client
        .from('packages')
        .select('id, reference, status, receiver_email, created_at, updated_at, picked_up_at, received_at, collected_at')
        .is('deleted_at', null);

      if (dateFrom) q = q.gte('created_at', dateFrom);
      if (dateTo) q = q.lte('created_at', dateTo);

      const { data, error } = await q;
      if (error || !data) return;

      type Row = {
        id: string;
        reference: string;
        status: PackageStatus;
        receiver_email: string;
        created_at: string;
        updated_at: string;
        picked_up_at: string | null;
        received_at: string | null;
        collected_at: string | null;
      };

      const rows = data as Row[];

      const c2pSamples: number[] = [];
      const p2rSamples: number[] = [];
      const r2cSamples: number[] = [];
      const totalSamples: number[] = [];

      for (const r of rows) {
        const created = new Date(r.created_at).getTime();
        const pickedUp = r.picked_up_at ? new Date(r.picked_up_at).getTime() : null;
        const received = r.received_at ? new Date(r.received_at).getTime() : null;
        const collected = r.collected_at ? new Date(r.collected_at).getTime() : null;

        if (pickedUp && pickedUp >= created) c2pSamples.push((pickedUp - created) / 3600000);
        if (pickedUp && received && received >= pickedUp) p2rSamples.push((received - pickedUp) / 3600000);
        if (received && collected && collected >= received) r2cSamples.push((collected - received) / 3600000);
        if (collected && collected >= created && r.status === PACKAGE_STATUS.COLLECTED) {
          totalSamples.push((collected - created) / 3600000);
        }
      }

      const avg = (xs: number[]) =>
        xs.length === 0 ? null : Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;

      this._lifecycleMetrics.set({
        avgCreateToPickupHours: avg(c2pSamples),
        avgPickupToReceiveHours: avg(p2rSamples),
        avgReceiveToCollectHours: avg(r2cSamples),
        avgTotalCycleHours: avg(totalSamples),
        completedSampleSize: totalSamples.length,
      });

      // Per-status SLA thresholds (hours). Tune as needed.
      const slaHours: Record<string, number> = {
        [PACKAGE_STATUS.PENDING]: 24,
        [PACKAGE_STATUS.NOTIFIED]: 24,
        [PACKAGE_STATUS.IN_TRANSIT]: 24,
        [PACKAGE_STATUS.READY_FOR_COLLECTION]: 72,
      };

      const now = Date.now();
      const stuck: StuckPackage[] = rows
        .filter(r => slaHours[r.status] !== undefined)
        .map(r => {
          const reference = new Date(r.updated_at).getTime();
          const hoursStuck = Math.floor((now - reference) / 3600000);
          return { row: r, hoursStuck, threshold: slaHours[r.status] };
        })
        .filter(({ hoursStuck, threshold }) => hoursStuck > threshold)
        .sort((a, b) => b.hoursStuck - a.hoursStuck)
        .slice(0, 10)
        .map(({ row, hoursStuck, threshold }) => ({
          id: row.id,
          reference: row.reference,
          status: row.status,
          statusLabel: this.getStatusLabel(row.status),
          hoursStuck,
          thresholdHours: threshold,
          receiverEmail: row.receiver_email,
        }));

      this._stuckPackages.set(stuck);
    } catch (err) {
      console.warn('[DashboardService] Failed to load lifecycle/stuck packages:', err);
    }
  }

  /**
   * Loads inventory health snapshot. All aggregations done client-side.
   */
  private async loadInventoryHealth(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('inventory_items')
        .select('id, name, quantity, low_stock_threshold, unit_price, is_active');

      if (error || !data) return;

      type Row = {
        id: string;
        name: string;
        quantity: number;
        low_stock_threshold: number;
        unit_price: number | null;
        is_active: boolean;
      };

      const rows = data as Row[];
      const active = rows.filter(r => r.is_active);

      const totalQuantity = active.reduce((s, r) => s + (r.quantity ?? 0), 0);
      const totalValue = active.reduce((s, r) => s + (r.quantity ?? 0) * (r.unit_price ?? 0), 0);

      const lowStock = active.filter(
        r => r.quantity > 0 && r.quantity <= (r.low_stock_threshold ?? 0)
      );
      const outOfStock = active.filter(r => r.quantity === 0);

      const topLowStock = [...lowStock, ...outOfStock]
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 5)
        .map(r => ({
          id: r.id,
          name: r.name,
          quantity: r.quantity,
          threshold: r.low_stock_threshold ?? 0,
        }));

      this._inventoryHealth.set({
        totalItems: rows.length,
        activeItems: active.length,
        lowStock: lowStock.length,
        outOfStock: outOfStock.length,
        totalQuantity,
        totalValue: Math.round(totalValue * 100) / 100,
        topLowStock,
      });
    } catch (err) {
      console.warn('[DashboardService] Failed to load inventory health:', err);
    }
  }

  /**
   * Loads top items shipped over the period. Joins package_items → packages
   * for the date filter and aggregates client-side.
   */
  private async loadTopShippedItems(dateFrom?: string, dateTo?: string): Promise<void> {
    try {
      // Use embedded select: package_items joined with packages for date filter.
      // When no date range, just pull the latest 1000 package_items.
      let query = this.supabaseService.client
        .from('package_items')
        .select('package_id, quantity, description, inventory_item_id, packages!inner(created_at, deleted_at)')
        .is('packages.deleted_at', null)
        .limit(2000);

      if (dateFrom) query = query.gte('packages.created_at', dateFrom);
      if (dateTo) query = query.lte('packages.created_at', dateTo);

      const { data, error } = await query;
      if (error || !data) return;

      type Row = {
        package_id: string;
        quantity: number;
        description: string;
        inventory_item_id: string | null;
      };

      const grouped = new Map<string, { qty: number; pkgIds: Set<string>; invId: string | null }>();
      for (const r of data as Row[]) {
        const key = (r.description ?? '').trim().toLowerCase() || '(unnamed)';
        const bucket = grouped.get(key) ?? { qty: 0, pkgIds: new Set<string>(), invId: r.inventory_item_id };
        bucket.qty += r.quantity ?? 0;
        bucket.pkgIds.add(r.package_id);
        if (!bucket.invId && r.inventory_item_id) bucket.invId = r.inventory_item_id;
        grouped.set(key, bucket);
      }

      const top: TopShippedItem[] = Array.from(grouped.entries())
        .map(([key, b]) => ({
          description: this.titleCase(key),
          totalQuantity: b.qty,
          packageCount: b.pkgIds.size,
          inventoryItemId: b.invId,
          packageIds: Array.from(b.pkgIds),
        }))
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, 8);

      this._topShippedItems.set(top);
    } catch (err) {
      console.warn('[DashboardService] Failed to load top shipped items:', err);
    }
  }

  // ============================================================================
  // Payload Mapping
  // ============================================================================

  /** Maps the RPC payload onto the presentation signals. */
  private applyMetrics(m: DashboardMetricsPayload): void {
    this._stats.set(m.stats);
    this._statusDistribution.set(this.buildStatusDistribution(m.statusCounts));
    this._weeklyTimeSeries.set(this.buildWeeklySeries(m.weeklyTimeSeries));
    this._monthlyTimeSeries.set(this.buildMonthlySeries(m.monthlyTimeSeries));
    this._recentActivity.set(this.buildRecentActivity(m.recentActivity));
    this._topReceivers.set(this.buildTopReceivers(m.topReceivers));
    this._hourlyHeatmap.set(this.buildHeatmap(m.hourlyBuckets, m.stats.total));
    this._driverPerformance.set(m.driverPerformance ?? []);
    this._lifecycleMetrics.set(m.lifecycleMetrics);
    this._stuckPackages.set(this.buildStuckPackages(m.stuckPackages));
    this._driverStats.set({
      ...m.driverStats,
      drivers: (m.driverStats?.drivers ?? []) as StaffProfile[],
    });
    this._podStats.set(m.podStats);
    this._locationDistribution.set(m.locationDistribution ?? []);
    this._inventoryHealth.set(m.inventoryHealth);
    this._topShippedItems.set(
      (m.topShippedItems ?? []).map(item => ({
        ...item,
        description: this.titleCase(item.description),
      })),
    );
  }

  private buildStatusDistribution(counts: Record<string, number>): StatusDistribution[] {
    const c = (key: string) => counts?.[key] ?? 0;
    return [
      {
        label: 'Pending',
        value: c(PACKAGE_STATUS.PENDING) + c(PACKAGE_STATUS.NOTIFIED),
        color: '#F59E0B', // Amber
        status: PACKAGE_STATUS.PENDING,
      },
      {
        label: 'In Transit',
        value: c(PACKAGE_STATUS.IN_TRANSIT),
        color: '#3B82F6', // Blue
        status: PACKAGE_STATUS.IN_TRANSIT,
      },
      {
        label: 'Ready',
        value: c(PACKAGE_STATUS.READY_FOR_COLLECTION),
        color: '#8B5CF6', // Purple
        status: PACKAGE_STATUS.READY_FOR_COLLECTION,
      },
      {
        label: 'Completed',
        value: c(PACKAGE_STATUS.DELIVERED) + c(PACKAGE_STATUS.COLLECTED),
        color: '#10B981', // Green
        status: PACKAGE_STATUS.COLLECTED,
      },
      {
        label: 'Canceled',
        value: c(PACKAGE_STATUS.RETURNED),
        color: '#EF4444', // Red
        status: PACKAGE_STATUS.RETURNED,
      },
    ].filter(item => item.value > 0);
  }

  private buildWeeklySeries(rows: Array<{ date: string; count: number }>): TimeSeriesDataPoint[] {
    return (rows ?? []).map(r => ({
      date: r.date,
      label: this.formatDayLabel(this.parseLocalDate(r.date)),
      count: r.count,
    }));
  }

  private buildMonthlySeries(rows: Array<{ date: string; count: number }>): TimeSeriesDataPoint[] {
    const list = rows ?? [];
    const lastIndex = list.length - 1;
    return list.map((r, i) => {
      // Show a label roughly every 5 days (and always on the most recent day)
      // to avoid clutter — mirrors the original 30-day chart.
      const daysAgo = lastIndex - i;
      const showLabel = daysAgo % 5 === 0 || i === lastIndex;
      return {
        date: r.date,
        label: showLabel ? this.formatShortDate(this.parseLocalDate(r.date)) : '',
        count: r.count,
      };
    });
  }

  private buildRecentActivity(
    rows: DashboardMetricsPayload['recentActivity'],
  ): PackageActivity[] {
    return (rows ?? []).map(r => {
      const createdAt = new Date(r.createdAt);
      return {
        id: r.id,
        reference: r.reference,
        receiverEmail: r.receiverEmail,
        status: r.status,
        statusLabel: this.getStatusLabel(r.status),
        createdAt,
        timeAgo: this.getTimeAgo(createdAt),
      };
    });
  }

  private buildTopReceivers(rows: Array<{ email: string; count: number }>): TopReceiver[] {
    return (rows ?? []).map(r => ({
      email: r.email,
      name: r.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
      count: r.count,
    }));
  }

  private buildHeatmap(
    buckets: Array<{ dow: number; hour: number; count: number }>,
    total: number,
  ): HourlyHeatmap {
    const counts = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const b of buckets ?? []) {
      if (b.dow >= 0 && b.dow < 7 && b.hour >= 0 && b.hour < 24) {
        counts[b.dow][b.hour] = b.count;
      }
    }
    const max = Math.max(0, ...counts.flat());
    return { counts, max, total };
  }

  private buildStuckPackages(
    rows: Array<Omit<StuckPackage, 'statusLabel'>>,
  ): StuckPackage[] {
    return (rows ?? []).map(r => ({
      ...r,
      statusLabel: this.getStatusLabel(r.status),
    }));
  }

  // ============================================================================
  // Presentation Helpers
  // ============================================================================

  private titleCase(s: string): string {
    return s.replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Parse a `YYYY-MM-DD` date string as local time. `new Date('YYYY-MM-DD')`
   * parses as UTC midnight, which can shift the weekday/label across the date
   * boundary; constructing from parts keeps it in the local day.
   */
  private parseLocalDate(s: string): Date {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }

  private formatDayLabel(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  private formatShortDate(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  private getStatusLabel(status: PackageStatus): string {
    switch (status) {
      case PACKAGE_STATUS.PENDING: return 'Pending';
      case PACKAGE_STATUS.NOTIFIED: return 'Notified';
      case PACKAGE_STATUS.IN_TRANSIT: return 'In Transit';
      case PACKAGE_STATUS.READY_FOR_COLLECTION: return 'Ready';
      case PACKAGE_STATUS.DELIVERED: return 'Delivered';
      case PACKAGE_STATUS.COLLECTED: return 'Collected';
      case PACKAGE_STATUS.RETURNED: return 'Canceled';
      default: return 'Unknown';
    }
  }

  private getTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  private toEndOfDay(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString();
  }
}
