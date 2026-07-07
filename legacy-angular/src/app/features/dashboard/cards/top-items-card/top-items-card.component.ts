import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopShippedItem } from '../../services/dashboard.service';

/**
 * Top Items Shipped.
 * Aggregates `package_items` (joined to `inventory_items`) over the
 * selected period to surface the most-frequently-shipped items.
 * Helps the warehouse team plan stock levels and forecast demand.
 */
@Component({
  selector: 'app-top-items-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">by quantity shipped</span>
      </header>
      <div class="p-3 flex-1">
        @if (items.length > 0) {
          <ul class="space-y-2">
            @for (it of items; track it.description; let i = $index) {
              <li class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                     [ngClass]="rankClass(i)">{{ i + 1 }}</div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ it.description }}</div>
                  <div class="text-xs text-gray-400 dark:text-gray-500">
                    in {{ it.packageCount }} package{{ it.packageCount === 1 ? '' : 's' }}
                    @if (it.inventoryItemId) {
                      · linked to inventory
                    }
                  </div>
                  <div class="mt-1 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      class="text-xs font-medium text-violet-500 hover:text-violet-600"
                      (click)="ordersClick.emit(it)">
                      View orders →
                    </button>
                    @if (it.inventoryItemId) {
                      <button
                        type="button"
                        class="text-xs font-medium text-indigo-500 hover:text-indigo-600"
                        (click)="inventoryClick.emit(it)">
                        View inventory →
                      </button>
                    }
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 hidden sm:block">
                    <div class="h-1.5 rounded-full bg-violet-500 transition-all duration-500"
                         [style.width.%]="percent(it.totalQuantity)"></div>
                  </div>
                  <span class="text-sm font-semibold text-gray-800 dark:text-gray-100 w-10 text-right">
                    {{ it.totalQuantity }}
                  </span>
                </div>
              </li>
            }
          </ul>
        } @else {
          <div class="h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm py-8">
            No items shipped in this period.
          </div>
        }
      </div>
    </div>
  `,
})
export class TopItemsCardComponent {
  @Input() title = 'Top Items Shipped';
  @Input() items: TopShippedItem[] = [];
  @Output() readonly ordersClick = new EventEmitter<TopShippedItem>();
  @Output() readonly inventoryClick = new EventEmitter<TopShippedItem>();

  private readonly rankClasses = [
    'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400',
    'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400',
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  ];

  rankClass(i: number): string {
    return this.rankClasses[i] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-600/40 dark:text-gray-300';
  }

  percent(qty: number): number {
    if (this.items.length === 0) return 0;
    const max = this.items[0]?.totalQuantity ?? 1;
    return max > 0 ? Math.round((qty / max) * 100) : 0;
  }
}

