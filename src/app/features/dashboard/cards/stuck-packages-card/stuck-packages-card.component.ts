import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { StuckPackage } from '../../services/dashboard.service';

/**
 * Stuck / SLA-Breach Packages.
 * Lists packages that have not progressed past their current status within
 * the per-status SLA threshold. Critical operational signal — these are the
 * packages most likely to generate customer complaints if not actioned.
 */
@Component({
  selector: 'app-stuck-packages-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-6 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs px-2 py-0.5 rounded-full tabular-nums"
              [class.bg-rose-100]="packages.length > 0"
              [class.text-rose-700]="packages.length > 0"
              [class.bg-emerald-100]="packages.length === 0"
              [class.text-emerald-700]="packages.length === 0">
          {{ packages.length === 0 ? 'All on track' : packages.length + ' over SLA' }}
        </span>
      </header>
      <div class="p-3 flex-1">
        @if (packages.length > 0) {
          <div class="space-y-2 max-h-72 overflow-y-auto pr-1">
            @for (p of packages; track p.id) {
              <button type="button"
                      (click)="packageClick.emit(p)"
                      class="w-full text-left flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                <div class="w-2 h-10 rounded-full"
                     [ngClass]="severityBar(p.hoursStuck, p.thresholdHours)"></div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{{ p.reference }}</div>
                  <div class="text-xs text-gray-400 dark:text-gray-500 truncate">{{ p.receiverEmail }}</div>
                </div>
                <div class="text-right">
                  <div class="text-xs font-medium tabular-nums" [ngClass]="severityText(p.hoursStuck, p.thresholdHours)">
                    {{ formatHours(p.hoursStuck) }} stuck
                  </div>
                  <div class="text-[11px] text-gray-400">{{ p.statusLabel }} · SLA <span class="tabular-nums">{{ p.thresholdHours }}</span>h</div>
                </div>
              </button>
            }
          </div>
        } @else {
          <div class="h-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 text-sm py-8">
            ✓ No packages over SLA
          </div>
        }
      </div>
    </div>
  `,
})
export class StuckPackagesCardComponent {
  @Input() title = 'SLA Alerts';
  @Input() packages: StuckPackage[] = [];
  @Output() packageClick = new EventEmitter<StuckPackage>();

  severityBar(hours: number, threshold: number): string {
    const ratio = hours / Math.max(threshold, 1);
    if (ratio >= 3) return 'bg-rose-500';
    if (ratio >= 2) return 'bg-orange-500';
    return 'bg-amber-400';
  }

  severityText(hours: number, threshold: number): string {
    const ratio = hours / Math.max(threshold, 1);
    if (ratio >= 3) return 'text-rose-600 dark:text-rose-400';
    if (ratio >= 2) return 'text-orange-600 dark:text-orange-400';
    return 'text-amber-600 dark:text-amber-400';
  }

  formatHours(h: number): string {
    if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  }
}

