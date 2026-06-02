import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { LayoutComponent } from '../../../shared/components/layout/layout.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../../shared/components/toast/toast.service';
import { Package, PackageService } from '../../../core';

/**
 * "Deleted orders" recycle-bin view.
 *
 * Only the privileged "order deleter" account can reach data here — the
 * route is also hidden from the UI for everyone else, and Supabase RLS
 * prevents non-privileged accounts from reading soft-deleted rows even if
 * they manually navigate to this URL.
 *
 * The list is intentionally minimal: it lets the privileged user inspect a
 * soft-deleted order and restore it, which re-deducts the inventory that
 * was returned on soft-delete.
 */
@Component({
  selector: 'app-deleted-orders',
  standalone: true,
  imports: [CommonModule, RouterLink, LayoutComponent, ConfirmDialogComponent],
  template: `
    <app-layout>
      <div class="w-full max-w-7xl mx-auto px-0 sm:px-0">
        <header class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">Deleted orders</h1>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Soft-deleted orders are hidden from the active list. Restoring an order will re-deduct any
              inventory items linked to it (this may push stock negative if other orders have since
              consumed it).
            </p>
          </div>
          <a routerLink="/orders" class="text-sm text-violet-600 dark:text-violet-400 hover:underline">
            ← Back to orders
          </a>
        </header>

        @if (!canView()) {
          <div class="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p class="text-sm text-red-700 dark:text-red-300">
              You are not permitted to view deleted orders.
            </p>
          </div>
        } @else if (isLoading()) {
          <div class="flex items-center justify-center py-12">
            <svg class="animate-spin h-6 w-6 text-violet-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
            </svg>
          </div>
        } @else if (deletedPackages().length === 0) {
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-12 text-center">
            <p class="text-sm text-gray-500 dark:text-gray-400">No deleted orders.</p>
          </div>
        } @else {
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 dark:bg-gray-900/40 text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th class="text-left px-4 py-3">Reference</th>
                  <th class="text-left px-4 py-3">PO #</th>
                  <th class="text-left px-4 py-3">Receiver</th>
                  <th class="text-left px-4 py-3">Items</th>
                  <th class="text-left px-4 py-3">Deleted</th>
                  <th class="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                @for (pkg of deletedPackages(); track pkg.id) {
                  <tr class="border-t border-gray-200 dark:border-gray-700">
                    <td class="px-4 py-3 font-mono text-violet-600 dark:text-violet-400">{{ pkg.reference }}</td>
                    <td class="px-4 py-3 font-mono text-gray-700 dark:text-gray-300">{{ pkg.po_number || '—' }}</td>
                    <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{{ pkg.receiver_email }}</td>
                    <td class="px-4 py-3 text-gray-700 dark:text-gray-300">{{ inventoryItemCount(pkg) }}</td>
                    <td class="px-4 py-3 text-gray-500 dark:text-gray-400">{{ formatDate(pkg.deleted_at) }}</td>
                    <td class="px-4 py-3 text-right">
                      <button
                        type="button"
                        class="px-3 py-1.5 text-xs font-medium text-white bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                        [disabled]="isRestoring()"
                        (click)="requestRestore(pkg)"
                      >
                        Restore
                      </button>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>

      <app-confirm-dialog
        [isOpen]="confirmRestoreOpen()"
        title="Restore order"
        [message]="restoreConfirmMessage()"
        confirmLabel="Restore"
        (confirmed)="onConfirmRestore()"
        (cancelled)="onCancelRestore()"
      ></app-confirm-dialog>
    </app-layout>
  `,
  styles: [':host { display: contents; }']
})
export class DeletedOrdersComponent implements OnInit {
  private readonly packageService = inject(PackageService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);

  readonly canView = computed(() => this.packageService.canDeleteOrders());
  readonly isLoading = signal(false);
  readonly isRestoring = signal(false);
  readonly deletedPackages = signal<readonly Package[]>([]);

  readonly confirmRestoreOpen = signal(false);
  readonly pendingRestore = signal<Package | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.canView()) {
      this.toastService.error('You are not permitted to view deleted orders.');
      await this.router.navigate(['/orders']);
      return;
    }
    await this.refresh();
  }

  async refresh(): Promise<void> {
    this.isLoading.set(true);
    try {
      const result = await this.packageService.loadDeletedPackages();
      if (result.success) {
        this.deletedPackages.set(result.data);
      } else {
        this.toastService.error(result.error ?? 'Failed to load deleted orders.');
      }
    } finally {
      this.isLoading.set(false);
    }
  }

  inventoryItemCount(pkg: Package): number {
    return (pkg.items ?? []).filter(i => !!i.inventory_item_id).length;
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  requestRestore(pkg: Package): void {
    if (this.isRestoring()) return;
    this.pendingRestore.set(pkg);
    this.confirmRestoreOpen.set(true);
  }

  onCancelRestore(): void {
    this.confirmRestoreOpen.set(false);
    this.pendingRestore.set(null);
  }

  restoreConfirmMessage(): string {
    const pkg = this.pendingRestore();
    if (!pkg) return '';
    const count = this.inventoryItemCount(pkg);
    const stockLine = count > 0
      ? ` Stock for ${count} inventory item${count === 1 ? '' : 's'} will be re-deducted; this may push inventory negative if other orders have since consumed it.`
      : '';
    return `Restore order ${pkg.reference}?${stockLine}`;
  }

  async onConfirmRestore(): Promise<void> {
    const pkg = this.pendingRestore();
    this.confirmRestoreOpen.set(false);
    if (!pkg) return;

    this.isRestoring.set(true);
    try {
      const result = await this.packageService.restorePackage(pkg.id);
      if (result.success) {
        const count = result.reDeductedItems ?? 0;
        const suffix = count > 0 ? ` Stock re-deducted for ${count} item${count === 1 ? '' : 's'}.` : '';
        if (result.error) {
          this.toastService.warning(
            `Order ${pkg.reference} restored, but inventory could not be fully re-deducted: ${result.error}`,
          );
        } else {
          this.toastService.success(`Order ${pkg.reference} restored.${suffix}`);
        }
        this.pendingRestore.set(null);
        await this.refresh();
      } else {
        this.toastService.error(result.error ?? 'Failed to restore order.');
      }
    } catch {
      this.toastService.error('An unexpected error occurred while restoring the order.');
    } finally {
      this.isRestoring.set(false);
    }
  }
}

