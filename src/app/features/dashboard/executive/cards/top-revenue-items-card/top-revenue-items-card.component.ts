import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { TopRevenueItem } from '../../../services/executive-dashboard.service';

/**
 * Inventory items ranked by the completed-order value they generated, with a
 * value-share bar relative to the top item. Rows link out to Inventory.
 */
@Component({
  selector: 'app-top-revenue-items-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>

      <div class="p-4 sm:p-5 flex-1">
        @if (items.length > 0) {
          <ul class="flex flex-col gap-3">
            @for (item of items; track item.description; let i = $index) {
              <li>
                <button
                  type="button"
                  (click)="itemClick.emit(item)"
                  [disabled]="!item.inventoryItemId"
                  class="w-full text-left group"
                  [class.cursor-default]="!item.inventoryItemId"
                >
                  <div class="flex items-center justify-between gap-3 mb-1">
                    <span class="flex items-center gap-2 min-w-0">
                      <span
                        class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center justify-center"
                      >{{ i + 1 }}</span>
                      <span
                        class="truncate text-sm font-medium text-gray-800 dark:text-gray-100"
                        [class.group-hover:text-emerald-600]="item.inventoryItemId"
                        [class.dark:group-hover:text-emerald-400]="item.inventoryItemId"
                      >{{ item.description }}</span>
                    </span>
                    <span class="flex-shrink-0 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {{ item.value | zar }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div class="bg-emerald-500 h-1.5 rounded-full" [style.width.%]="share(item)"></div>
                    </div>
                    <span class="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                      {{ item.quantity }} units · {{ item.orders }} {{ item.orders === 1 ? 'order' : 'orders' }}
                    </span>
                  </div>
                </button>
              </li>
            }
          </ul>
        } @else {
          <div class="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            No priced items in collected orders yet
          </div>
        }
      </div>
    </div>
  `,
  styles: [],
})
export class TopRevenueItemsCardComponent {
  @Input() title = 'Top Items by Value';
  @Input() items: TopRevenueItem[] = [];
  @Output() itemClick = new EventEmitter<TopRevenueItem>();

  private get maxValue(): number {
    return this.items.reduce((m, item) => Math.max(m, item.value), 0);
  }

  share(item: TopRevenueItem): number {
    const max = this.maxValue;
    return max > 0 ? (item.value / max) * 100 : 0;
  }
}
