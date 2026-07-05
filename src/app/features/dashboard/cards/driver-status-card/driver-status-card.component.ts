import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DriverStats } from '../../services/dashboard.service';

@Component({
  selector: 'app-driver-status-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 sm:col-span-6 lg:col-span-4 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>
      <div class="p-4 sm:p-5 flex flex-col gap-4 flex-1">

        <!-- Driver counts -->
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{{ driverStats.total }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Total</div>
          </div>
          <div class="bg-green-50 dark:bg-green-500/10 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">{{ driverStats.active }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">Active</div>
          </div>
          <div class="bg-blue-50 dark:bg-blue-500/10 rounded-lg p-3 text-center">
            <div class="text-2xl font-bold text-blue-600 dark:text-blue-400 tabular-nums">{{ driverStats.onDelivery }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1 uppercase tracking-wide">On Route</div>
          </div>
        </div>

        <!-- Driver list -->
        @if (driverStats.drivers.length > 0) {
          <div class="space-y-2 flex-1 overflow-y-auto max-h-40">
            @for (driver of driverStats.drivers; track driver.id) {
              <div class="flex items-center gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/20">
                <!-- Status dot -->
                <span class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      [ngClass]="driver.is_active ? 'bg-green-500' : 'bg-gray-400'">
                </span>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {{ driver.full_name }}
                  </div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                    {{ driver.email }}
                  </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                      [ngClass]="driver.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-gray-500/20 dark:text-gray-400'">
                  {{ driver.is_active ? 'Active' : 'Inactive' }}
                </span>
              </div>
            }
          </div>
        } @else {
          <div class="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm py-4">
            No drivers found
          </div>
        }

        <!-- Packages in transit -->
        <div class="pt-3 border-t border-gray-100 dark:border-gray-700/60">
          <div class="flex items-center justify-between">
            <span class="text-sm text-gray-600 dark:text-gray-300">Packages In Transit</span>
            <span class="text-sm font-bold text-blue-600 dark:text-blue-400 tabular-nums">{{ driverStats.packagesInTransit }}</span>
          </div>
          <div class="mt-2 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div class="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                 [style.width.%]="transitPercent"></div>
          </div>
          <div class="text-xs text-gray-400 dark:text-gray-500 mt-1 tabular-nums">{{ transitPercent }}% of total packages</div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class DriverStatusCardComponent {
  @Input() title = 'Driver Overview';
  @Input() driverStats: DriverStats = {
    total: 0,
    active: 0,
    onDelivery: 0,
    packagesInTransit: 0,
    totalPackages: 0,
    drivers: [],
  };

  get transitPercent(): number {
    if (this.driverStats.totalPackages === 0) return 0;
    return Math.round(
      (this.driverStats.packagesInTransit / this.driverStats.totalPackages) * 100
    );
  }
}

