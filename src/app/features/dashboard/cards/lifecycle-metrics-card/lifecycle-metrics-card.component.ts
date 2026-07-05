import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LifecycleMetrics } from '../../services/dashboard.service';

/**
 * Lifecycle / Cycle-Time KPIs.
 * Reveals where time is being spent in the package journey:
 *   created → picked up → received at collection → collected by receiver.
 * Use these averages to identify bottlenecks (e.g. slow warehouse pickup,
 * long dwell time at collection point) and to set/measure SLAs.
 */
@Component({
  selector: 'app-lifecycle-metrics-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          based on {{ metrics.completedSampleSize }} completed
        </span>
      </header>
      <div class="p-4 sm:p-5 flex-1">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Create → Pickup</span>
            <span class="text-2xl font-bold text-amber-500 tabular-nums">{{ display(metrics.avgCreateToPickupHours) }}</span>
            <span class="text-[11px] text-gray-400">warehouse turnaround</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Pickup → Receive</span>
            <span class="text-2xl font-bold text-blue-500 tabular-nums">{{ display(metrics.avgPickupToReceiveHours) }}</span>
            <span class="text-[11px] text-gray-400">in-transit time</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Receive → Collect</span>
            <span class="text-2xl font-bold text-purple-500 tabular-nums">{{ display(metrics.avgReceiveToCollectHours) }}</span>
            <span class="text-[11px] text-gray-400">dwell at collection</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">End-to-End</span>
            <span class="text-2xl font-bold text-emerald-600 tabular-nums">{{ display(metrics.avgTotalCycleHours) }}</span>
            <span class="text-[11px] text-gray-400">total cycle</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LifecycleMetricsCardComponent {
  @Input() title = 'Cycle-Time Insights';
  @Input() metrics: LifecycleMetrics = {
    avgCreateToPickupHours: null,
    avgPickupToReceiveHours: null,
    avgReceiveToCollectHours: null,
    avgTotalCycleHours: null,
    completedSampleSize: 0,
  };

  display(v: number | null): string {
    if (v === null || v === undefined) return '—';
    if (v < 1) return `${Math.round(v * 60)}m`;
    if (v < 48) return `${v}h`;
    return `${Math.round(v / 24)}d`;
  }
}

