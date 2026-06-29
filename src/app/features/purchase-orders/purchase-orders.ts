import {
  Component,
  OnInit,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerClipboardList,
  tablerSearch,
  tablerRefresh,
  tablerPackage,
  tablerBox,
  tablerChevronDown,
  tablerChevronUp,
  tablerExternalLink,
  tablerCheck,
  tablerClock,
  tablerFileInvoice,
  tablerAlertCircle,
  tablerFilter,
  tablerX,
  tablerShoppingCart,
  tablerArrowRight,
  tablerFileDownload,
  tablerUser,
  tablerCalendar,
  tablerCoin,
  tablerNotes,
  tablerFileZip,
} from '@ng-icons/tabler-icons';

import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { PurchaseOrderCrudService } from './services/purchase-order-crud.service';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderFilters,
  computeInventoryProgress,
} from './purchase-orders.models';
import { Package, PACKAGE_STATUS } from '../../core';
import { PodExportService } from '../pods/services/pod-export.service';
import { FileSaveService } from '../../shared/services/file-save.service';
import {
  CreatePurchaseOrderModalComponent,
  CreatePurchaseOrderRequest,
  EditPurchaseOrderModalComponent,
  PurchaseOrderEditFormValue,
  UpdatePurchaseOrderRequest,
} from '../../shared/components/modals';
import { ToastService } from '../../shared/components/toast';

