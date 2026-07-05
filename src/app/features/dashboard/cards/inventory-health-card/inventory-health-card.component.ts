import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { InventoryHealth } from '../../services/dashboard.service';

/**
 * Inventory Health snapshot.
 * Surfaces the state of the warehouse stock at a glance — total active SKUs,
 * out-of-stock and low-stock counts, total quantity and total stock value.
 * Drives reorder/restock decisions and prevents shipment shortages.
 */
@Component({
  selector: 'app-inventory-health-card',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  host: { class: 'col-span-12 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <button type="button" class="text-sm font-medium text-violet-500 hover:text-violet-600"
                (click)="viewInventoryClick.emit()">
          View Inventory →
        </button>
      </header>
      <div class="p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="rounded-lg p-3 bg-violet-50 dark:bg-violet-500/10">
          <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Active SKUs</div>
          <div class="text-2xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{{ data.activeItems }}</div>
          <div class="text-[11px] text-gray-400 tabular-nums">of {{ data.totalItems }} total</div>
        </div>
        <div class="rounded-lg p-3"
             [ngClass]="data.outOfStock > 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-gray-50 dark:bg-gray-700/30'">
          <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Out of Stock</div>
          <div class="text-2xl font-bold tabular-nums"
               [ngClass]="data.outOfStock > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-gray-700 dark:text-gray-200'">
            {{ data.outOfStock }}
          </div>
          <div class="text-[11px] text-gray-400">items at zero</div>
        </div>
        <div class="rounded-lg p-3"
             [ngClass]="data.lowStock > 0 ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-gray-50 dark:bg-gray-700/30'">
          <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Low Stock</div>
          <div class="text-2xl font-bold tabular-nums"
               [ngClass]="data.lowStock > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-200'">
            {{ data.lowStock }}
          </div>
          <div class="text-[11px] text-gray-400">below threshold</div>
        </div>
        <div class="rounded-lg p-3 bg-emerald-50 dark:bg-emerald-500/10">
          <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Stock Value</div>
          <div class="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            R{{ data.totalValue | number: '1.0-0' }}
          </div>
          <div class="text-[11px] text-gray-400 tabular-nums">{{ data.totalQuantity | number }} units</div>
        </div>
      </div>

      @if (data.topLowStock.length > 0) {
        <div class="px-4 sm:px-5 pb-4">
          <div class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Needs Restock</div>
          <ul class="space-y-1">
            @for (item of data.topLowStock; track item.id) {
              <li class="flex items-center justify-between text-sm">
                <button
                  type="button"
                  class="truncate text-left text-gray-700 dark:text-gray-300 hover:text-violet-600 dark:hover:text-violet-400"
                  (click)="inventoryItemClick.emit({ id: item.id, name: item.name })">
                  {{ item.name }}
                </button>
                <span class="font-mono text-xs tabular-nums"
                      [ngClass]="item.quantity === 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'">
                  {{ item.quantity }} / {{ item.threshold }}
                </span>
              </li>
            }
          </ul>
        </div>
      }
    </div>
  `,
})
export class InventoryHealthCardComponent {
  @Input() title = 'Inventory Health';
  @Input() data: InventoryHealth = {
    totalItems: 0,
    activeItems: 0,
    lowStock: 0,
    outOfStock: 0,
    totalQuantity: 0,
    totalValue: 0,
    topLowStock: [],
  };
  @Output() viewInventoryClick = new EventEmitter<void>();
  @Output() inventoryItemClick = new EventEmitter<{ id: string; name: string }>();
}


