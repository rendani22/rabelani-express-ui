import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { FilterOption } from '../../core/models/models';
import { DashboardActionsComponent } from './dashboard-actions/dashboard-actions.component';
import { CreatePackageModalComponent } from '../../shared/components/modals';
import { Package } from '../../core';
import { DashboardService, PackageActivity } from './services/dashboard.service';
import { PackageStatsCardComponent, StatItem } from './cards/package-stats-card/package-stats-card.component';
import { PackageStatusChartComponent } from './cards/package-status-chart/package-status-chart.component';
import { PackagesTrendCardComponent } from './cards/packages-trend-card/packages-trend-card.component';
import { RecentPackagesCardComponent } from './cards/recent-packages-card/recent-packages-card.component';
import { DeliveryPerformanceCardComponent } from './cards/delivery-performance-card/delivery-performance-card.component';

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
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  private readonly dashboardService = inject(DashboardService);
  private readonly router = inject(Router);

  // Modal state
  createPackageModalOpen = false;

  // Dashboard data
  readonly isLoading = this.dashboardService.isLoading;
  readonly stats = this.dashboardService.stats;
  readonly statusDistribution = this.dashboardService.statusDistribution;
  readonly weeklyTimeSeries = this.dashboardService.weeklyTimeSeries;
  readonly recentActivity = this.dashboardService.recentActivity;

  // Computed stat items for the stats card
  get statItems(): StatItem[] {
    const s = this.stats();
    return [
      { label: 'Total Packages', value: s.total, icon: 'package', color: 'violet' },
      { label: 'Pending', value: s.pending, icon: 'clock', color: 'amber' },
      { label: 'In Transit', value: s.inTransit, icon: 'truck', color: 'blue' },
      { label: 'Completed', value: s.completed, icon: 'check', color: 'green' },
    ];
  }

  async ngOnInit(): Promise<void> {
    await this.dashboardService.loadDashboardData();
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
}