@Component({
  selector: 'app-purchase-orders',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [PurchaseOrdersService, PurchaseOrderCrudService],
  imports: [
    CommonModule,
    FormsModule,
    LayoutComponent,
    NgIcon,
    CreatePurchaseOrderModalComponent,
    EditPurchaseOrderModalComponent,
  ],
  viewProviders: [
    provideIcons({
      tablerClipboardList,
      tablerSearch,
      tablerRefresh,
      tablerPackage,
      tablerBox,
      tablerChevronDown,
      tablerChevronUp,
      tablerExternalLink,
      tablerCheck,
      tablerClock,
      tablerFileInvoice,
      tablerAlertCircle,
      tablerFilter,
      tablerX,
      tablerShoppingCart,
      tablerArrowRight,
      tablerFileDownload,
      tablerUser,
      tablerCalendar,
      tablerCoin,
      tablerNotes,
      tablerFileZip,
    }),
  ],
  templateUrl: './purchase-orders.html',
  styleUrls: ['./purchase-orders.css'],
})
export class PurchaseOrdersComponent implements OnInit {
  private readonly service = inject(PurchaseOrdersService);
  private readonly purchaseOrderCrud = inject(PurchaseOrderCrudService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly podExport = inject(PodExportService);
  private readonly fileSave = inject(FileSaveService);

  /** Statuses that have a downloadable proof of delivery. */
  private static readonly POD_STATUSES: ReadonlySet<string> = new Set([
    PACKAGE_STATUS.DELIVERED,
    PACKAGE_STATUS.COLLECTED,
  ]);

  /** PO number whose PODs are currently being zipped/downloaded (null when idle). */
  readonly downloadingPodsPoNumber = signal<string | null>(null);

  // Exposed service state for the template
  readonly isLoading = this.service.isLoading;
  readonly error = this.service.error;
  readonly stats = this.service.stats;
  readonly filteredPOs = this.service.filteredPurchaseOrders;

  /** Set of PO numbers that are currently expanded */
  private readonly expandedPoNumbers = signal<Set<string>>(new Set());

  /** Current search term for the input (mirrors service filter) */
  searchTerm = '';

  /** Active status tab */
  activeStatusFilter = signal<PurchaseOrderFilters['status']>('all');
  readonly createPoModalOpen = signal(false);
  readonly isCreatingPo = signal(false);
  readonly editPoModalOpen = signal(false);
  readonly selectedPoForEdit = signal<PurchaseOrderEditFormValue | null>(null);
  readonly isUpdatingPo = signal(false);
  readonly isOpeningEditPo = signal(false);
  private editPoOpenRequestToken = 0;

  readonly statusTabs: Array<{ key: PurchaseOrderFilters['status']; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'in_progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'draft', label: 'Draft' },
    { key: 'mixed', label: 'Mixed' },
  ];

  async ngOnInit(): Promise<void> {
    await this.service.load();
  }

  // ============================================================================
  // Interaction helpers
  // ============================================================================

  isExpanded(poNumber: string): boolean {
    return this.expandedPoNumbers().has(poNumber);
  }

  toggleExpand(poNumber: string): void {
    this.expandedPoNumbers.update(set => {
      const next = new Set(set);
      if (next.has(poNumber)) {
        next.delete(poNumber);
      } else {
        next.add(poNumber);
      }
      return next;
    });
  }

  onSearch(value: string): void {
    this.searchTerm = value;
    this.service.setSearch(value);
  }

  onClearSearch(): void {
    this.searchTerm = '';
    this.service.setSearch('');
  }

  onStatusTabChange(status: PurchaseOrderFilters['status']): void {
    this.activeStatusFilter.set(status);
    this.service.setStatusFilter(status);
  }

  async onRefresh(): Promise<void> {
    await this.service.load();
  }

  onOpenCreatePo(): void {
    this.createPoModalOpen.set(true);
  }

  onCloseCreatePo(): void {
    if (this.isCreatingPo()) return;
    this.createPoModalOpen.set(false);
  }

  async onPurchaseOrderCreated(request: CreatePurchaseOrderRequest): Promise<void> {
    this.isCreatingPo.set(true);
    const result = await this.purchaseOrderCrud.createPurchaseOrder({
      poNumber: request.poNumber,
      items: request.items.map(item => ({
        inventoryItemId: item.inventoryItemId,
        orderedQuantity: item.orderedQuantity,
      })),
      receiverId: request.receiverId || null,
      poValue: request.poValue ?? null,
      poDate: request.poDate || null,
      details: request.details || null,
    });
    this.isCreatingPo.set(false);

    if (!result.success) {
      this.toastService.error(result.error ?? 'Failed to create purchase order.');
      return;
    }

    // Upload the PO document
    const purchaseOrderId = result.purchaseOrderId!;
    const uploadResult = await this.purchaseOrderCrud.uploadPODocument(purchaseOrderId, request.documentFile);
    if (!uploadResult.success) {
      this.toastService.warning(`Purchase order ${request.poNumber} created, but document upload failed: ${uploadResult.error ?? 'Unknown error'}`);
    }

    this.toastService.success(`Purchase order ${request.poNumber} created successfully.`);
    this.createPoModalOpen.set(false);
    await this.service.load();
  }

  canEdit(po: PurchaseOrder): boolean {
    return po.source === 'purchase_order' && po.derivedStatus !== 'completed';
  }

  async onOpenEditPo(po: PurchaseOrder): Promise<void> {
    if (!this.canEdit(po) || this.isOpeningEditPo()) return;

    const requestToken = ++this.editPoOpenRequestToken;
    this.isOpeningEditPo.set(true);

    try {
      const client = (this.purchaseOrderCrud as unknown as {
        supabase: {
          client: {
            from: (table: string) => {
              select: (query: string) => {
                eq: (column: string, value: string) => {
                  maybeSingle: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
                };
              };
            };
          };
        };
      }).supabase.client;

      const { data, error } = await client
        .from('purchase_orders')
        .select('id')
        .eq('po_number', po.poNumber)
        .maybeSingle();

      if (requestToken !== this.editPoOpenRequestToken) return;

      if (error) {
        this.toastService.error(error.message || 'Failed to load purchase order for editing.');
        return;
      }

      if (!data?.id) {
        this.toastService.error('Purchase order not found.');
        return;
      }

      const editResult = await this.purchaseOrderCrud.getPurchaseOrderForEdit(data.id);
      if (requestToken !== this.editPoOpenRequestToken) return;
      if (!editResult.success) {
        this.toastService.error(editResult.error || 'Failed to load purchase order for editing.');
        return;
      }

      this.selectedPoForEdit.set(editResult.data);
      this.editPoModalOpen.set(true);
    } catch {
      if (requestToken !== this.editPoOpenRequestToken) return;
      this.toastService.error('Failed to load purchase order for editing.');
    } finally {
      if (requestToken === this.editPoOpenRequestToken) {
        this.isOpeningEditPo.set(false);
      }
    }
  }

  onCloseEditPo(): void {
    if (this.isUpdatingPo()) return;
    this.closeEditPoModal();
  }

  private closeEditPoModal(): void {
    this.editPoModalOpen.set(false);
    this.selectedPoForEdit.set(null);
  }

  async onPurchaseOrderUpdated(request: UpdatePurchaseOrderRequest): Promise<void> {
    this.isUpdatingPo.set(true);
    try {
      const result = await this.purchaseOrderCrud.updatePurchaseOrder({
        purchaseOrderId: request.purchaseOrderId,
        poNumber: request.poNumber,
        items: request.items.map(item => ({
          purchaseOrderItemId: item.purchaseOrderItemId,
          orderedQuantity: item.orderedQuantity,
        })),
        receiverId: request.receiverId || null,
        poValue: request.poValue ?? null,
        poDate: request.poDate || null,
        details: request.details || null,
      });

      if (!result.success) {
        this.toastService.error(result.error ?? 'Failed to update purchase order.');
        return;
      }

      this.toastService.success(`Purchase order ${request.poNumber} updated successfully.`);
      this.closeEditPoModal();
      await this.service.load();
    } catch {
      this.toastService.error('Failed to update purchase order.');
    } finally {
      this.isUpdatingPo.set(false);
    }
  }

  /** Navigate to the Orders page pre-filtered to this PO */
  goToOrders(poNumber: string): void {
    this.router.navigate(['/orders'], { queryParams: { search: poNumber } });
  }

  /** Navigate to the Inventory page */
  goToInventory(): void {
    this.router.navigate(['/inventory']);
  }

  // ============================================================================
  // Display helpers
  // ============================================================================

  statusLabel(status: PurchaseOrderStatus): string {
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'draft': return 'Draft';
      case 'mixed': return 'Mixed';
    }
  }

