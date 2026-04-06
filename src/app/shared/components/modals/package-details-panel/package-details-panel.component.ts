import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Package, PackageItem, PACKAGE_STATUS, PackageStatus } from '../../../../core';
import { SupabaseService } from '../../../services/supabase.service';

/** A single entry in the package status audit log */
interface StatusHistoryEntry {
  readonly status: string;
  readonly changed_at: string;
  readonly changed_by?: string;
  readonly note?: string;
}

/** Fallback timeline entry derived from the package model when no history table exists */
interface TimelineEntry {
  readonly label: string;
  readonly timestamp: string | null;
  readonly color: string;
  readonly completed: boolean;
}

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
                <div class="flex items-center justify-between mb-3">
                  <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Items ({{ pkg.items.length }})
                  </h3>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300"
                    (click)="printAllItemQrCodes()"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                    </svg>
                    Print All QR
                  </button>
                </div>
                <ul class="space-y-2">
                  @for (item of pkg.items; track item.id) {
                    <li class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div class="flex-1">
                        <span class="text-sm text-gray-900 dark:text-white">{{ item.description }}</span>
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400 ml-2">× {{ item.quantity }}</span>
                      </div>
                      <button
                        type="button"
                        class="p-1.5 text-violet-500 hover:text-violet-600 dark:text-violet-400 dark:hover:text-violet-300 transition-colors rounded"
                        (click)="printItemQrCode(item)"
                        title="Print QR Code"
                      >
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                        </svg>
                      </button>
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

            <!-- Timeline / Activity Log -->
            <div class="px-6 py-5">
              <h3 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                Activity
              </h3>
              @if (loadingHistory()) {
                <div class="flex items-center justify-center py-4">
                  <svg class="animate-spin h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                  </svg>
                </div>
              } @else if (statusHistory().length > 0) {
                <!-- Supabase history entries -->
                <div class="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
                  @for (entry of statusHistory(); track entry.changed_at) {
                    <div class="relative">
                      <div class="absolute -left-[25px] w-4 h-4 rounded-full border-2 border-white dark:border-gray-800"
                           [class]="getHistoryDotColor(entry.status)"></div>
                      <p class="text-sm font-medium text-gray-900 dark:text-white">{{ getStatusLabel(entry.status) }}</p>
                      <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDateTime(entry.changed_at) }}</p>
                      @if (entry.note) {
                        <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5 italic">{{ entry.note }}</p>
                      }
                    </div>
                  }
                </div>
              } @else {
                <!-- Derived timeline fallback -->
                <div class="relative pl-6 border-l-2 border-gray-200 dark:border-gray-700 space-y-4">
                  @for (entry of derivedTimeline(); track entry.label) {
                    @if (entry.completed) {
                      <div class="relative">
                        <div class="absolute -left-[25px] w-4 h-4 rounded-full border-2 border-white dark:border-gray-800"
                             [class]="entry.color"></div>
                        <p class="text-sm font-medium text-gray-900 dark:text-white">{{ entry.label }}</p>
                        @if (entry.timestamp) {
                          <p class="text-xs text-gray-500 dark:text-gray-400">{{ formatDateTime(entry.timestamp) }}</p>
                        }
                      </div>
                    }
                  }
                </div>
              }
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
export class PackageDetailsPanelComponent implements OnChanges {
  private readonly supabaseService = inject(SupabaseService);

  @Input() isOpen = false;
  @Input() package: Package | null = null;

  @Output() closePanel = new EventEmitter<void>();
  @Output() updateStatus = new EventEmitter<Package>();
  @Output() showQrCode = new EventEmitter<Package>();

  /** Status history loaded from Supabase */
  readonly statusHistory = signal<StatusHistoryEntry[]>([]);

  /** Loading state for history */
  readonly loadingHistory = signal(false);

