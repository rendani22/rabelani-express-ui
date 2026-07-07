import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { TopRevenueItem } from '../../../services/executive-dashboard.service';

/**
 * Inventory items ranked by the completed-order value they generated as a
 * ledger list — Fraunces rank numerals, a brass value-share bar, ledger detail
 * for units and orders. Rows link out to Inventory when the item is tracked.
 */
@Component({
  selector: 'app-top-revenue-items-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
      </header>

      <div class="px-4 sm:px-6 py-2 flex-1">
        @if (items.length > 0) {
          <ul>
            @for (item of items; track item.description; let i = $index) {
              <li class="border-t first:border-t-0" style="border-color: var(--ex-rule)">
                <button
                  type="button"
                  (click)="itemClick.emit(item)"
                  [disabled]="!item.inventoryItemId"
                  class="w-full text-left py-3 flex flex-col gap-2"
                  [ngClass]="item.inventoryItemId ? 'group' : 'cursor-default'"
                >
                  <div class="flex items-center justify-between gap-3">
                    <span class="flex items-baseline gap-3 min-w-0">
                      <span class="font-display text-base ex-gold w-6 flex-shrink-0">{{ i + 1 }}</span>
                      <span class="truncate text-sm ex-ink transition-colors group-hover:text-[color:var(--ex-gold)]">
                        {{ item.description }}
                      </span>
                    </span>
                    <span class="flex-shrink-0 font-ledger text-sm ex-ink">{{ item.value | zar }}</span>
                  </div>
                  <div class="flex items-center gap-3 pl-9">
                    <div class="flex-1 h-1 ex-track rounded-[1px]">
                      <div class="ex-track-fill h-1 rounded-[1px]" [style.width.%]="share(item)"></div>
                    </div>
                    <span class="flex-shrink-0 font-ledger text-[11px] ex-muted">
                      {{ item.quantity }} units · {{ item.orders }} {{ item.orders === 1 ? 'order' : 'orders' }}
                    </span>
                  </div>
                </button>
              </li>
            }
          </ul>
        } @else {
          <div class="flex items-center justify-center py-8 ex-muted text-sm">
            No priced items in collected orders yet
          </div>
        }
      </div>
    </section>
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