  statusClass(status: PurchaseOrderStatus): string {
    switch (status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'draft':
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
      case 'mixed':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    }
  }

  packageStatusLabel(status: string): string {
    switch (status) {
      case PACKAGE_STATUS.DRAFT: return 'Draft';
      case PACKAGE_STATUS.PENDING: return 'Pending';
      case PACKAGE_STATUS.NOTIFIED: return 'Notified';
      case PACKAGE_STATUS.IN_TRANSIT: return 'In Transit';
      case PACKAGE_STATUS.READY_FOR_COLLECTION: return 'Ready';
      case PACKAGE_STATUS.DELIVERED: return 'Delivered';
      case PACKAGE_STATUS.COLLECTED: return 'Collected';
      case PACKAGE_STATUS.RETURNED: return 'Returned';
      default: return status;
    }
  }

  packageStatusClass(status: string): string {
    switch (status) {
      case PACKAGE_STATUS.DRAFT:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
      case PACKAGE_STATUS.PENDING:
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      case PACKAGE_STATUS.NOTIFIED:
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case PACKAGE_STATUS.IN_TRANSIT:
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case PACKAGE_STATUS.READY_FOR_COLLECTION:
        return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
      case PACKAGE_STATUS.DELIVERED:
      case PACKAGE_STATUS.COLLECTED:
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
      case PACKAGE_STATUS.RETURNED:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400';
    }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Format a `YYYY-MM-DD` PO date for display (no time component). */
  formatPoDate(date: string | null): string {
    if (!date) return '—';
    const parsed = new Date(`${date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return date;
    return parsed.toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  /** Format a ZAR monetary value, or a dash when absent. */
  formatCurrency(value: number | null): string {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
  }

  /**
   * Value delivered so far, priced from inventory unit prices:
   * Σ(delivered/collected quantity × inventory_items.unit_price) across the PO's
   * delivered orders. Only items with a known unit price contribute.
   */
  deliveredValue(po: PurchaseOrder): number {
    const priceByItemId = new Map<string, number>();
    for (const ref of po.inventoryRefs) {
      const price = ref.item?.unit_price;
      if (price !== null && price !== undefined && !Number.isNaN(price)) {
        priceByItemId.set(ref.inventoryItemId, price);
      }
    }

    let total = 0;
    for (const pkg of po.packages) {
      if (!PurchaseOrdersComponent.POD_STATUSES.has(pkg.status)) continue;
      for (const item of pkg.items ?? []) {
        const inventoryItemId = item.inventory_item_id;
        if (!inventoryItemId) continue;
        const price = priceByItemId.get(inventoryItemId);
        if (price === undefined) continue;
        total += (Number(item.quantity) || 0) * price;
      }
    }
    return total;
  }

  /** Delivered value as a percentage of the PO value (0–100, capped). */
  deliveredValuePercent(po: PurchaseOrder): number {
    const total = po.poValue ?? 0;
    const delivered = this.deliveredValue(po);
    if (total <= 0) return delivered > 0 ? 100 : 0;
    return Math.min(100, Math.round((delivered / total) * 100));
  }

  /** How close the delivered value is to the PO value, for color coding. */
  deliveredValueTone(po: PurchaseOrder): 'full' | 'partial' | 'none' {
    const total = po.poValue ?? 0;
    const delivered = this.deliveredValue(po);
    if (delivered <= 0) return 'none';
    if (delivered >= total) return 'full';
    return 'partial';
  }

  /** Short label describing the delivered-vs-PO-value state. */
  deliveredValueLabel(po: PurchaseOrder): string {
    switch (this.deliveredValueTone(po)) {
      case 'full': return 'Fully delivered';
      case 'partial': return 'Partially delivered';
      case 'none': return 'Not yet delivered';
    }
  }

  /** Text color classes keyed on how closely the delivered value matches the PO value. */
  deliveredValueTextClass(po: PurchaseOrder): string {
    switch (this.deliveredValueTone(po)) {
      case 'full': return 'text-emerald-700 dark:text-emerald-400';
      case 'partial': return 'text-amber-700 dark:text-amber-400';
      case 'none': return 'text-gray-500 dark:text-gray-400';
    }
  }

  /** Progress-bar fill classes keyed on how closely the delivered value matches the PO value. */
  deliveredValueBarClass(po: PurchaseOrder): string {
    switch (this.deliveredValueTone(po)) {
      case 'full': return 'bg-emerald-500';
      case 'partial': return 'bg-amber-500';
      case 'none': return 'bg-gray-300 dark:bg-gray-600';
    }
  }

  showCompletion(po: PurchaseOrder): boolean {
    return po.source === 'purchase_order'
      ? po.inventoryRefs.length > 0 || po.totalItems > 0
      : po.packages.length > 0;
  }

  completionLabel(po: PurchaseOrder): string {
    return po.source === 'purchase_order' ? 'allocated' : 'complete';
  }

  inventoryProgress(po: PurchaseOrder) {
    return computeInventoryProgress(po.inventoryRefs);
  }

  // ============================================================================
  // Bulk POD download
  // ============================================================================

  /** Packages in this PO that have a downloadable POD (delivered / collected). */
  private podEligiblePackages(po: PurchaseOrder): Package[] {
    return po.packages.filter(pkg => PurchaseOrdersComponent.POD_STATUSES.has(pkg.status));
  }

  /** Count of completed orders in this PO that have a POD. */
  completedPodCount(po: PurchaseOrder): number {
    return this.podEligiblePackages(po).length;
  }

  isDownloadingPods(po: PurchaseOrder): boolean {
    return this.downloadingPodsPoNumber() === po.poNumber;
  }

  /** Enabled when at least one completed order has a POD to bundle. */
  canBulkDownloadPods(po: PurchaseOrder): boolean {
    return this.completedPodCount(po) > 0 && this.downloadingPodsPoNumber() === null;
  }

  /** Build a ZIP of every POD for the completed orders in this PO and download it. */
  async onBulkDownloadPods(po: PurchaseOrder): Promise<void> {
    if (!this.canBulkDownloadPods(po)) return;

    const packageIds = this.podEligiblePackages(po).map(pkg => pkg.id);
    if (packageIds.length === 0) return;

    this.downloadingPodsPoNumber.set(po.poNumber);
    try {
      const jobId = this.podExport.createExportJob(packageIds, { merge: false });
      const job = this.podExport.getJob(jobId);
      if (!job) {
        this.toastService.error('Failed to start POD download.');
        return;
      }

      const result = await job.promise;
      if (!result.success || !result.blob) {
        this.toastService.error(result.error ?? 'Failed to download PODs.');
        return;
      }

      await this.fileSave.saveBlob(result.blob, { suggestedName: `pods-${po.poNumber}.zip` });
      this.toastService.success(`Downloaded ${packageIds.length} PODs for ${po.poNumber}.`);
    } catch (err) {
      this.toastService.error(err instanceof Error ? err.message : 'Failed to download PODs.');
    } finally {
      this.downloadingPodsPoNumber.set(null);
    }
  }

  trackByPoNumber(_: number, po: PurchaseOrder): string {
    return po.poNumber;
  }

  trackByPackageId(_: number, pkg: Package): string {
    return pkg.id;
  }

  trackByInventoryId(_: number, ref: { inventoryItemId: string }): string {
    return ref.inventoryItemId;
  }
}
