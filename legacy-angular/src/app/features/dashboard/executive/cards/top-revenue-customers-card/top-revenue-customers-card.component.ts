import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { CustomerConcentration, TopRevenueCustomer } from '../../../services/executive-dashboard.service';

/**
 * Customers (receivers) ranked by completed-order value as a ledger list —
 * Fraunces rank numerals, a brass value-share bar, and the concentration flag
 * as a small annotation. Rows link out to the Orders page.
 */
@Component({
  selector: 'app-top-revenue-customers-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
        @if (concentration && concentration.topFiveShare > 0) {
          <span
            class="font-ledger text-[11px]"
            [style.color]="concentrationColor()"
            [title]="'Top customer: ' + concentration.topCustomerShare + '% of revenue'"
          >
            Top 5 · {{ concentration.topFiveShare }}%
          </span>
        }
      </header>

      <div class="px-4 sm:px-6 py-2 flex-1">
        @if (customers.length > 0) {
          <ul>
            @for (c of customers; track c.email; let i = $index) {
              <li class="border-t first:border-t-0" style="border-color: var(--ex-rule)">
                <button
                  type="button"
                  (click)="customerClick.emit(c)"
                  class="w-full text-left group py-3 flex flex-col gap-2"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="flex items-baseline gap-3 min-w-0">
                      <span class="font-display text-base ex-gold w-6 flex-shrink-0">{{ i + 1 }}</span>
                      <span class="truncate text-sm ex-ink group-hover:text-[color:var(--ex-gold)] transition-colors">
                        {{ c.name }}
                      </span>
                    </span>
                    <span class="flex-shrink-0 font-ledger text-sm ex-ink">{{ c.value | zar }}</span>
                  </div>
                  <div class="flex items-center gap-3 pl-9">
                    <div class="flex-1 h-1 ex-track rounded-[1px]">
                      <div class="ex-track-fill h-1 rounded-[1px]" [style.width.%]="share(c)"></div>
                    </div>
                    <span class="flex-shrink-0 font-ledger text-[11px] ex-muted">
                      {{ c.orders }} {{ c.orders === 1 ? 'order' : 'orders' }}
                    </span>
                  </div>
                </button>
              </li>
            }
          </ul>
        } @else {
          <div class="flex items-center justify-center py-8 ex-muted text-sm">
            No collected-order revenue yet
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class TopRevenueCustomersCardComponent {
  @Input() title = 'Top Customers by Value';
  @Input() customers: TopRevenueCustomer[] = [];
  @Input() concentration: CustomerConcentration | null = null;
  @Output() customerClick = new EventEmitter<TopRevenueCustomer>();

  private get maxValue(): number {
    return this.customers.reduce((m, c) => Math.max(m, c.value), 0);
  }

  share(c: TopRevenueCustomer): number {
    const max = this.maxValue;
    return max > 0 ? (c.value / max) * 100 : 0;
  }

  concentrationColor(): string {
    switch (this.concentration?.level) {
      case 'risk':
        return 'var(--ex-risk)';
      case 'watch':
        return 'var(--ex-watch)';
      default:
        return 'var(--ex-good)';
    }
  }
}