  ngOnChanges(changes: SimpleChanges): void {
    const pkgChange = changes['package'];
    const openChange = changes['isOpen'];
    if ((pkgChange || openChange) && this.isOpen && this.package) {
      void this.loadStatusHistory(this.package.id);
    }
  }

  /**
   * Load the status change history from the package_status_history table.
   * Silently falls back to the derived timeline if the table doesn't exist.
   */
  private async loadStatusHistory(packageId: string): Promise<void> {
    this.loadingHistory.set(true);
    try {
      const { data } = await this.supabaseService.client
        .from('package_status_history')
        .select('status, changed_at, changed_by, note')
        .eq('package_id', packageId)
        .order('changed_at', { ascending: true });

      this.statusHistory.set((data ?? []) as StatusHistoryEntry[]);
    } catch {
      this.statusHistory.set([]);
    } finally {
      this.loadingHistory.set(false);
    }
  }

  /**
   * Derives an ordered timeline from the current package status.
   * Used as fallback when no history table data is available.
   */
  derivedTimeline(): TimelineEntry[] {
    const pkg = this.package;
    if (!pkg) return [];

    const statusOrder: PackageStatus[] = [
      PACKAGE_STATUS.PENDING,
      PACKAGE_STATUS.NOTIFIED,
      PACKAGE_STATUS.IN_TRANSIT,
      PACKAGE_STATUS.READY_FOR_COLLECTION,
      PACKAGE_STATUS.COLLECTED,
    ];

    const currentIndex = statusOrder.indexOf(pkg.status as PackageStatus);

    const labels: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'Package created',
      [PACKAGE_STATUS.NOTIFIED]: 'Receiver notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'Driver picked up',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Arrived at collection point',
      [PACKAGE_STATUS.COLLECTED]: 'Package collected',
    };

