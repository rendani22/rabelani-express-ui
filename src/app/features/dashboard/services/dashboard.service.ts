import { Injectable, inject, signal, computed } from '@angular/core';
import { PackageService, Package, PACKAGE_STATUS, PackageStatus } from '../../../core';

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
 * Dashboard Service
 * Aggregates and transforms package data for dashboard visualization
 */
@Injectable({
  providedIn: 'root',
})
export class DashboardService {
  private readonly packageService = inject(PackageService);

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

  private readonly _recentActivity = signal<PackageActivity[]>([]);
  readonly recentActivity = this._recentActivity.asReadonly();

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
  async loadDashboardData(): Promise<void> {
    this._isLoading.set(true);

    try {
      // Load all packages
      await this.packageService.loadPackages();
      const packages = this.packageService.packages();

      // Calculate all statistics
      this.calculateStats(packages);
      this.calculateStatusDistribution(packages);
      this.calculateWeeklyTimeSeries(packages);
      this.calculateRecentActivity(packages);
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Private Methods
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

  private formatDayLabel(date: Date): string {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return days[date.getDay()];
  }

  private getStatusLabel(status: PackageStatus): string {
    switch (status) {
      case PACKAGE_STATUS.PENDING:
        return 'Pending';
      case PACKAGE_STATUS.NOTIFIED:
        return 'Notified';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'In Transit';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'Ready';
      case PACKAGE_STATUS.DELIVERED:
        return 'Delivered';
      case PACKAGE_STATUS.COLLECTED:
        return 'Collected';
      default:
        return 'Unknown';
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
}

