import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { TopRevenueCustomer } from '../../../services/executive-dashboard.service';

/**
 * Customers (receivers) ranked by completed-order value, with a value-share
 * bar relative to the top customer. Rows link out to the Orders page.
 */
@Component({
  selector: 'app-top-revenue-customers-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>

      <div class="p-4 sm:p-5 flex-1">
        @if (customers.length > 0) {
          <ul class="flex flex-col gap-3">
            @for (c of customers; track c.email; let i = $index) {
              <li>
                <button
                  type="button"
                  (click)="customerClick.emit(c)"
                  class="w-full text-left group"
                >
                  <div class="flex items-center justify-between gap-3 mb-1">
                    <span class="flex items-center gap-2 min-w-0">
                      <span
                        class="flex-shrink-0 w-6 h-6 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-semibold flex items-center justify-center"
                      >{{ i + 1 }}</span>
                      <span class="truncate text-sm font-medium text-gray-800 dark:text-gray-100 group-hover:text-violet-600 dark:group-hover:text-violet-400">
                        {{ c.name }}
                      </span>
                    </span>
                    <span class="flex-shrink-0 text-sm font-semibold text-gray-800 dark:text-gray-100">
                      {{ c.value | zar }}
                    </span>
                  </div>
                  <div class="flex items-center gap-2">
                    <div class="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-1.5">
                      <div class="bg-violet-500 h-1.5 rounded-full" [style.width.%]="share(c)"></div>
                    </div>
                    <span class="flex-shrink-0 text-[11px] text-gray-400 dark:text-gray-500">
                      {{ c.orders }} {{ c.orders === 1 ? 'order' : 'orders' }}
                    </span>
                  </div>
                </button>
              </li>
            }
          </ul>
        } @else {
          <div class="flex items-center justify-center py-8 text-gray-500 dark:text-gray-400 text-sm">
            No collected-order revenue yet
          </div>
        }
      </div>
    </div>
  `,
  styles: [],
})
export class TopRevenueCustomersCardComponent {
  @Input() title = 'Top Customers by Value';
  @Input() customers: TopRevenueCustomer[] = [];
  @Output() customerClick = new EventEmitter<TopRevenueCustomer>();

  private get maxValue(): number {
    return this.customers.reduce((m, c) => Math.max(m, c.value), 0);
  }

  share(c: TopRevenueCustomer): number {
    const max = this.maxValue;
    return max > 0 ? (c.value / max) * 100 : 0;
  }
}
