import { Injectable, inject, signal, computed } from '@angular/core';
import { PackageService, Package, PACKAGE_STATUS, PackageStatus } from '../../../core';
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
 * Dashboard Service
 * Aggregates and transforms package data for dashboard visualization
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly packageService = inject(PackageService);
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

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Load all dashboard data
   */
  async loadDashboardData(dateRange?: { start: Date; end?: Date }): Promise<void> {
    this._isLoading.set(true);

    const dateFrom = dateRange?.start?.toISOString();
    const dateTo = dateRange?.end
      ? this.toEndOfDay(dateRange.end)
      : dateRange?.start
        ? this.toEndOfDay(dateRange.start)
        : undefined;

    try {
      // Load all packages and supplementary data in parallel
      const [packagesResult] = await Promise.all([
        this.packageService.loadPackages({ dateFrom, dateTo }),
        this.loadDriverStats(),
        this.loadPodStats(dateFrom, dateTo),
        this.loadLocationDistribution(dateFrom, dateTo),
      ]);

      const packages = this.packageService.packages();

      // Calculate all statistics from packages
      this.calculateStats(packages);
      this.calculateStatusDistribution(packages);
      this.calculateWeeklyTimeSeries(packages);
      this.calculateMonthlyTimeSeries(packages);
      this.calculateRecentActivity(packages);
      this.calculateTopReceivers(packages);
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Private Data Loaders
  // ============================================================================

  private async loadDriverStats(): Promise<void> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('id, user_id, email, full_name, role, is_active, phone, created_at, updated_at')
        .eq('role', 'driver')
        .order('full_name', { ascending: true });

      if (error || !data) return;

      const drivers = data as StaffProfile[];

      // Count packages in transit (picked up by any driver)
      const { count: inTransitCount } = await this.supabaseService.client
        .from('packages')
        .select('id', { count: 'exact', head: true })
        .eq('status', PACKAGE_STATUS.IN_TRANSIT);

      const { count: totalCount } = await this.supabaseService.client
        .from('packages')
        .select('id', { count: 'exact', head: true });

      this._driverStats.set({
        total: drivers.length,
        active: drivers.filter(d => d.is_active).length,
        onDelivery: 0, // will be from in-transit packages
        packagesInTransit: inTransitCount ?? 0,
        totalPackages: totalCount ?? 0,
        drivers: drivers.slice(0, 8), // show top 8
      });
    } catch (err) {
      console.warn('[DashboardService] Failed to load driver stats:', err);
    }
  }

  private async loadPodStats(dateFrom?: string, dateTo?: string): Promise<void> {
    try {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let query = this.supabaseService.client
        .from('pods')
        .select('id, pdf_url, is_locked, completed_at');

      if (dateFrom) {
        query = query.gte('completed_at', dateFrom);
      }
      if (dateTo) {
        query = query.lte('completed_at', dateTo);
      }

      const { data, error } = await query;

      if (error || !data) return;

      const pods = data as Array<{ id: string; pdf_url: string | null; is_locked: boolean; completed_at: string }>;

      this._podStats.set({
        total: pods.length,
        withPdf: pods.filter(p => !!p.pdf_url).length,
        locked: pods.filter(p => p.is_locked).length,
        today: pods.filter(p => p.completed_at >= todayStart).length,
        thisWeek: pods.filter(p => p.completed_at >= weekStart).length,
      });
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
        .select('delivery_location_id');

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

  // ============================================================================
  // Private Calculation Methods
  // ============================================================================

  private calculateStats(packages: readonly Package[]): void {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - 7);
    const monthStart = new Date(todayStart);
    monthStart.setDate(monthStart.getDate() - 30);

    const stats: PackageStats = {
      total: packages.length,
      pending: 0,
      inTransit: 0,
      readyForCollection: 0,
      completed: 0,
      todayCount: 0,
      weeklyCount: 0,
      monthlyCount: 0,
    };

    packages.forEach(pkg => {
      const createdAt = new Date(pkg.created_at);

      // Count by status
      switch (pkg.status) {
        case PACKAGE_STATUS.PENDING:
        case PACKAGE_STATUS.NOTIFIED:
          stats.pending++;
          break;
        case PACKAGE_STATUS.IN_TRANSIT:
          stats.inTransit++;
          break;
        case PACKAGE_STATUS.READY_FOR_COLLECTION:
          stats.readyForCollection++;
          break;
        case PACKAGE_STATUS.DELIVERED:
        case PACKAGE_STATUS.COLLECTED:
          stats.completed++;
          break;
        case PACKAGE_STATUS.RETURNED:
          break;
      }

      // Count by time period
      if (createdAt >= todayStart) {
        stats.todayCount++;
      }
      if (createdAt >= weekStart) {
        stats.weeklyCount++;
      }
      if (createdAt >= monthStart) {
        stats.monthlyCount++;
      }
    });

    this._stats.set(stats);
  }

  private calculateStatusDistribution(packages: readonly Package[]): void {
    const statusCounts = new Map<PackageStatus, number>();

    packages.forEach(pkg => {
      const count = statusCounts.get(pkg.status) || 0;
      statusCounts.set(pkg.status, count + 1);
    });

    const distribution: StatusDistribution[] = [
      {
        label: 'Pending',
        value: (statusCounts.get(PACKAGE_STATUS.PENDING) || 0) + (statusCounts.get(PACKAGE_STATUS.NOTIFIED) || 0),
        color: '#F59E0B', // Amber
        status: PACKAGE_STATUS.PENDING,
      },
      {
        label: 'In Transit',
        value: statusCounts.get(PACKAGE_STATUS.IN_TRANSIT) || 0,
        color: '#3B82F6', // Blue
        status: PACKAGE_STATUS.IN_TRANSIT,
      },
      {
        label: 'Ready',
        value: statusCounts.get(PACKAGE_STATUS.READY_FOR_COLLECTION) || 0,
        color: '#8B5CF6', // Purple
        status: PACKAGE_STATUS.READY_FOR_COLLECTION,
      },
      {
        label: 'Completed',
        value: (statusCounts.get(PACKAGE_STATUS.DELIVERED) || 0) + (statusCounts.get(PACKAGE_STATUS.COLLECTED) || 0),
        color: '#10B981', // Green
        status: PACKAGE_STATUS.COLLECTED,
      },
      {
        label: 'Returned',
        value: statusCounts.get(PACKAGE_STATUS.RETURNED) || 0,
        color: '#EF4444', // Red
        status: PACKAGE_STATUS.RETURNED,
      },
    ].filter(item => item.value > 0);

    this._statusDistribution.set(distribution);
  }

  private calculateWeeklyTimeSeries(packages: readonly Package[]): void {
    const now = new Date();
    const days: TimeSeriesDataPoint[] = [];

    // Generate last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      days.push({
        date: dateStr,
        label: this.formatDayLabel(date),
        count: 0,
      });
    }

    // Count packages per day
    packages.forEach(pkg => {
      const pkgDate = new Date(pkg.created_at).toISOString().split('T')[0];
      const dayData = days.find(d => d.date === pkgDate);
      if (dayData) {
        dayData.count++;
      }
    });

    this._weeklyTimeSeries.set(days);
  }

  private calculateMonthlyTimeSeries(packages: readonly Package[]): void {
    const now = new Date();
    const days: TimeSeriesDataPoint[] = [];

    // Generate last 30 days
    for (let i = 29; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      // Show label every ~5 days to avoid clutter
      const showLabel = i % 5 === 0 || i === 0;
      days.push({
        date: dateStr,
        label: showLabel ? this.formatShortDate(date) : '',
        count: 0,
      });
    }

    // Count packages per day
    packages.forEach(pkg => {
      const pkgDate = new Date(pkg.created_at).toISOString().split('T')[0];
      const dayData = days.find(d => d.date === pkgDate);
      if (dayData) {
        dayData.count++;
      }
    });

    this._monthlyTimeSeries.set(days);
  }

  private calculateRecentActivity(packages: readonly Package[]): void {
    const sortedPackages = [...packages]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10);

    const activities: PackageActivity[] = sortedPackages.map(pkg => ({
      id: pkg.id,
      reference: pkg.reference,
      receiverEmail: pkg.receiver_email,
      status: pkg.status,
      statusLabel: this.getStatusLabel(pkg.status),
      createdAt: new Date(pkg.created_at),
      timeAgo: this.getTimeAgo(new Date(pkg.created_at)),
    }));

    this._recentActivity.set(activities);
  }

  private calculateTopReceivers(packages: readonly Package[]): void {
    const emailCounts = new Map<string, number>();
    packages.forEach(pkg => {
      emailCounts.set(pkg.receiver_email, (emailCounts.get(pkg.receiver_email) ?? 0) + 1);
    });

    const top: TopReceiver[] = Array.from(emailCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([email, count]) => ({
        email,
        name: email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        count,
      }));

    this._topReceivers.set(top);
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
      case PACKAGE_STATUS.RETURNED: return 'Returned';
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

