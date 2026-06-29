import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  ExecutiveDashboardService,
  TopRevenueCustomer,
  TopRevenueItem,
} from '../services/executive-dashboard.service';
import { RevenueKpiCardComponent } from './cards/revenue-kpi-card/revenue-kpi-card.component';
import { RevenueTrendCardComponent } from './cards/revenue-trend-card/revenue-trend-card.component';
import { RevenueMixCardComponent } from './cards/revenue-mix-card/revenue-mix-card.component';
import { TopRevenueCustomersCardComponent } from './cards/top-revenue-customers-card/top-revenue-customers-card.component';
import { TopRevenueItemsCardComponent } from './cards/top-revenue-items-card/top-revenue-items-card.component';

/**
 * Executive (CEO) revenue view. Admin-only — rendered behind the "Executive"
 * tab on the dashboard page. Surfaces completed-order value across day/week/
 * month/year, fulfilment mix, and the customers/items driving revenue.
 */
@Component({
  selector: 'app-executive-dashboard',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RevenueKpiCardComponent,
    RevenueTrendCardComponent,
    RevenueMixCardComponent,
    TopRevenueCustomersCardComponent,
    TopRevenueItemsCardComponent,
  ],
  templateUrl: './executive-dashboard.html',
  styleUrl: './executive-dashboard.css',
})
export class ExecutiveDashboard implements OnInit {
  private readonly service = inject(ExecutiveDashboardService);
  private readonly router = inject(Router);

  readonly isLoading = this.service.isLoading;
  readonly loaded = this.service.loaded;
  readonly error = this.service.error;
  readonly lastUpdated = this.service.lastUpdated;
  readonly summary = this.service.summary;
  readonly kpis = this.service.kpis;
  readonly trends = this.service.trends;
  readonly topCustomers = this.service.topCustomers;
  readonly topItems = this.service.topItems;

  async ngOnInit(): Promise<void> {
    await this.service.load();
  }

  async onRefresh(): Promise<void> {
    await this.service.load(true);
  }

  onCustomerClick(customer: TopRevenueCustomer): void {
    this.router.navigate(['/orders'], { queryParams: { search: customer.email } });
  }

  onItemClick(item: TopRevenueItem): void {
    if (!item.inventoryItemId) return;
    this.router.navigate(['/inventory'], {
      queryParams: { id: item.inventoryItemId, search: item.description },
    });
  }
}
