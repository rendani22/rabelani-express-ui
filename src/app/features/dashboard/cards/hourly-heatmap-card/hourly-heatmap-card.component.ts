import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HourlyHeatmap } from '../../services/dashboard.service';

/**
 * Hourly Activity Heatmap.
 * 7×24 grid of package-creation counts (rows = day of week, columns = hour).
 * Surfaces the busiest windows so warehouse/dispatch shifts can be staffed
 * appropriately and slack periods can be used for restocking & maintenance.
 */
@Component({
  selector: 'app-hourly-heatmap-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ data.total }} packages · darker = busier</span>
      </header>
      <div class="p-4 sm:p-5 overflow-x-auto">
        <div class="inline-block min-w-full">
          <!-- Hour header -->
          <div class="grid grid-cols-[40px_repeat(24,minmax(18px,1fr))] gap-[2px] mb-1 text-[10px] text-gray-400">
            <div></div>
            @for (h of hours; track h) {
              <div class="text-center">{{ h % 6 === 0 ? h : '' }}</div>
            }
          </div>
          @for (label of dayLabels; track label; let d = $index) {
            <div class="grid grid-cols-[40px_repeat(24,minmax(18px,1fr))] gap-[2px] mb-[2px] items-center">
              <div class="text-[11px] font-medium text-gray-500 dark:text-gray-400 pr-2 text-right">{{ label }}</div>
              @for (h of hours; track h) {
                <div class="aspect-square rounded-sm transition-colors"
                     [ngClass]="cellClass(data.counts[d][h], data.max)"
                     [title]="label + ' ' + h + ':00 — ' + data.counts[d][h] + ' packages'"></div>
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
})
export class HourlyHeatmapCardComponent {
  @Input() title = 'Activity Heatmap';
  @Input() data: HourlyHeatmap = {
    counts: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
    total: 0,
  };

  readonly dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  readonly hours = Array.from({ length: 24 }, (_, i) => i);

  cellClass(count: number, max: number): string {
    if (max === 0 || count === 0) return 'bg-gray-100 dark:bg-gray-700/40';
    const ratio = count / max;
    if (ratio > 0.8) return 'bg-violet-700 dark:bg-violet-500';
    if (ratio > 0.6) return 'bg-violet-500 dark:bg-violet-400';
    if (ratio > 0.4) return 'bg-violet-400 dark:bg-violet-500/70';
    if (ratio > 0.2) return 'bg-violet-300 dark:bg-violet-500/50';
    return 'bg-violet-200 dark:bg-violet-500/30';
  }
}


