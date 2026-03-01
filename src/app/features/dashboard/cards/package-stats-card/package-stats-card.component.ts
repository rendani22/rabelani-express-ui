import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface StatItem {
  label: string;
  value: number;
  icon: 'package' | 'clock' | 'truck' | 'check' | 'inbox';
  color: 'violet' | 'amber' | 'blue' | 'green' | 'purple';
  changePercent?: number;
}

@Component({
  selector: 'app-package-stats-card',
  standalone: true,
  imports: [CommonModule],
  host: { 'class': 'col-span-12 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>
      <div class="p-3">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          @for (stat of stats; track stat.label) {
            <div class="bg-gray-50 dark:bg-gray-700/30 rounded-lg p-3 sm:p-4">
              <div class="flex items-center justify-between mb-2">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center"
                     [ngClass]="getIconBgClass(stat.color)">
                  <svg class="w-5 h-5" [ngClass]="getIconColorClass(stat.color)"
                       viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <ng-container [ngSwitch]="stat.icon">
                      <ng-container *ngSwitchCase="'package'">
                        <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path>
                        <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"></path>
                      </ng-container>
                      <ng-container *ngSwitchCase="'clock'">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 6v6l4 2"></path>
                      </ng-container>
                      <ng-container *ngSwitchCase="'truck'">
                        <path d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM18.5 21a2.5 2.5 0 100-5 2.5 2.5 0 000 5z"></path>
                      </ng-container>
                      <ng-container *ngSwitchCase="'check'">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"></path>
                        <path d="M22 4L12 14.01l-3-3"></path>
                      </ng-container>
                      <ng-container *ngSwitchCase="'inbox'">
                        <path d="M22 12h-6l-2 3h-4l-2-3H2"></path>
                        <path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"></path>
                      </ng-container>
                    </ng-container>
                  </svg>
                </div>
                @if (stat.changePercent !== undefined) {
                  <span class="text-xs font-medium px-1.5 py-0.5 rounded-full"
                        [ngClass]="stat.changePercent >= 0 ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'">
                    {{ stat.changePercent >= 0 ? '+' : '' }}{{ stat.changePercent }}%
                  </span>
                }
              </div>
              <div class="text-2xl font-bold text-gray-800 dark:text-gray-100">{{ stat.value }}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mt-1">{{ stat.label }}</div>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class PackageStatsCardComponent {
  @Input() title = 'Package Overview';
  @Input() stats: StatItem[] = [];

  getIconBgClass(color: string): string {
    const classes: Record<string, string> = {
      violet: 'bg-violet-100 dark:bg-violet-500/20',
      amber: 'bg-amber-100 dark:bg-amber-500/20',
      blue: 'bg-blue-100 dark:bg-blue-500/20',
      green: 'bg-green-100 dark:bg-green-500/20',
      purple: 'bg-purple-100 dark:bg-purple-500/20',
    };
    return classes[color] || classes['violet'];
  }

  getIconColorClass(color: string): string {
    const classes: Record<string, string> = {
      violet: 'text-violet-500',
      amber: 'text-amber-500',
      blue: 'text-blue-500',
      green: 'text-green-500',
      purple: 'text-purple-500',
    };
    return classes[color] || classes['violet'];
  }
}


