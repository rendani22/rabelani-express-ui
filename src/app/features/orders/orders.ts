import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { TransactionTableComponent, Transaction } from '../../shared/components/transaction/transaction-table/transaction-table.component';
import { OrdersActionsComponent } from './orders-actions/orders-actions.component';
import { PackageService, Package, PACKAGE_STATUS, PackageStatus, SettingsService, MarkCollectedPayload } from '../../core';
import { CreatePackageModalComponent, PackageDetailsPanelComponent, MarkCollectedModalComponent } from '../../shared/components/modals';
import { QrCodeComponent } from '../../shared/components/qr-code';
import { ToastService } from '../../shared/components/toast/toast.service';

/**
 * Orders page component that displays packages in a transaction table format.
 * Allows filtering, searching, and managing package orders.
 */
@Component({
  selector: 'app-orders',
  standalone: true,
  imports: [
    CommonModule,
    LayoutComponent,
    TransactionTableComponent,
    OrdersActionsComponent,
    CreatePackageModalComponent,
    PackageDetailsPanelComponent,
    MarkCollectedModalComponent,
    QrCodeComponent
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class OrdersComponent implements OnInit {
  private readonly packageService = inject(PackageService);
  private readonly settingsService = inject(SettingsService);
  private readonly toastService = inject(ToastService);

  // Modal state
  createPackageModalOpen = false;

  // QR Code modal state
  qrCodeModalOpen = signal(false);
  qrCodeData = signal<string>('');

  // Details panel state
  detailsPanelOpen = signal(false);
  selectedPackage = signal<Package | null>(null);

  // Mark-collected modal state
  markCollectedModalOpen = signal(false);
  packageAwaitingCollection = signal<Package | null>(null);
  isSubmittingCollection = signal(false);

  // Selection state
  selectedIds = signal<Set<string>>(new Set());

  // Loading and error states from service
  readonly isLoading = this.packageService.isLoading;
  readonly error = this.packageService.error;

  // Transform packages to transactions for the table
  readonly transactions = computed<Transaction[]>(() => {
    return this.packageService.packages().map(pkg => this.mapPackageToTransaction(pkg));
  });

  // Status filter — initialised from user settings
  readonly statusFilter = signal<string>(this.settingsService.defaultOrdersFilter());

  // Pagination
  readonly pageSizeOptions = [10, 25, 50, 100] as const;
  readonly pageSize = signal<number>(10);
  readonly currentPage = signal<number>(1);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.transactions().length / this.pageSize()))
  );

  readonly pagedTransactions = computed<Transaction[]>(() => {
    const all = this.transactions();
    const size = this.pageSize();
    // Clamp current page within bounds.
    const page = Math.min(Math.max(1, this.currentPage()), Math.max(1, Math.ceil(all.length / size)));
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  readonly pageRangeStart = computed(() => {
    if (this.transactions().length === 0) {
      return 0;
    }
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  readonly pageRangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.transactions().length)
  );

  /** Visible page-number buttons (windowed around the current page). */
  readonly visiblePages = computed<number[]>(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const window = 5;
    let start = Math.max(1, current - Math.floor(window / 2));
    const end = Math.min(total, start + window - 1);
    start = Math.max(1, end - window + 1);
    const pages: number[] = [];
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  });

  async ngOnInit(): Promise<void> {
    await this.loadPackages();
  }

  /**
   * Load packages from the service with optional filters.
   */
  async loadPackages(): Promise<void> {
    const status = this.statusFilter();
    const filters = status !== 'all' ? { status } : undefined;
    await this.packageService.loadPackages(filters);
  }

  /**
   * Maps a Package entity to a Transaction for table display.
   */
  private mapPackageToTransaction(pkg: Package): Transaction {
    return {
      id: pkg.id,
      reference: pkg.reference,
      counterparty: pkg.receiver_email,
      counterpartyImage: this.getAvatarUrl(pkg.receiver_email),
      paymentDate: this.formatDate(pkg.created_at),
      status: this.mapPackageStatusToTransactionStatus(pkg.status),
      notes: pkg.notes || undefined
    };
  }

  /**
   * Gets a placeholder avatar URL based on email.
   */
  private getAvatarUrl(email: string): string {
    // Use UI Avatars service for consistent avatars
    const name = email.split('@')[0].replace(/[^a-zA-Z]/g, ' ');
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=64`;
  }

  /**
   * Formats a date string for display.
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  /**
   * Maps package status to transaction status.
   */
  private mapPackageStatusToTransactionStatus(status: PackageStatus): 'Pending' | 'Completed' | 'Canceled' | 'In Transit' | 'Ready' {
    switch (status) {
      case PACKAGE_STATUS.COLLECTED:
      case PACKAGE_STATUS.DELIVERED:
        return 'Completed';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'In Transit';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'Ready';
      case PACKAGE_STATUS.PENDING:
      case PACKAGE_STATUS.NOTIFIED:
      default:
        return 'Pending';
    }
  }

  /**
   * Handle search input from actions component.
   */
  async onSearch(searchTerm: string): Promise<void> {
    this.currentPage.set(1);
    await this.packageService.loadPackages({ search: searchTerm });
  }

  /**
   * Handle status filter change.
   */
  async onStatusFilterChange(status: string): Promise<void> {
    this.statusFilter.set(status);
    this.currentPage.set(1);
    await this.loadPackages();
  }

  /**
   * Handle add package button click.
   */
  onAddPackage(): void {
    this.createPackageModalOpen = true;
  }

  /**
   * Handle modal close.
   */
  onCloseCreatePackageModal(): void {
    this.createPackageModalOpen = false;
  }

  /**
   * Handle package created event.
   */
  async onPackageCreated(pkg: Package): Promise<void> {
    this.toastService.success(`Package ${pkg.reference} created successfully!`);
    this.createPackageModalOpen = false;
    // Refresh the packages list
    await this.loadPackages();
  }

  /**
   * Handle transaction row selection.
   */
  onTransactionSelected(transaction: Transaction): void {
    // Find the original package from the service
    const pkg = this.packageService.packages().find(p => p.id === transaction.id);
    if (pkg) {
      this.selectedPackage.set(pkg);
      this.detailsPanelOpen.set(true);
    }
  }

  /**
   * Handle details panel close.
   */
  onCloseDetailsPanel(): void {
    this.detailsPanelOpen.set(false);
    this.selectedPackage.set(null);
  }

  /**
   * Handle status update from details panel.
   * Routes to appropriate workflow action based on current status.
   */
  async onUpdatePackageStatus(pkg: Package): Promise<void> {
    try {
      let result: { success: boolean; error?: string };

      switch (pkg.status) {
        case PACKAGE_STATUS.PENDING:
        case PACKAGE_STATUS.NOTIFIED:
          // Driver picks up package - marks as in_transit
          result = await this.packageService.driverPickup(pkg.id);
          break;

        case PACKAGE_STATUS.IN_TRANSIT:
          // Collection point receives package - marks as ready_for_collection
          result = await this.packageService.receiveAtCollection(pkg.id);
          break;

        case PACKAGE_STATUS.READY_FOR_COLLECTION:
          // Open the proof-of-delivery modal — admin/collection only.
          // The actual status update happens after the modal is submitted.
          this.packageAwaitingCollection.set(pkg);
          this.markCollectedModalOpen.set(true);
          return;

        default:
          this.toastService.warning('No action available for current package status.');
          return;
      }

      if (result.success) {
        this.toastService.success('Package status updated successfully.');
      }

      // Close panel and refresh packages
      this.onCloseDetailsPanel();
      await this.loadPackages();
    } catch (error) {
      this.toastService.error('An unexpected error occurred while updating the package status.');
    }
  }

  /**
   * Handle a manual status change requested by an admin/collection user
   * from the details panel dropdown. Enforces that `collected` is never
   * set via this path (it requires the proof-of-delivery modal flow).
   */
  async onSetPackageStatus(event: { pkg: Package; status: PackageStatus }): Promise<void> {
    const { pkg, status } = event;

    if (status === PACKAGE_STATUS.COLLECTED) {
      // Defensive: route to the POD modal flow instead of a direct update.
      this.packageAwaitingCollection.set(pkg);
      this.markCollectedModalOpen.set(true);
      return;
    }

    try {
      const result = await this.packageService.updatePackage(pkg.id, { status });

      if (result.success) {
        this.toastService.success(
          `Package ${pkg.reference} status updated to ${this.getStatusLabel(status)}.`
        );
        this.onCloseDetailsPanel();
        await this.loadPackages();
      } else {
        this.toastService.error(result.error ?? 'Failed to update package status.');
      }
    } catch {
      this.toastService.error('An unexpected error occurred while updating the package status.');
    }
  }

  /**
   * Human-friendly label for a package status.
   */
  private getStatusLabel(status: PackageStatus): string {
    const labels: Record<PackageStatus, string> = {
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready for Collection',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected',
    };
    return labels[status] ?? status;
  }

  /**
   * Close the mark-collected modal without submitting.
   */
  onCloseMarkCollectedModal(): void {
    if (this.isSubmittingCollection()) {
      return;
    }
    this.markCollectedModalOpen.set(false);
    this.packageAwaitingCollection.set(null);
  }

  /**
   * Handle proof-of-delivery confirmation: marks the package as collected
   * with the captured receiver/witness details and signatures.
   */
  async onCollectionConfirmed(payload: MarkCollectedPayload): Promise<void> {
    const pkg = this.packageAwaitingCollection();
    if (!pkg) {
      return;
    }

    this.isSubmittingCollection.set(true);
    try {
      const result = await this.packageService.updatePackage(pkg.id, {
        status: PACKAGE_STATUS.COLLECTED,
        pod: payload,
      });

      if (result.success) {
        this.toastService.success(`Package ${pkg.reference} marked as collected.`);
        this.markCollectedModalOpen.set(false);
        this.packageAwaitingCollection.set(null);
        this.onCloseDetailsPanel();
        await this.loadPackages();
      } else {
        this.toastService.error(result.error ?? 'Failed to mark package as collected.');
      }
    } catch {
      this.toastService.error('An unexpected error occurred while confirming collection.');
    } finally {
      this.isSubmittingCollection.set(false);
    }
  }

  /**
   * Handle selection change from table.
   */
  onSelectionChanged(newSelection: Set<string>): void {
    this.selectedIds.set(newSelection);
  }

  /**
   * Handle delete confirmation from the transaction table.
   * Deletes the selected packages and refreshes the list.
   */
  async onDeletePackages(ids: string[]): Promise<void> {
    if (!ids || ids.length === 0) {
      return;
    }

    try {
      const result = await this.packageService.deletePackages(ids);

      if (result.success) {
        this.toastService.success(
          `${result.deleted} package${result.deleted === 1 ? '' : 's'} deleted successfully.`
        );
      } else {
        this.toastService.error(result.error ?? 'Failed to delete packages.');
      }

      // Clear local selection state and refresh.
      this.selectedIds.set(new Set());
      await this.loadPackages();
    } catch {
      this.toastService.error('An unexpected error occurred while deleting packages.');
    }
  }

  /**
   * Refresh the packages list.
   */
  async onRefresh(): Promise<void> {
    await this.loadPackages();
  }

  /**
   * Show QR code for the selected package.
   */
  showQrCode(pkg: Package): void {
    // Generate QR code data with package reference and tracking info
    const qrData = JSON.stringify({
      reference: pkg.reference,
      id: pkg.id,
      status: pkg.status,
      receiver: pkg.receiver_email
    });
    this.qrCodeData.set(qrData);
    this.qrCodeModalOpen.set(true);
  }

  /**
   * Close the QR code modal.
   */
  closeQrCodeModal(): void {
    this.qrCodeModalOpen.set(false);
    this.qrCodeData.set('');
  }

  // ---------------- Pagination handlers ----------------

  /** Go to a specific page (clamped to valid range). */
  goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    this.currentPage.set(clamped);
  }

  /** Go to the previous page. */
  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  /** Go to the next page. */
  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  /** Change the page size and reset to the first page. */
  onPageSizeChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isNaN(value) && value > 0) {
      this.pageSize.set(value);
      this.currentPage.set(1);
    }
  }
}

