import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import {TopChannelsTableComponent} from './cards/top-channels-table/top-channels-table.component';
import {LineChartCardComponent} from './cards/line-chart-card/line-chart-card.component';
import {BarChartCardComponent} from './cards/bar-chart-card/bar-chart-card.component';
import {RealtimeChartCardComponent} from './cards/realtime-chart-card/realtime-chart-card.component';
import {DoughnutChartCardComponent} from './cards/doughnut-chart-card/doughnut-chart-card.component';
import {ChartCardData, FilterOption} from '../../core/models/models';
import {SalesOverTimeCardComponent} from './cards/sales-over-time-card/sales-over-time-card.component';
import {SalesVsRefundsCardComponent} from './cards/sales-vs-refunds-card/sales-vs-refunds-card.component';
import {RecentActivityCardComponent} from './cards/recent-activity-card/recent-activity-card.component';
import {IncomeExpensesCardComponent} from './cards/income-expenses-card/income-expenses-card.component';
import {DashboardActionsComponent} from './dashboard-actions/dashboard-actions.component';
import {CreatePackageModalComponent} from '../../shared/components/modals';
import {Package} from '../../core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, LayoutComponent, TopChannelsTableComponent, LineChartCardComponent, BarChartCardComponent, RealtimeChartCardComponent, DoughnutChartCardComponent, SalesOverTimeCardComponent, SalesVsRefundsCardComponent, RecentActivityCardComponent, IncomeExpensesCardComponent, DashboardActionsComponent, CreatePackageModalComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {

  // Modal state
  createPackageModalOpen = false;

  // Chart card data
  chartCards: ChartCardData[] = [
    {
      id: 'dashboard-card-01',
      title: 'Acme Plus',
      subtitle: 'Sales',
      value: '$24,780',
      changePercent: 49
    },
    {
      id: 'dashboard-card-02',
      title: 'Acme Advanced',
      subtitle: 'Sales',
      value: '$17,489',
      changePercent: -14
    },
    {
      id: 'dashboard-card-03',
      title: 'Acme Professional',
      subtitle: 'Sales',
      value: '$9,962',
      changePercent: 29
    }
  ];

  ngOnInit(): void {
  }

  onFilterApply(filters: FilterOption[]): void {
    console.log('Filters applied:', filters);
    // Handle filter logic here
  }

  onAddView(): void {
    this.createPackageModalOpen = true;
  }

  onCloseCreatePackageModal(): void {
    this.createPackageModalOpen = false;
  }

  onPackageCreated(pkg: Package): void {
    console.log('Package created:', pkg);
    // Handle the newly created package (e.g., show notification, refresh list, etc.)
  }

  onCardOptionSelect(cardId: string, option: string): void {
    console.log(`Card ${cardId} option selected: ${option}`);
  }

  onCardRemove(cardId: string): void {
    console.log(`Card ${cardId} removed`);
    this.chartCards = this.chartCards.filter(c => c.id !== cardId);
  }
}
