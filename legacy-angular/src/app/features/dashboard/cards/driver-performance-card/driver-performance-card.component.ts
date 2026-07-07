import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriverPerformance } from '../../services/dashboard.service';

/**
 * Driver Performance Leaderboard.
 * Surfaces pickups, deliveries and avg pickup→delivery hours per driver,
 * giving operations managers visibility into individual driver throughput
 * and turnaround time. Helps with workload balancing and recognising/coaching.
 */
@Component({
  selector: 'app-driver-performance-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">deliveries · avg time</span>
      </header>
      <div class="p-3 flex-1">
        @if (drivers.length > 0) {
          <div class="space-y-2">
            @for (d of drivers; track d.driverUserId; let i = $index) {
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                     [ngClass]="rankClass(i)">{{ i + 1 }}</div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ d.name }}</div>
                  <div class="text-xs text-gray-400 dark:text-gray-500">
                    {{ d.pickups }} pickups · {{ d.delivered }} delivered
                    @if (d.inTransit > 0) {
                      · {{ d.inTransit }} in transit
                    }
                  </div>
                </div>
                <div class="text-right flex-shrink-0">
                  <div class="text-sm font-semibold text-gray-800 dark:text-gray-100">
                    @if (d.avgDeliveryHours !== null) {
                      {{ d.avgDeliveryHours }}h
                    } @else {
                      <span class="text-gray-400">—</span>
                    }
                  </div>
                  <div class="text-xs text-gray-400">avg delivery</div>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm py-8">
            No driver activity in this period.
          </div>
        }
      </div>
    </div>
  `,
})
export class DriverPerformanceCardComponent {
  @Input() title = 'Driver Performance';
  @Input() drivers: DriverPerformance[] = [];

  private readonly rankClasses = [
    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    'bg-gray-200 text-gray-600 dark:bg-gray-600/40 dark:text-gray-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  ];

  rankClass(i: number): string {
    return this.rankClasses[i] ?? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400';
  }
}

