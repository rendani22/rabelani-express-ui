import { ApplicationRef, ChangeDetectionStrategy, Component, EnvironmentInjector, OnInit, inject, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { TransactionTableComponent, Transaction } from '../../shared/components/transaction/transaction-table/transaction-table.component';
import { OrdersActionsComponent } from './orders-actions/orders-actions.component';
import { PackageService, Package, PACKAGE_STATUS, PackageStatus, PackageFilters, SettingsService, MarkCollectedPayload, ReceiverProfile, generatePodPdfBase64, OnboardingTourService } from '../../core';
import { CreatePackageModalComponent, PackageDetailsPanelComponent, MarkCollectedModalComponent, PodDocumentComponent, AssignDriverModalComponent, AssignDriverPayload } from '../../shared/components/modals';
import { QrCodeComponent } from '../../shared/components/qr-code';
// ...existing imports...
import { ToastService } from '../../shared/components/toast/toast.service';
import { SupabaseService } from '../../shared/services/supabase.service';

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
    QrCodeComponent,
  ],
  templateUrl: './orders.html',
  styleUrls: ['./orders.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class OrdersComponent implements OnInit {
  private readonly packageService = inject(PackageService);
  private readonly settingsService = inject(SettingsService);
  private readonly toastService = inject(ToastService);
  private readonly supabaseService = inject(SupabaseService);
  private readonly appRef = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly onboardingTour = inject(OnboardingTourService);
  private readonly router = inject(Router);

  /** Map of receiver email (lowercased) → full name for quick lookup. */
  private readonly receiverNamesByEmail = signal<Map<string, string>>(new Map());

  /**
   * Memoised cache of Package.id → Transaction. Mapping is only re-run for
   * packages whose `updated_at` (or display name) actually changed, which
   * avoids re-allocating the entire transactions array every time a
   * signal upstream of the `transactions` computed fires.
   */
  private readonly txCache = new Map<string, { sig: string; tx: Transaction }>();

  /** Current search term — kept locally so it survives status filter changes. */
  private readonly searchTerm = signal<string>('');

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

  // Order deletion state
  isDeletingOrder = signal(false);

  /** Whether the currently signed-in account can manage deleted orders. */
  readonly canDeleteOrders = this.packageService.canDeleteOrders;

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
    const pkgs = this.packageService.packages();
    // Refresh dependency on the name map so display names stay in sync.
    this.receiverNamesByEmail();

    const txs = new Array<Transaction>(pkgs.length);
    const seen = new Set<string>();
    for (let i = 0; i < pkgs.length; i++) {
      txs[i] = this.getOrBuildTransaction(pkgs[i]);
      seen.add(pkgs[i].id);
    }
    // Evict cached transactions for packages no longer in the list.
    if (this.txCache.size > seen.size) {
      for (const id of this.txCache.keys()) {
        if (!seen.has(id)) this.txCache.delete(id);
      }
    }

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

  readonly totalPages = computed(() => {
    const total = this.packageService.totalCount() ?? this.transactions().length;
    return Math.max(1, Math.ceil(total / this.pageSize()));
  });

  /**
   * Server-side pagination: `transactions()` already contains only the
   * current page of results, so we expose them directly instead of
   * slicing the full array client-side.
   */
  readonly pagedTransactions = computed<Transaction[]>(() => this.transactions());

  readonly pageRangeStart = computed(() => {
    const total = this.packageService.totalCount() ?? this.transactions().length;
    if (total === 0) {
      return 0;
    }
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  readonly pageRangeEnd = computed(() => {
    const total = this.packageService.totalCount() ?? this.transactions().length;
    return Math.min(this.currentPage() * this.pageSize(), total);
  });

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
    // Load packages first; receiver names are only used for display, so
    // fetch them in the background (and scoped to the loaded packages)
    // instead of pulling the entire `receiver_profiles` table.
    await this.loadPackages();
    void this.loadReceiversForCurrentPackages();
    // Auto-launch the orders onboarding tour for first-time users (no-op if
    // already completed). Delayed slightly so the table has rendered.
    setTimeout(() => this.onboardingTour.start('orders'), 700);
  }

  /**
   * Load receiver profiles whose email appears in the currently-loaded
   * packages and build an email → full name map. Scoped query avoids
   * fetching every receiver in the database just to resolve display names.
   */
  private async loadReceiversForCurrentPackages(): Promise<void> {
    const emails = new Set<string>();
    for (const p of this.packageService.packages()) {
      const e = (p.receiver_email ?? '').trim().toLowerCase();
      if (e) emails.add(e);
    }
    if (emails.size === 0) {
      this.receiverNamesByEmail.set(new Map());
      return;
    }

    try {
      const { data } = await this.supabaseService.client
        .from('receiver_profiles')
        .select('email,name,surname')
        .in('email', Array.from(emails));

      const map = new Map<string, string>();
      for (const r of (data ?? []) as ReceiverProfile[]) {
        const email = (r.email ?? '').trim().toLowerCase();
        if (!email) continue;
        const fullName = `${r.name ?? ''} ${r.surname ?? ''}`.trim();
        if (fullName) map.set(email, fullName);
      }
      // Invalidate the per-package transaction cache so display names refresh.
      this.txCache.clear();
      this.receiverNamesByEmail.set(map);
    } catch {
      // Non-fatal — fall back to formatted email local-parts.
    }
  }

  /**
   * Load packages from the service with optional filters.
   * Sends the active page + page size so pagination happens server-side.
   */
  async loadPackages(): Promise<void> {
    const status = this.statusFilter();
    const search = this.searchTerm().trim();
    const filters: PackageFilters = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      ...(status !== 'all' ? { status } : {}),
      ...(search ? { search } : {}),
    };
    await this.packageService.loadPackages(filters);
    // Refresh display-name map for the newly-loaded packages (background).
    void this.loadReceiversForCurrentPackages();
  }

  /**
   * Look up a previously-built Transaction for a package, or build and
   * cache one if the package is new or has changed since last render.
   */
  private getOrBuildTransaction(pkg: Package): Transaction {
    const email = (pkg.receiver_email ?? '').trim().toLowerCase();
    const displayName =
      this.receiverNamesByEmail().get(email) ||
      this.formatEmailLocalPart(pkg.receiver_email);

    // Cache key: signature changes only when something user-visible changes.
    const sig = `${pkg.updated_at ?? ''}|${pkg.created_at}|${pkg.status}|${displayName}|${pkg.po_number ?? ''}|${pkg.notes ?? ''}|${pkg.reference}`;
    const cached = this.txCache.get(pkg.id);
    if (cached && cached.sig === sig) return cached.tx;

    const tx: Transaction = {
      id: pkg.id,
      reference: pkg.reference,
      orderNumber: pkg.po_number ?? undefined,
      counterparty: displayName,
      counterpartyImage: this.getAvatarUrl(displayName),
      paymentDate: this.formatDateShort(pkg.created_at),
      paymentDateIso: pkg.created_at,
      lastUpdated: this.formatDate(pkg.updated_at ?? pkg.created_at),
      lastUpdatedIso: pkg.updated_at ?? pkg.created_at,
      status: this.mapPackageStatusToTransactionStatus(pkg.status),
      notes: pkg.notes || undefined,
    };
    this.txCache.set(pkg.id, { sig, tx });
    return tx;
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
   * Build a lightweight inline SVG avatar (initials on a deterministic
   * colour) as a `data:` URI. Avoids an external HTTP request per row,
   * which on a 100-row page was the dominant perf cost on first paint.
   */
  private getAvatarUrl(displayName: string): string {
    const safe = (displayName || 'Receiver').replace(/[^a-zA-Z ]/g, ' ').trim() || 'Receiver';
    const parts = safe.split(/\s+/).filter(Boolean);
    const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'R';

    // Deterministic colour from name (stable across renders).
    let hash = 0;
    for (let i = 0; i < safe.length; i++) hash = (hash * 31 + safe.charCodeAt(i)) | 0;
    const hue = Math.abs(hash) % 360;
    const bg = `hsl(${hue}, 60%, 55%)`;

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${bg}"/><text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-size="26" font-weight="600" fill="#fff">${initials}</text></svg>`;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
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
    this.searchTerm.set(searchTerm ?? '');
    this.currentPage.set(1);
    // `loadPackages()` now combines status + search filters so we don't
    // accidentally clear the active status when the user types.
    await this.loadPackages();
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

   /** Navigate to deleted orders view */
   onViewDeleted(): void {
     this.router.navigate(['orders', 'deleted']);
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
   * Handle delete-order request emitted from the details panel.
   * Deletes the package and returns any inventory-linked stock back to inventory.
   * Only permitted for accounts allowed by `PackageService.canDeleteOrders`.
   */
  async onDeleteOrder(pkg: Package): Promise<void> {
    if (this.isDeletingOrder()) return;
    this.isDeletingOrder.set(true);
    try {
      const result = await this.packageService.deletePackageWithInventoryReturn(pkg.id);

      if (result.success) {
        const returned = result.returnedItems ?? 0;
        const suffix = returned > 0
          ? ` Stock returned for ${returned} item${returned === 1 ? '' : 's'}.`
          : '';
        if (result.error) {
          // Package was soft-deleted but inventory return had a problem.
          this.toastService.warning(
            `Order ${pkg.reference} moved to deleted, but inventory could not be fully restored: ${result.error}`,
          );
        } else {
          this.toastService.success(
            `Order ${pkg.reference} moved to deleted.${suffix} Open Deleted orders to restore it.`,
          );
        }
        this.onCloseDetailsPanel();
        await this.loadPackages();
      } else {
        this.toastService.error(result.error ?? 'Failed to delete order.');
      }
    } catch {
      this.toastService.error('An unexpected error occurred while deleting the order.');
    } finally {
      this.isDeletingOrder.set(false);
    }
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
  async goToPage(page: number): Promise<void> {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    if (clamped === this.currentPage()) return;
    this.currentPage.set(clamped);
    await this.loadPackages();
  }

  /** Go to the previous page. */
  async prevPage(): Promise<void> {
    await this.goToPage(this.currentPage() - 1);
  }

  /** Go to the next page. */
  async nextPage(): Promise<void> {
    await this.goToPage(this.currentPage() + 1);
  }

  /** Change the page size and reset to the first page. */
  async onPageSizeChange(event: Event): Promise<void> {
    const value = Number((event.target as HTMLSelectElement).value);
    if (!Number.isNaN(value) && value > 0 && value !== this.pageSize()) {
      this.pageSize.set(value);
      this.currentPage.set(1);
      await this.loadPackages();
    }
  }
}

