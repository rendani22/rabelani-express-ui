import { ApplicationRef, Component, EnvironmentInjector, OnInit, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { TransactionTableComponent, Transaction } from '../../shared/components/transaction/transaction-table/transaction-table.component';
import { OrdersActionsComponent } from './orders-actions/orders-actions.component';
import { PackageService, Package, PACKAGE_STATUS, PackageStatus, SettingsService, MarkCollectedPayload, ReceiverService, ReceiverProfile, generatePodPdfBase64, OnboardingTourService } from '../../core';
import { CreatePackageModalComponent, PackageDetailsPanelComponent, MarkCollectedModalComponent, PodDocumentComponent, AssignDriverModalComponent, AssignDriverPayload } from '../../shared/components/modals';
import { QrCodeComponent } from '../../shared/components/qr-code';
// ...existing imports...
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
    // File-system view removed — only table view is shown now
    CreatePackageModalComponent,
    PackageDetailsPanelComponent,
    MarkCollectedModalComponent,
    PodDocumentComponent,
    AssignDriverModalComponent,
    QrCodeComponent
  ],
  templateUrl: './orders.html',
  styleUrls: ['./orders.css'],
})
export class OrdersComponent implements OnInit {
  private readonly packageService = inject(PackageService);
  private readonly settingsService = inject(SettingsService);
  private readonly toastService = inject(ToastService);
  private readonly receiverService = inject(ReceiverService);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly onboardingTour = inject(OnboardingTourService);
  private readonly router = inject(Router);

  /** Map of receiver email (lowercased) → full name for quick lookup. */
  private readonly receiverNamesByEmail = signal<Map<string, string>>(new Map());

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

  // POD document modal state
  podDocumentOpen = signal(false);
  podDocumentPackage = signal<Package | null>(null);

  // Assign-driver modal state — opened whenever a package is being
  // transitioned to `in_transit` (either via the workflow action or via the
  // manual status dropdown).
  assignDriverModalOpen = signal(false);
  packageAwaitingDriver = signal<Package | null>(null);
  isAssigningDriver = signal(false);

  // Selection state
  selectedIds = signal<Set<string>>(new Set());

  // Loading and error states from service
  readonly isLoading = this.packageService.isLoading;
  readonly error = this.packageService.error;
  // Expose the packages signal from the service for use in the template
  readonly packages = this.packageService.packages;

  // Transform packages to transactions for the table
  // Sorting state for the transaction table (default: lastUpdated desc)
  readonly sortField = signal<string | null>('lastUpdated');
  readonly sortDirection = signal<'asc' | 'desc'>('desc');

