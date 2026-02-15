import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { TransactionTableComponent, Transaction } from '../../shared/components/transaction/transaction-table/transaction-table.component';
import { OrdersActionsComponent } from './orders-actions/orders-actions.component';
import { PackageService, Package, PACKAGE_STATUS, PackageStatus } from '../../core';
import { CreatePackageModalComponent, PackageDetailsPanelComponent } from '../../shared/components/modals';
import { QrCodeComponent } from '../../shared/components/qr-code';

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
    QrCodeComponent
  ],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class OrdersComponent implements OnInit {
  private readonly packageService = inject(PackageService);

  // Modal state
  createPackageModalOpen = false;

  // QR Code modal state
  qrCodeModalOpen = signal(false);
  qrCodeData = signal<string>('');

  // Details panel state
  detailsPanelOpen = signal(false);
  selectedPackage = signal<Package | null>(null);

  // Selection state
  selectedIds = signal<Set<string>>(new Set());

  // Loading and error states from service
  readonly isLoading = this.packageService.isLoading;
  readonly error = this.packageService.error;

  // Transform packages to transactions for the table
  readonly transactions = computed<Transaction[]>(() => {
    return this.packageService.packages().map(pkg => this.mapPackageToTransaction(pkg));
  });

  // Status filter
  readonly statusFilter = signal<string>('all');

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
    await this.packageService.loadPackages({ search: searchTerm });
  }

  /**
   * Handle status filter change.
   */
  async onStatusFilterChange(status: string): Promise<void> {
    this.statusFilter.set(status);
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
    console.log('Package created:', pkg);
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
   */
  async onUpdatePackageStatus(pkg: Package): Promise<void> {
    // TODO: Implement status update logic
    console.log('Update status for package:', pkg);
    // After update, refresh packages
    await this.loadPackages();
  }

  /**
   * Handle selection change from table.
   */
  onSelectionChanged(newSelection: Set<string>): void {
    this.selectedIds.set(newSelection);
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
}

