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
} from '@ng-icons/tabler-icons';

import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { PurchaseOrderCrudService } from './services/purchase-order-crud.service';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderFilters,
} from './purchase-orders.models';
import { Package, PACKAGE_STATUS } from '../../core/models/package.models';
import {
  CreatePurchaseOrderModalComponent,
  CreatePurchaseOrderRequest,
} from '../../shared/components/modals';
import { ToastService } from '../../shared/components/toast/toast.service';

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
    });
    this.isCreatingPo.set(false);

    if (!result.success) {
      this.toastService.error(result.error ?? 'Failed to create purchase order.');
      return;
    }

    this.toastService.success(`Purchase order ${request.poNumber} created successfully.`);
    this.createPoModalOpen.set(false);
    await this.service.load();
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
