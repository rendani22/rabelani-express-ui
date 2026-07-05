import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { InventoryPosition } from '../../../services/executive-dashboard.service';

/**
 * Inventory position — the stock value backing future fulfilment plus the
 * low/out-of-stock exposure that threatens it, in the report's ledger style.
 * Watchlist rows link into the Inventory page.
 */
@Component({
  selector: 'app-inventory-position-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
        <button
          type="button"
          (click)="viewInventoryClick.emit()"
          class="ex-eyebrow hover:text-[color:var(--ex-gold)] transition-colors"
        >
          View inventory →
        </button>
      </header>

      <div class="p-4 sm:p-6 flex-1">
        @if (position.available) {
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Summary figures -->
            <div class="grid grid-cols-3 lg:grid-cols-1 gap-5 lg:border-r lg:pr-6" style="border-color: var(--ex-rule)">
              <div class="flex flex-col gap-1">
                <span class="ex-eyebrow">Stock Value</span>
                <span class="font-display text-2xl ex-ink leading-none tabular-nums">{{ position.stockValue | zar: 'compact' }}</span>
                <span class="font-ledger text-[11px] ex-muted mt-0.5"><span class="tabular-nums">{{ position.activeItems }}</span> active items</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="ex-eyebrow">Low Stock</span>
                <span
                  class="font-display text-2xl leading-none tabular-nums"
                  [style.color]="position.lowStock > 0 ? 'var(--ex-watch)' : 'var(--ex-ink)'"
                >{{ position.lowStock }}</span>
                <span class="font-ledger text-[11px] ex-muted mt-0.5">near threshold</span>
              </div>
              <div class="flex flex-col gap-1">
                <span class="ex-eyebrow">Out of Stock</span>
                <span
                  class="font-display text-2xl leading-none tabular-nums"
                  [style.color]="position.outOfStock > 0 ? 'var(--ex-risk)' : 'var(--ex-ink)'"
                >{{ position.outOfStock }}</span>
                <span class="font-ledger text-[11px] ex-muted mt-0.5">fulfilment risk</span>
              </div>
            </div>

            <!-- Watchlist -->
            <div class="lg:col-span-2">
              <span class="ex-eyebrow">Stock Watchlist</span>
              @if (position.topLowStock.length > 0) {
                <ul class="mt-2">
                  @for (item of position.topLowStock; track item.id) {
                    <li class="border-t first:border-t-0" style="border-color: var(--ex-rule)">
                      <button
                        type="button"
                        (click)="inventoryItemClick.emit(item)"
                        class="w-full flex items-center justify-between gap-3 py-2.5 text-left group"
                      >
                        <span class="truncate text-sm ex-ink-soft group-hover:text-[color:var(--ex-gold)] transition-colors">
                          {{ item.name }}
                        </span>
                        <span
                          class="flex-shrink-0 font-ledger text-[11px] tabular-nums"
                          [style.color]="item.quantity === 0 ? 'var(--ex-risk)' : 'var(--ex-watch)'"
                        >
                          {{ item.quantity }} / {{ item.threshold }}
                        </span>
                      </button>
                    </li>
                  }
                </ul>
              } @else {
                <div class="mt-2 flex items-center gap-2 py-4 text-sm ex-good">
                  <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  All tracked items are above their stock thresholds.
                </div>
              }
            </div>
          </div>
        } @else {
          <div class="flex items-center justify-center py-8 ex-muted text-sm">
            Inventory metrics unavailable
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class InventoryPositionCardComponent {
  @Input() title = 'Inventory Position';
  @Input() position: InventoryPosition = {
    stockValue: 0,
    lowStock: 0,
    outOfStock: 0,
    activeItems: 0,
    topLowStock: [],
    available: false,
  };

  @Output() viewInventoryClick = new EventEmitter<void>();
  @Output() inventoryItemClick = new EventEmitter<{ id: string; name: string }>();
}
