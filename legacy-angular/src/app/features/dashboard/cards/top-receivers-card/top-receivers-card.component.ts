import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TopReceiver } from '../../services/dashboard.service';

@Component({
  selector: 'app-top-receivers-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 sm:col-span-6 lg:col-span-4 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">by package count</span>
      </header>
      <div class="p-3 flex-1 flex flex-col">
        @if (receivers.length > 0) {
          <div class="space-y-2">
            @for (receiver of receivers; track receiver.email; let i = $index) {
              <div class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                <!-- Rank badge -->
                <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                     [ngClass]="getRankClass(i)">
                  {{ i + 1 }}
                </div>
                <!-- Info -->
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                    {{ receiver.name || receiver.email }}
                  </div>
                  @if (receiver.name) {
                    <div class="text-xs text-gray-400 dark:text-gray-500 truncate">{{ receiver.email }}</div>
                  }
                </div>
                <!-- Count + bar -->
                <div class="flex items-center gap-2 flex-shrink-0">
                  <div class="w-16 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 hidden sm:block">
                    <div class="h-1.5 rounded-full transition-all duration-500"
                         [ngClass]="getBarClass(i)"
                         [style.width.%]="getPercent(receiver.count)"></div>
                  </div>
                  <span class="text-sm font-semibold text-gray-800 dark:text-gray-100 w-5 text-right">
                    {{ receiver.count }}
                  </span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
            No receiver data available
          </div>
        }
      </div>
    </div>
  `,
  styles: [],
})
export class TopReceiversCardComponent {
  @Input() title = 'Top Receivers';
  @Input() receivers: TopReceiver[] = [];

  private readonly rankClasses = [
    'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
    'bg-gray-200 text-gray-600 dark:bg-gray-600/40 dark:text-gray-300',
    'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400',
  ];
  private readonly barClasses = [
    'bg-amber-500',
    'bg-gray-400',
    'bg-orange-500',
    'bg-violet-500',
    'bg-blue-500',
  ];

  getRankClass(index: number): string {
    return this.rankClasses[index] ?? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-400';
  }

  getBarClass(index: number): string {
    return this.barClasses[index % this.barClasses.length];
  }

  getPercent(count: number): number {
    if (!this.receivers.length) return 0;
    const max = this.receivers[0]?.count ?? 1;
    if (max === 0) return 0;
    return Math.round((count / max) * 100);
  }
}

