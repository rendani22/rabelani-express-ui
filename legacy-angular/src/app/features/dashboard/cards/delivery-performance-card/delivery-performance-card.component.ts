import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-delivery-performance-card',
  standalone: true,
  imports: [CommonModule],
  host: { 'class': 'col-span-12 sm:col-span-6 lg:col-span-4 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>
      <div class="p-4 sm:p-5 flex-1">
        <!-- Completion Rate -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-600 dark:text-gray-300">Completion Rate</span>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ completionRate }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div class="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                 [style.width.%]="completionRate"></div>
          </div>
        </div>

        <!-- In Progress Rate -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-600 dark:text-gray-300">In Progress</span>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ inProgressRate }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div class="bg-blue-500 h-2.5 rounded-full transition-all duration-500"
                 [style.width.%]="inProgressRate"></div>
          </div>
        </div>

        <!-- Pending Rate -->
        <div class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm text-gray-600 dark:text-gray-300">Pending</span>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ pendingRate }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
            <div class="bg-amber-500 h-2.5 rounded-full transition-all duration-500"
                 [style.width.%]="pendingRate"></div>
          </div>
        </div>

        <!-- Stats Summary -->
        <div class="pt-4 border-t border-gray-100 dark:border-gray-700/60">
          <div class="grid grid-cols-3 gap-2 text-center">
            <div>
              <div class="text-lg font-bold text-green-500">{{ completedCount }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Completed</div>
            </div>
            <div>
              <div class="text-lg font-bold text-blue-500">{{ inProgressCount }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">In Progress</div>
            </div>
            <div>
              <div class="text-lg font-bold text-amber-500">{{ pendingCount }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400">Pending</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class DeliveryPerformanceCardComponent {
  @Input() title = 'Delivery Performance';
  @Input() completedCount = 0;
  @Input() inProgressCount = 0;
  @Input() pendingCount = 0;

  get totalCount(): number {
    return this.completedCount + this.inProgressCount + this.pendingCount;
  }

  get completionRate(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.completedCount / this.totalCount) * 100);
  }

  get inProgressRate(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.inProgressCount / this.totalCount) * 100);
  }

  get pendingRate(): number {
    if (this.totalCount === 0) return 0;
    return Math.round((this.pendingCount / this.totalCount) * 100);
  }
}



