import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Package, PACKAGE_STATUS, PackageStatus } from '../../../../core';

@Component({
  selector: 'app-package-details-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- Backdrop -->
    @if (isOpen) {
      <div
        class="fixed inset-0 bg-gray-900/50 z-40 transition-opacity"
        (click)="onClose()"
        aria-hidden="true"
      ></div>
    }

    <!-- Slide-out Panel -->
    <aside
      class="fixed top-0 right-0 bottom-0 w-full max-w-md bg-white dark:bg-gray-800 shadow-xl z-50 transform transition-transform duration-300 ease-in-out overflow-hidden"
      [class.translate-x-0]="isOpen"
      [class.translate-x-full]="!isOpen"
      role="dialog"
      aria-modal="true"
      [attr.aria-labelledby]="isOpen ? 'panel-title' : null"
    >
      @if (package; as pkg) {
        <div class="h-full flex flex-col">
          <!-- Header -->
          <header class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex items-center justify-between">
              <div>
                <h2 id="panel-title" class="text-lg font-semibold text-gray-900 dark:text-white">
                  Package Details
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 font-mono">
                  {{ pkg.reference }}
                </p>
              </div>
              <button
                type="button"
                class="p-2 text-gray-400 hover:text-gray-500 dark:text-gray-500 dark:hover:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                (click)="onClose()"
                aria-label="Close panel"
              >
                <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"></path>
                </svg>
              </button>
            </div>
          </header>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto">
            <!-- Status Card -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div class="w-12 h-12 rounded-full flex items-center justify-center" [ngClass]="getStatusBgClass(pkg.status)">
                    <svg class="w-6 h-6" [ngClass]="getStatusIconClass(pkg.status)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      @switch (pkg.status) {
                        @case ('collected') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        }
                        @case ('delivered') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        }
                        @case ('in_transit') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"></path>
                        }
                        @case ('ready_for_collection') {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path>
                        }
                        @default {
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        }
                      }
                    </svg>
                  </div>
                  <div>
                    <span class="inline-flex px-2.5 py-1 rounded-full text-xs font-medium" [ngClass]="getStatusBadgeClass(pkg.status)">
                      {{ getStatusLabel(pkg.status) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Receiver Info -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Receiver
              </h3>
              <div class="flex items-center gap-3">
                <img
                  [src]="getAvatarUrl(pkg.receiver_email)"
                  [alt]="pkg.receiver_email"
                  class="w-10 h-10 rounded-full"
                />
                <div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    {{ getEmailName(pkg.receiver_email) }}
                  </p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {{ pkg.receiver_email }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Package Info -->
            <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Package Information
              </h3>
              <dl class="space-y-3">
                <div class="flex justify-between">
                  <dt class="text-sm text-gray-500 dark:text-gray-400">Reference</dt>
                  <dd class="text-sm font-medium text-gray-900 dark:text-white font-mono">{{ pkg.reference }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-sm text-gray-500 dark:text-gray-400">Created</dt>
                  <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(pkg.created_at) }}</dd>
                </div>
                @if (pkg.updated_at) {
                  <div class="flex justify-between">
                    <dt class="text-sm text-gray-500 dark:text-gray-400">Last Updated</dt>
                    <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ formatDate(pkg.updated_at) }}</dd>
                  </div>
                }
                @if (pkg.created_by) {
                  <div class="flex justify-between">
                    <dt class="text-sm text-gray-500 dark:text-gray-400">Created By</dt>
                    <dd class="text-sm font-medium text-gray-900 dark:text-white">{{ pkg.created_by }}</dd>
                  </div>
                }
              </dl>
            </div>

            <!-- Package Items -->
            @if (pkg.items && pkg.items.length > 0) {
              <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Items ({{ pkg.items.length }})
                </h3>
                <ul class="space-y-2">
                  @for (item of pkg.items; track item.id) {
                    <li class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <span class="text-sm text-gray-900 dark:text-white">{{ item.description }}</span>
                      <span class="text-sm font-medium text-gray-500 dark:text-gray-400">× {{ item.quantity }}</span>
                    </li>
                  }
                </ul>
              </div>
            }

            <!-- Notes -->
            @if (pkg.notes) {
              <div class="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
                <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                  Notes
                </h3>
                <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ pkg.notes }}</p>
              </div>
            }

            <!-- Timeline / History (placeholder) -->
            <div class="px-6 py-5">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Activity
              </h3>
              <div class="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
                <div class="relative">
                  <div class="absolute -left-[25px] w-4 h-4 rounded-full bg-violet-500 border-2 border-white dark:border-gray-800"></div>
                  <p class="text-sm font-medium text-gray-900 dark:text-white">Package created</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDateTime(pkg.created_at) }}</p>
                </div>
                @if (pkg.status !== 'pending') {
                  <div class="relative">
                    <div class="absolute -left-[25px] w-4 h-4 rounded-full bg-blue-500 border-2 border-white dark:border-gray-800"></div>
                    <p class="text-sm font-medium text-gray-900 dark:text-white">Status updated to {{ getStatusLabel(pkg.status) }}</p>
                    @if (pkg.updated_at) {
                      <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDateTime(pkg.updated_at) }}</p>
                    }
                  </div>
                }
              </div>
            </div>
          </div>

          <!-- Footer Actions -->
          <footer class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-900/50">
            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                class="flex-1 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                (click)="onClose()"
              >
                Close
              </button>
              <button
                type="button"
                class="px-4 py-2 text-sm font-medium text-violet-700 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/50 transition-colors flex items-center gap-2"
                (click)="onShowQrCode()"
                title="Show QR Code"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"></path>
                </svg>
                QR Code
              </button>
              @if (canUpdateStatus(pkg.status)) {
                <button
                  type="button"
                  class="flex-1 px-4 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-700 rounded-lg transition-colors"
                  (click)="onUpdateStatus()"
                >
                  {{ getNextStatusAction(pkg.status) }}
                </button>
              }
            </div>
          </footer>
        </div>
      }
    </aside>
  `,
  styles: [`
    :host {
      display: contents;
    }
  `]
})
export class PackageDetailsPanelComponent {
  @Input() isOpen = false;
  @Input() package: Package | null = null;

  @Output() closePanel = new EventEmitter<void>();
  @Output() updateStatus = new EventEmitter<Package>();
  @Output() showQrCode = new EventEmitter<Package>();

  onClose(): void {
    this.closePanel.emit();
  }

  onUpdateStatus(): void {
    if (this.package) {
      this.updateStatus.emit(this.package);
    }
  }

  onShowQrCode(): void {
    if (this.package) {
      this.showQrCode.emit(this.package);
    }
  }

  getStatusLabel(status: PackageStatus): string {
    const labels: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready for Collection',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected',
    };
    return labels[status] || status;
  }

  getStatusBadgeClass(status: PackageStatus): string {
    const classes: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-400',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-400',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-500/20 dark:text-indigo-400',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-400',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-400',
    };
    return classes[status] || 'bg-gray-100 text-gray-800 dark:bg-gray-500/20 dark:text-gray-400';
  }

  getStatusBgClass(status: PackageStatus): string {
    const classes: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-100 dark:bg-yellow-500/20',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-100 dark:bg-blue-500/20',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-100 dark:bg-indigo-500/20',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-100 dark:bg-purple-500/20',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-100 dark:bg-green-500/20',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-100 dark:bg-green-500/20',
    };
    return classes[status] || 'bg-gray-100 dark:bg-gray-500/20';
  }

  getStatusIconClass(status: PackageStatus): string {
    const classes: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.PENDING]: 'text-yellow-600 dark:text-yellow-400',
      [PACKAGE_STATUS.NOTIFIED]: 'text-blue-600 dark:text-blue-400',
      [PACKAGE_STATUS.IN_TRANSIT]: 'text-indigo-600 dark:text-indigo-400',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'text-purple-600 dark:text-purple-400',
      [PACKAGE_STATUS.DELIVERED]: 'text-green-600 dark:text-green-400',
      [PACKAGE_STATUS.COLLECTED]: 'text-green-600 dark:text-green-400',
    };
    return classes[status] || 'text-gray-600 dark:text-gray-400';
  }

  canUpdateStatus(status: PackageStatus): boolean {
    // Only allow status updates for non-final statuses
    return status !== PACKAGE_STATUS.COLLECTED && status !== PACKAGE_STATUS.DELIVERED;
  }

  getNextStatusAction(status: PackageStatus): string {
    const actions: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'Mark as Notified',
      [PACKAGE_STATUS.NOTIFIED]: 'Start Transit',
      [PACKAGE_STATUS.IN_TRANSIT]: 'Mark Ready',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Mark Collected',
    };
    return actions[status] || 'Update Status';
  }

  getAvatarUrl(email: string): string {
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ');
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=64`;
  }

  getEmailName(email: string): string {
    return email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatDateTime(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }
}