    const colors: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-500',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-500',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-500',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-500',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-500',
    };

    return statusOrder.map((status, index) => ({
      label: labels[status] ?? status,
      timestamp: index === 0
        ? pkg.created_at
        : index === currentIndex && pkg.updated_at
          ? pkg.updated_at
          : null,
      color: colors[status] ?? 'bg-gray-400',
      completed: index <= currentIndex,
    }));
  }

  /**
   * Returns a dot colour class for a history entry status.
   */
  getHistoryDotColor(status: string): string {
    const colors: Record<string, string> = {
      [PACKAGE_STATUS.PENDING]: 'bg-yellow-500',
      [PACKAGE_STATUS.NOTIFIED]: 'bg-blue-500',
      [PACKAGE_STATUS.IN_TRANSIT]: 'bg-indigo-500',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'bg-purple-500',
      [PACKAGE_STATUS.DELIVERED]: 'bg-green-500',
      [PACKAGE_STATUS.COLLECTED]: 'bg-green-600',
    };
    return colors[status] ?? 'bg-gray-400';
  }

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

  getStatusLabel(status: PackageStatus | string): string {
    const labels: Record<string, string> = {
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

  /**
   * Generates QR code data for a package item
   */
  private getItemQrData(item: PackageItem): string {
    const pkg = this.package;
    if (!pkg) return '';

    return JSON.stringify({
      itemId: item.id,
      packageId: pkg.id,
      packageReference: pkg.reference,
      description: item.description,
      quantity: item.quantity
    });
  }

  /**
   * Prints QR code for a specific item
   * Optimized for AIMO D520 Thermal Label Printer with 2.25" x 4" labels (57mm x 102mm)
   */
  printItemQrCode(item: PackageItem): void {
    const pkg = this.package;
    if (!pkg) return;

    const printWindow = window.open('', '_blank', 'width=280,height=450');
    if (!printWindow) return;

    const qrData = this.getItemQrData(item);
    // QR code at 170px for good scanning on 57mm wide label
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(qrData)}`;

    // Truncate item ID for display (show first 8 and last 4 chars)
    const shortId = item.id.length > 14 ? `${item.id.slice(0, 8)}...${item.id.slice(-4)}` : item.id;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Print QR Code - ${item.description}</title>
        <style>
          /*
           * AIMO D520 Thermal Label Printer
           * Label: 2.25" x 4" (57mm x 102mm)
           */
          @page {
            size: 2.25in 4in;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            .print-btn, .print-instructions {
              display: none !important;
            }
            .label {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0.1in !important;
              border: none !important;
              box-shadow: none !important;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          html, body {
            width: 2.25in;
            height: 4in;
            margin: 0;
            padding: 0;
            font-family: Arial, Helvetica, sans-serif;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 2.25in;
            height: 4in;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background: white;
          }
          .package-ref {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 100%;
            padding-bottom: 0.05in;
            margin-bottom: 0.05in;
            border-bottom: 1px solid #000;
          }
          .item-title {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.08in;
            max-height: 0.5in;
            overflow: hidden;
            width: 100%;
          }
          .qr-code {
            width: 1.7in;
            height: 1.7in;
            margin: 0.05in 0;
          }
          .item-id {
            font-family: 'Courier New', monospace;
            font-size: 7pt;
            color: #333;
            text-align: center;
            margin-top: 0.05in;
          }
          .qty-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 0.08in 0.2in;
            font-size: 14pt;
            font-weight: bold;
            margin-top: 0.1in;
          }
          .print-btn {
            position: fixed;
            bottom: 10px;
            left: 50%;
            transform: translateX(-50%);
            padding: 8px 16px;
            font-size: 14px;
            cursor: pointer;
            z-index: 1000;
          }
          .print-instructions {
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: #fffbe6;
            border: 1px solid #faad14;
            padding: 10px 15px;
            border-radius: 4px;
            font-size: 12px;
            max-width: 300px;
            z-index: 1000;
          }
          @media screen {
            body {
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: #f0f0f0;
              padding: 60px 20px;
            }
            .label {
              border: 1px dashed #999;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="print-instructions">
          <strong>Printer Settings:</strong><br>
          1. Select AIMO D520 printer<br>
          2. Paper size: <strong>2.25 x 4 in</strong><br>
          3. Scale: <strong>100%</strong> (not "Fit to page")<br>
          4. Margins: <strong>None</strong>
        </div>
        <div class="label">
          <div class="package-ref">${pkg.reference}</div>
          <div class="item-title">${item.description}</div>
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
          <div class="item-id">${shortId}</div>
          <div class="qty-badge">QTY: ${item.quantity}</div>
        </div>
        <button class="print-btn" onclick="window.print(); return false;">Print Label</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }

  /**
   * Prints QR codes for all items in the package
   * Optimized for AIMO D520 Thermal Label Printer with 2.25" x 4" labels (57mm x 102mm)
   */
  printAllItemQrCodes(): void {
    const pkg = this.package;
    if (!pkg || !pkg.items || pkg.items.length === 0) return;

    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) return;

    // Generate HTML for all items - each item on its own label page
    const itemsHtml = pkg.items.map((item) => {
      const qrData = this.getItemQrData(item);
      const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=170x170&data=${encodeURIComponent(qrData)}`;
      const shortId = item.id.length > 14 ? `${item.id.slice(0, 8)}...${item.id.slice(-4)}` : item.id;

      return `
        <div class="label">
          <div class="package-ref">${pkg.reference}</div>
          <div class="item-title">${item.description}</div>
          <img class="qr-code" src="${qrCodeUrl}" alt="QR Code" />
          <div class="item-id">${shortId}</div>
          <div class="qty-badge">QTY: ${item.quantity}</div>
        </div>
      `;
    }).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <title>Print All QR Codes - ${pkg.reference}</title>
        <style>
          /*
           * AIMO D520 Thermal Label Printer
           * Label: 2.25" x 4" (57mm x 102mm)
           */
          @page {
            size: 2.25in 4in;
            margin: 0 !important;
            padding: 0 !important;
          }
          @media print {
            html, body {
              width: 2.25in !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .screen-header, .print-btn, .print-instructions {
              display: none !important;
            }
            .labels-container {
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
            }
            .label {
              position: relative !important;
              width: 2.25in !important;
              height: 4in !important;
              margin: 0 !important;
              padding: 0.1in !important;
              border: none !important;
              box-shadow: none !important;
              page-break-after: always;
              page-break-inside: avoid;
            }
            .label:last-child {
              page-break-after: auto;
            }
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: Arial, Helvetica, sans-serif;
            margin: 0;
            padding: 0;
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .label {
            width: 2.25in;
            height: 4in;
            padding: 0.1in;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            background: white;
          }
          .package-ref {
            font-weight: bold;
            font-size: 11pt;
            text-align: center;
            width: 100%;
            padding-bottom: 0.05in;
            margin-bottom: 0.05in;
            border-bottom: 1px solid #000;
          }
          .item-title {
            font-size: 9pt;
            font-weight: bold;
            text-align: center;
            line-height: 1.2;
            margin-bottom: 0.08in;
            max-height: 0.5in;
            overflow: hidden;
            width: 100%;
          }
          .qr-code {
            width: 1.7in;
            height: 1.7in;
            margin: 0.05in 0;
          }
          .item-id {
            font-family: 'Courier New', monospace;
            font-size: 7pt;
            color: #333;
            text-align: center;
            margin-top: 0.05in;
          }
          .qty-badge {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 0.08in 0.2in;
            font-size: 14pt;
            font-weight: bold;
            margin-top: 0.1in;
          }
          .screen-header {
            text-align: center;
            padding: 20px;
            border-bottom: 2px solid #333;
            margin-bottom: 20px;
            background: #f5f5f5;
          }
          .screen-header h1 {
            margin: 0 0 10px 0;
            font-size: 20px;
          }
          .screen-header p {
            margin: 5px 0;
            font-size: 12px;
            color: #666;
          }
          .print-instructions {
            background: #fffbe6;
            border: 1px solid #faad14;
            padding: 15px;
            border-radius: 4px;
            margin: 10px auto;
            max-width: 400px;
            font-size: 13px;
          }
          .print-instructions strong {
            display: block;
            margin-bottom: 8px;
          }
          .print-instructions ol {
            margin-left: 20px;
          }
          .print-instructions li {
            margin: 5px 0;
          }
          .labels-container {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            justify-content: center;
            padding: 20px;
          }
          .print-btn {
            display: block;
            margin: 20px auto;
            padding: 12px 24px;
            font-size: 16px;
            cursor: pointer;
            background: #1890ff;
            color: white;
            border: none;
            border-radius: 4px;
          }
          .print-btn:hover {
            background: #40a9ff;
          }
          @media screen {
            .label {
              border: 1px dashed #999;
              margin: 10px;
              box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            }
          }
        </style>
      </head>
      <body>
        <div class="screen-header">
          <h1>Package QR Code Labels</h1>
          <p><strong>Reference:</strong> ${pkg.reference}</p>
          <p><strong>Total Labels:</strong> ${pkg.items.length}</p>

          <div class="print-instructions">
            <strong>⚠️ Printer Settings:</strong>
            <ol>
              <li>Select <strong>AIMO D520</strong> as printer</li>
              <li>Set Paper Size to <strong>2.25 x 4 in</strong></li>
              <li>Set Scale to <strong>100%</strong> (not "Fit to page")</li>
              <li>Set Margins to <strong>None</strong></li>
            </ol>
          </div>
        </div>
        <div class="labels-container">
          ${itemsHtml}
        </div>
        <button class="print-btn" onclick="window.print(); return false;">🖨️ Print All Labels</button>
      </body>
      </html>
    `);

    printWindow.document.close();
  }
}



