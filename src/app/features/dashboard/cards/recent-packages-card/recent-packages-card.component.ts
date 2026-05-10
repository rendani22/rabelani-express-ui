import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PackageActivity } from '../../services/dashboard.service';
import { PACKAGE_STATUS } from '../../../../core';

@Component({
  selector: 'app-recent-packages-card',
  standalone: true,
  imports: [CommonModule],
  host: { 'class': 'col-span-12 lg:col-span-8 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <button
          (click)="viewAllClick.emit()"
          class="text-sm font-medium text-violet-500 hover:text-violet-600 dark:hover:text-violet-400">
          View All →
        </button>
      </header>
      <div class="p-2 sm:p-3 flex-1">
        @if (packages.length > 0) {
          <div class="space-y-1">
            @for (pkg of packages; track pkg.id) {
              <div
                class="flex items-center justify-between p-2 sm:p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer transition-colors"
                (click)="packageClick.emit(pkg)">
                <div class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                  <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                       [ngClass]="getStatusBgClass(pkg.status)">
                    <svg class="w-4 h-4 sm:w-5 sm:h-5" [ngClass]="getStatusIconClass(pkg.status)"
                         viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path>
                      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"></path>
                    </svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-100 font-mono truncate">
                      {{ pkg.reference }}
                    </div>
                    <div class="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {{ pkg.receiverEmail }}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-2">
                  <span class="hidden sm:inline-flex px-2 py-1 rounded-full text-xs font-medium"
                        [ngClass]="getStatusBadgeClass(pkg.status)">
                    {{ pkg.statusLabel }}
                  </span>
                  <span class="text-xs text-gray-400 dark:text-gray-500 whitespace-nowrap">
                    {{ pkg.timeAgo }}
                  </span>
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="py-8 text-center text-gray-500 dark:text-gray-400">
            <svg class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"></path>
              <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12"></path>
            </svg>
            <p class="text-sm">No recent packages</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: []
})
export class RecentPackagesCardComponent {
  @Input() title = 'Recent Packages';
  @Input() packages: PackageActivity[] = [];

  @Output() packageClick = new EventEmitter<PackageActivity>();
  @Output() viewAllClick = new EventEmitter<void>();

  getStatusBgClass(status: string): string {
    switch (status) {
      case PACKAGE_STATUS.PENDING:
      case PACKAGE_STATUS.NOTIFIED:
        return 'bg-amber-100 dark:bg-amber-500/20';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'bg-blue-100 dark:bg-blue-500/20';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'bg-purple-100 dark:bg-purple-500/20';
      case PACKAGE_STATUS.DELIVERED:
      case PACKAGE_STATUS.COLLECTED:
        return 'bg-green-100 dark:bg-green-500/20';
      case PACKAGE_STATUS.RETURNED:
        return 'bg-red-100 dark:bg-red-500/20';
      default:
        return 'bg-gray-100 dark:bg-gray-500/20';
    }
  }

  getStatusIconClass(status: string): string {
    switch (status) {
      case PACKAGE_STATUS.PENDING:
      case PACKAGE_STATUS.NOTIFIED:
        return 'text-amber-500';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'text-blue-500';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'text-purple-500';
      case PACKAGE_STATUS.DELIVERED:
      case PACKAGE_STATUS.COLLECTED:
        return 'text-green-500';
      case PACKAGE_STATUS.RETURNED:
        return 'text-red-500';
      default:
        return 'text-gray-500';
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case PACKAGE_STATUS.PENDING:
      case PACKAGE_STATUS.NOTIFIED:
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400';
      case PACKAGE_STATUS.DELIVERED:
      case PACKAGE_STATUS.COLLECTED:
        return 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400';
      case PACKAGE_STATUS.RETURNED:
        return 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400';
    }
  }
}


