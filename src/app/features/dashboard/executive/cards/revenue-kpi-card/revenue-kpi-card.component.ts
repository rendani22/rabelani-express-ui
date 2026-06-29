import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { RevenueKpi } from '../../../services/executive-dashboard.service';

/**
 * Headline revenue KPIs (Today / Week / Month / Year / All-time). Each tile
 * shows completed-order value, order count, average order value, and the
 * period-over-period change. Money-first layout for the CEO view.
 */
@Component({
  selector: 'app-revenue-kpi-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 block' },
  template: `
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4 lg:gap-6">
      @for (kpi of kpis; track kpi.key) {
        <div
          class="bg-white dark:bg-gray-800 shadow-sm rounded-xl p-4 sm:p-5 flex flex-col gap-2 border-l-4"
          [ngClass]="accentBorder(kpi.key)"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              {{ kpi.label }}
            </span>
            @if (kpi.deltaPercent !== null) {
              <span
                class="inline-flex items-center gap-0.5 text-xs font-semibold px-1.5 py-0.5 rounded-full"
                [ngClass]="kpi.deltaUp
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'"
              >
                {{ kpi.deltaUp ? '▲' : '▼' }} {{ absPercent(kpi.deltaPercent) }}%
              </span>
            }
          </div>

          <span class="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100 leading-tight">
            {{ kpi.value | zar }}
          </span>

          <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{{ kpi.orders }} {{ kpi.orders === 1 ? 'order' : 'orders' }}</span>
            <span>avg {{ kpi.avgOrderValue | zar }}</span>
          </div>

          @if (kpi.comparisonLabel) {
            <span class="text-[11px] text-gray-400 dark:text-gray-500">{{ kpi.comparisonLabel }}</span>
          }
        </div>
      }
    </div>
  `,
  styles: [],
})
export class RevenueKpiCardComponent {
  @Input() kpis: RevenueKpi[] = [];

  absPercent(value: number): string {
    return Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1);
  }

  accentBorder(key: RevenueKpi['key']): string {
    switch (key) {
      case 'today': return 'border-teal-500';
      case 'week': return 'border-violet-500';
      case 'month': return 'border-blue-500';
      case 'year': return 'border-indigo-500';
      case 'all': return 'border-emerald-500';
    }
  }
}
