import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { FilterOption } from '../../core/models/models';
import { DashboardActionsComponent } from './dashboard-actions/dashboard-actions.component';
import { CreatePackageModalComponent } from '../../shared/components/modals';
import { Package } from '../../core';
import { OnboardingTourService } from '../../core';
import { DashboardService, PackageActivity } from './services/dashboard.service';
import { StuckPackage } from './services/dashboard.service';
import { PackageStatsCardComponent, StatItem } from './cards/package-stats-card/package-stats-card.component';
import { PackageStatusChartComponent } from './cards/package-status-chart/package-status-chart.component';
import { PackagesTrendCardComponent } from './cards/packages-trend-card/packages-trend-card.component';
import { RecentPackagesCardComponent } from './cards/recent-packages-card/recent-packages-card.component';
import { DeliveryPerformanceCardComponent } from './cards/delivery-performance-card/delivery-performance-card.component';
import { MonthlyPackagesCardComponent } from './cards/monthly-packages-card/monthly-packages-card.component';
import { DriverStatusCardComponent } from './cards/driver-status-card/driver-status-card.component';
import { LocationDistributionCardComponent } from './cards/location-distribution-card/location-distribution-card.component';
import { PodStatsCardComponent } from './cards/pod-stats-card/pod-stats-card.component';
import { TopReceiversCardComponent } from './cards/top-receivers-card/top-receivers-card.component';
import { DriverPerformanceCardComponent } from './cards/driver-performance-card/driver-performance-card.component';
import { LifecycleMetricsCardComponent } from './cards/lifecycle-metrics-card/lifecycle-metrics-card.component';
import { StuckPackagesCardComponent } from './cards/stuck-packages-card/stuck-packages-card.component';
import { InventoryHealthCardComponent } from './cards/inventory-health-card/inventory-health-card.component';
import { TopItemsCardComponent } from './cards/top-items-card/top-items-card.component';
import { HourlyHeatmapCardComponent } from './cards/hourly-heatmap-card/hourly-heatmap-card.component';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    LayoutComponent,
    DashboardActionsComponent,
    CreatePackageModalComponent,
    PackageStatsCardComponent,
    PackageStatusChartComponent,
    PackagesTrendCardComponent,
    RecentPackagesCardComponent,
    DeliveryPerformanceCardComponent,
    MonthlyPackagesCardComponent,
    DriverStatusCardComponent,
    LocationDistributionCardComponent,
    PodStatsCardComponent,
    TopReceiversCardComponent,
    DriverPerformanceCardComponent,
    LifecycleMetricsCardComponent,
    StuckPackagesCardComponent,
    InventoryHealthCardComponent,
    TopItemsCardComponent,
    HourlyHeatmapCardComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly router = inject(Router);
  private readonly onboardingTour = inject(OnboardingTourService);

  // Modal state
  createPackageModalOpen = false;

  // Dashboard data
  readonly isLoading = this.dashboardService.isLoading;
  readonly stats = this.dashboardService.stats;
  readonly statusDistribution = this.dashboardService.statusDistribution;
  readonly weeklyTimeSeries = this.dashboardService.weeklyTimeSeries;
  readonly monthlyTimeSeries = this.dashboardService.monthlyTimeSeries;
  readonly recentActivity = this.dashboardService.recentActivity;
  readonly driverStats = this.dashboardService.driverStats;
  readonly podStats = this.dashboardService.podStats;
  readonly locationDistribution = this.dashboardService.locationDistribution;
  readonly topReceivers = this.dashboardService.topReceivers;
  readonly driverPerformance = this.dashboardService.driverPerformance;
  readonly lifecycleMetrics = this.dashboardService.lifecycleMetrics;
  readonly stuckPackages = this.dashboardService.stuckPackages;
  readonly inventoryHealth = this.dashboardService.inventoryHealth;
  readonly topShippedItems = this.dashboardService.topShippedItems;
  readonly hourlyHeatmap = this.dashboardService.hourlyHeatmap;

  // Computed stat items for the stats card (8 items)
  get statItems(): StatItem[] {
    const s = this.stats();
    const d = this.driverStats();
    const p = this.podStats();
    return [
      { label: 'Total Packages', value: s.total, icon: 'package', color: 'violet' },
      { label: 'Pending', value: s.pending, icon: 'clock', color: 'amber' },
      { label: 'In Transit', value: s.inTransit, icon: 'truck', color: 'blue' },
      { label: 'Ready to Collect', value: s.readyForCollection, icon: 'inbox', color: 'purple' },
      { label: 'Completed', value: s.completed, icon: 'check', color: 'green' },
      { label: 'Today', value: s.todayCount, icon: 'calendar', color: 'teal', subtitle: `${s.weeklyCount} this week` },
      { label: 'Active Drivers', value: d.active, icon: 'users', color: 'indigo', subtitle: `${d.total} total` },
      { label: 'PODs Signed', value: p.total, icon: 'document', color: 'rose', subtitle: `${p.withPdf} with PDF` },
    ];
  }

  async ngOnInit(): Promise<void> {
    await this.dashboardService.loadDashboardData();
    // Auto-launch the onboarding tour for first-time users. The service is a
    // no-op if the user has already completed (or skipped) the tour.
    setTimeout(() => this.onboardingTour.start('dashboard'), 600);
  }

  onDateChange(dateRange: { start: Date; end?: Date }): void {
    this.dashboardService.loadDashboardData(dateRange).catch(err => {
      console.error('[Dashboard] Failed to reload data for date range:', err);
    });
  }

  onFilterApply(filters: FilterOption[]): void {
    console.log('Filters applied:', filters);
    // Reload dashboard data with filters
    this.dashboardService.loadDashboardData();
  }

  onAddView(): void {
    this.createPackageModalOpen = true;
  }

  onCloseCreatePackageModal(): void {
    this.createPackageModalOpen = false;
  }

  async onPackageCreated(pkg: Package): Promise<void> {
    console.log('Package created:', pkg);
    // Refresh dashboard data to include new package
    await this.dashboardService.loadDashboardData();
  }

  onPackageClick(activity: PackageActivity): void {
    // Navigate to orders page with the package selected
    this.router.navigate(['/orders'], { queryParams: { id: activity.id } });
  }

  onViewAllPackages(): void {
    this.router.navigate(['/orders']);
  }

  onStuckPackageClick(stuck: StuckPackage): void {
    this.router.navigate(['/orders'], { queryParams: { id: stuck.id } });
  }

  onViewInventory(): void {
    this.router.navigate(['/inventory']);
  }
}