  readonly transactions = computed<Transaction[]>(() => {
    const txs = this.packageService.packages().map(pkg => this.mapPackageToTransaction(pkg));
    const field = this.sortField();
    const dir = this.sortDirection();
    if (!field) return txs;

    const getTime = (t: Transaction) => {
      if (field === 'lastUpdated') {
        const iso = (t as any).lastUpdatedIso as string | undefined;
        const createdIso = (t as any).paymentDateIso as string | undefined;
        const v = iso ?? createdIso ?? '';
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      }
      if (field === 'paymentDate') {
        const v = (t as any).paymentDateIso as string | undefined ?? '';
        const d = new Date(v);
        return Number.isNaN(d.getTime()) ? 0 : d.getTime();
      }
      return 0;
    };

    return txs.slice().sort((a, b) => {
      const ta = getTime(a);
      const tb = getTime(b);
      return dir === 'asc' ? ta - tb : tb - ta;
    });
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

  // View mode removed — always use table view

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
    // Load receivers in parallel so we can resolve names instead of emails.
    await Promise.all([this.loadReceivers(), this.loadPackages()]);
    // Debug: log active status filter and number of packages loaded to help
    // diagnose empty-list issues during development.
    console.debug('[Orders] statusFilter=', this.statusFilter(), 'packagesLoaded=', this.packageService.packages().length);
    // Auto-launch the orders onboarding tour for first-time users (no-op if
    // already completed). Delayed slightly so the table has rendered.
    setTimeout(() => this.onboardingTour.start('orders'), 700);
  }

  /**
   * Load receiver profiles and build an email → full name map used by
   * `mapPackageToTransaction` to display names instead of email addresses.
   */
  private async loadReceivers(): Promise<void> {
    const receivers = await this.receiverService.loadAllReceivers();
    const map = new Map<string, string>();
    for (const r of receivers as ReceiverProfile[]) {
      const email = (r.email ?? '').trim().toLowerCase();
      if (!email) continue;
      const fullName = `${r.name ?? ''} ${r.surname ?? ''}`.trim();
      if (fullName) {
        map.set(email, fullName);
      }
    }
    this.receiverNamesByEmail.set(map);
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
    const email = (pkg.receiver_email ?? '').trim().toLowerCase();
    const displayName =
      this.receiverNamesByEmail().get(email) ||
      // Fall back to the local-part of the email (formatted) so we never
      // expose the raw email address in the table.
      this.formatEmailLocalPart(pkg.receiver_email);

    return {
      id: pkg.id,
      reference: pkg.reference,
      orderNumber: pkg.po_number ?? undefined,
      counterparty: displayName,
      counterpartyImage: this.getAvatarUrl(displayName),
      // Created date shown without time (date-only)
      paymentDate: this.formatDateShort(pkg.created_at),
      // Keep ISO timestamps so the UI can render relative times while CSV
      // exports and tooltips use the already-formatted absolute strings.
      paymentDateIso: pkg.created_at,
      // Show the package.updated_at as the last-updated timestamp when
      // available; fall back to created_at for packages that haven't been
      // updated since creation.
      lastUpdated: this.formatDate(pkg.updated_at ?? pkg.created_at),
      lastUpdatedIso: pkg.updated_at ?? pkg.created_at,
      status: this.mapPackageStatusToTransactionStatus(pkg.status),
      notes: pkg.notes || undefined
    };
  }

  /** Convert "first.last@example.com" → "First Last" as a display fallback. */
  private formatEmailLocalPart(email: string): string {
    if (!email) return '';
    const local = email.split('@')[0] ?? '';
    return local
      .replace(/[._-]+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Gets a placeholder avatar URL based on the receiver's display name.
   */
  private getAvatarUrl(displayName: string): string {
    // Use UI Avatars service for consistent avatars
    const name = (displayName || 'Receiver').replace(/[^a-zA-Z ]/g, ' ').trim() || 'Receiver';
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&size=64`;
  }

  /**
   * Formats a date string for display.
   */
  private formatDate(dateString: string): string {
    const date = new Date(dateString);
    // Include a short time in the absolute format so exported rows and
    // inline absolute timestamps show both date and time (e.g. "May 23, 2026, 3:45 PM").
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /**
   * Formats a date string as date-only (no time) for created/paid dates.
   */
  private formatDateShort(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  /**
   * Maps package status to transaction status.
   */
  private mapPackageStatusToTransactionStatus(status: PackageStatus): 'Draft' | 'Pending' | 'Notified' | 'Completed' | 'Collected' | 'Canceled' | 'In Transit' | 'Ready' {
    switch (status) {
      case PACKAGE_STATUS.DRAFT:
        return 'Draft';
      case PACKAGE_STATUS.COLLECTED:
        // A collected package at a collection point should be labelled
        // "Collected" in the orders/status column (not "Completed").
        return 'Collected';
      case PACKAGE_STATUS.DELIVERED:
        return 'Completed';
      case PACKAGE_STATUS.RETURNED:
        return 'Canceled';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'In Transit';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'Ready';
      case PACKAGE_STATUS.NOTIFIED:
        return 'Notified';
      case PACKAGE_STATUS.PENDING:
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

  // Date range filtering is disabled on the Orders page (handled elsewhere when needed)

  /** Handle sort change requests from the transaction table headers */
  onSortChange(event: { field: string }): void {
    const field = event.field;
    if (this.sortField() === field) {
      // Toggle direction
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      // Default to descending so newest appear first
      this.sortDirection.set('desc');
    }
    // Reset to first page when sorting changes
    this.currentPage.set(1);
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
   * Handle a duplicate-PO conflict from the create modal: the user opted to
   * view the existing order. Open the details panel for that package.
   */
  onViewDuplicatePackage(pkg: Package): void {
    this.createPackageModalOpen = false;
    this.selectedPackage.set(pkg);
    this.detailsPanelOpen.set(true);
    this.toastService.info(
      `Showing existing order ${pkg.reference} with the same PO number.`,
    );
  }

  /** Navigate to completed orders view */
  onViewCompleted(): void {
    this.router.navigate(['orders', 'completed']);
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

  // File system selection handler removed (filesystem view disabled)

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
        case PACKAGE_STATUS.DRAFT:
          // Option: support Draft -> Notified direct transition from the UI.
          // This will trigger the Edge Function to send the notification email
          // just like a normal status update.
          {
            const result = await this.packageService.updatePackage(pkg.id, { status: PACKAGE_STATUS.NOTIFIED });
            if (result.success) {
              this.toastService.success(`Package ${pkg.reference} status updated to Notified.`);
              this.onCloseDetailsPanel();
              await this.loadPackages();
            } else {
              this.toastService.error(result.error ?? 'Failed to update package status.');
            }
            return;
          }

        case PACKAGE_STATUS.PENDING:
        case PACKAGE_STATUS.NOTIFIED:
          // Driver picks up package — open the assign-driver modal so the
          // user can choose which driver gets the package. The actual
          // status change to `in_transit` happens after the modal is
          // submitted (see `onDriverAssigned`).
          this.packageAwaitingDriver.set(pkg);
          this.assignDriverModalOpen.set(true);
          return;

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

    if (status === PACKAGE_STATUS.IN_TRANSIT) {
      // Transitioning to in_transit always requires a driver assignment.
      this.packageAwaitingDriver.set(pkg);
      this.assignDriverModalOpen.set(true);
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
      [PACKAGE_STATUS.DRAFT]: 'Draft',
      [PACKAGE_STATUS.PENDING]: 'Pending',
      [PACKAGE_STATUS.NOTIFIED]: 'Notified',
      [PACKAGE_STATUS.IN_TRANSIT]: 'In Transit',
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 'Ready for Collection',
      [PACKAGE_STATUS.DELIVERED]: 'Delivered',
      [PACKAGE_STATUS.COLLECTED]: 'Collected',
      [PACKAGE_STATUS.RETURNED]: 'Canceled',
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
      // Generate a base64 POD PDF so the Edge Function can attach it to
      // the "Package Completed" email. Failure is non-fatal — we still
      // mark the package as collected without an attachment, but we
      // surface the underlying error so the user knows the email won't
      // include the POD document.
      const pdfResult = await generatePodPdfBase64(
        pkg,
        payload,
        this.appRef,
        this.environmentInjector,
      );
      if (!pdfResult.base64) {
        this.toastService.warning(
          `Could not generate POD PDF for ${pkg.reference}; the confirmation email will be sent without the POD attachment${
            pdfResult.error ? ` (${pdfResult.error})` : ''
          }.`,
        );
        console.error('[Orders] POD PDF generation failed:', pdfResult.error);
      }
      const podPayload: MarkCollectedPayload = pdfResult.base64
        ? {
            ...payload,
            pdf_base64: pdfResult.base64,
            pdf_filename: `POD-${pkg.reference}${pkg.po_number ? `-${pkg.po_number}` : ''}.pdf`,
          }
        : payload;

      const result = await this.packageService.updatePackage(pkg.id, {
        status: PACKAGE_STATUS.COLLECTED,
        pod: podPayload,
      });

      if (result.success) {
        const warning = result.data.pod_warning;
        if (warning) {
          // Status was updated, but the POD row was not persisted. This
          // typically means the `update-package` edge function is out of
          // date or the `pods` table is missing the receiver/witness
          // columns. Surface the underlying error so it can be acted on.
          this.toastService.warning(
            `Package ${pkg.reference} marked as collected, but the POD record was not saved: ${warning}`,
          );
          console.error('[Orders] POD persistence warning:', warning);
        } else {
          this.toastService.success(`Package ${pkg.reference} marked as collected.`);
        }
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
   * Close the assign-driver modal without submitting.
   */
  onCloseAssignDriverModal(): void {
    if (this.isAssigningDriver()) {
      return;
    }
    this.assignDriverModalOpen.set(false);
    this.packageAwaitingDriver.set(null);
  }

  /**
   * Handle driver-assignment confirmation: persist the chosen driver on
   * the package along with the `in_transit` status transition.
   */
  async onDriverAssigned(payload: AssignDriverPayload): Promise<void> {
    const pkg = this.packageAwaitingDriver();
    if (!pkg) {
      return;
    }

    this.isAssigningDriver.set(true);
    try {
      const result = await this.packageService.updatePackage(pkg.id, {
        status: PACKAGE_STATUS.IN_TRANSIT,
        driver_user_id: payload.driverUserId,
      });

      if (result.success) {
        this.toastService.success(
          `Package ${pkg.reference} assigned to ${payload.driverName} and marked in transit.`,
        );
        this.assignDriverModalOpen.set(false);
        this.packageAwaitingDriver.set(null);
        this.onCloseDetailsPanel();
        await this.loadPackages();
      } else {
        this.toastService.error(result.error ?? 'Failed to assign driver.');
      }
    } catch {
      this.toastService.error('An unexpected error occurred while assigning the driver.');
    } finally {
      this.isAssigningDriver.set(false);
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

  /**
   * Open the printable Proof-of-Delivery document for a package.
   */
  onViewPodDocument(pkg: Package): void {
    this.podDocumentPackage.set(pkg);
    this.podDocumentOpen.set(true);
  }

  /**
   * Close the POD document modal.
   */
  onClosePodDocument(): void {
    this.podDocumentOpen.set(false);
    this.podDocumentPackage.set(null);
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

