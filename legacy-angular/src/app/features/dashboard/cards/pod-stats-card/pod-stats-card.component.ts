import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PodStats } from '../../services/dashboard.service';

@Component({
  selector: 'app-pod-stats-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 sm:col-span-6 lg:col-span-4 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>
      <div class="p-4 sm:p-5 flex flex-col gap-4 flex-1">

        <!-- Main POD count -->
        <div class="flex items-center justify-between bg-violet-50 dark:bg-violet-500/10 rounded-xl p-4">
          <div>
            <div class="text-3xl font-bold text-violet-600 dark:text-violet-400">{{ podStats.total }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">Total PODs</div>
          </div>
          <div class="w-12 h-12 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center">
            <svg class="w-6 h-6 text-violet-600 dark:text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
            </svg>
          </div>
        </div>

        <!-- Stats grid -->
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
            <div class="text-xl font-bold text-green-600 dark:text-green-400">{{ podStats.withPdf }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">PDF Generated</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
            <div class="text-xl font-bold text-blue-600 dark:text-blue-400">{{ podStats.locked }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Locked PODs</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
            <div class="text-xl font-bold text-amber-600 dark:text-amber-400">{{ podStats.today }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Today</div>
          </div>
          <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 text-center">
            <div class="text-xl font-bold text-purple-600 dark:text-purple-400">{{ podStats.thisWeek }}</div>
            <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">This Week</div>
          </div>
        </div>

        <!-- PDF rate -->
        <div class="pt-1">
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-sm text-gray-600 dark:text-gray-300">PDF Generation Rate</span>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ pdfRate }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div class="bg-green-500 h-2 rounded-full transition-all duration-500"
                 [style.width.%]="pdfRate"></div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class PodStatsCardComponent {
  @Input() title = 'Proof of Delivery';
  @Input() podStats: PodStats = {
    total: 0,
    withPdf: 0,
    locked: 0,
    today: 0,
    thisWeek: 0,
  };

  get pdfRate(): number {
    if (this.podStats.total === 0) return 0;
    return Math.round((this.podStats.withPdf / this.podStats.total) * 100);
  }
}

