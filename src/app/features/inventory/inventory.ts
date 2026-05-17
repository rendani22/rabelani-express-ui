import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
  AbstractControl,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerPackage,
  tablerPlus,
  tablerEdit,
  tablerTrash,
  tablerCheck,
  tablerX,
  tablerSearch,
  tablerRefresh,
  tablerAlertTriangle,
  tablerTrendingDown,
  tablerTrendingUp,
  tablerCurrencyDollar,
  tablerBox,
  tablerToggleRight,
  tablerToggleLeft,
  tablerClock,
  tablerHistory,
  tablerChevronLeft,
  tablerChevronRight,
} from '@ng-icons/tabler-icons';

import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../shared/components/toast';
import { MovementHistoryPanelComponent } from './components/movement-history-panel/movement-history-panel';
import { RestockModalComponent } from './components/restock-modal/restock-modal';
import {
  InventoryService,
  InventoryItem,
  CreateInventoryItemDto,
  UpdateInventoryItemDto,
} from '../../core';

@Component({
  selector: 'app-inventory',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    LayoutComponent,
    NgIcon,
    ConfirmDialogComponent,
    MovementHistoryPanelComponent,
    RestockModalComponent,
  ],
  viewProviders: [
    provideIcons({
      tablerPackage,
      tablerPlus,
      tablerEdit,
      tablerTrash,
      tablerCheck,
      tablerX,
      tablerSearch,
      tablerRefresh,
      tablerAlertTriangle,
      tablerTrendingDown,
      tablerTrendingUp,
      tablerCurrencyDollar,
      tablerBox,
      tablerToggleRight,
      tablerToggleLeft,
      tablerClock,
      tablerHistory,
      tablerChevronLeft,
      tablerChevronRight,
    }),
  ],
  templateUrl: './inventory.html',
  styleUrl: './inventory.css',
})
export class InventoryComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly toastService = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  // =========================================================================
  // Service state
  // =========================================================================

  readonly items = this.inventoryService.items;
  readonly loading = this.inventoryService.loading;
  readonly stats = this.inventoryService.stats;

  // =========================================================================
  // UI state
  // =========================================================================

  readonly showAddForm = signal(false);
  readonly editingId = signal<string | null>(null);
  readonly searchQuery = signal('');
  readonly filterCategory = signal('');
  readonly filterLowStock = signal(false);
  readonly filterOutOfStock = signal(false);
  readonly filterBackordered = signal(false);
  readonly filterStaleStock = signal(false);
  readonly showInactive = signal(false);

  // Banner dismissal flags
  readonly outOfStockBannerDismissed = signal(false);
  readonly lowStockBannerDismissed = signal(false);
  readonly staleStockBannerDismissed = signal(false);

  // Confirm delete dialog (single item)
  readonly confirmDeleteOpen = signal(false);
  readonly itemPendingDelete = signal<InventoryItem | null>(null);

  // Confirm bulk delete dialog
  readonly confirmBulkDeleteOpen = signal(false);

  // Movement history panel
  readonly historyPanelOpen = signal(false);
  readonly historyPanelItem = signal<InventoryItem | null>(null);

  // Restock modal
  readonly restockOpen = signal(false);
  readonly restockItem = signal<InventoryItem | null>(null);

  // Row selection (bulk actions)
  readonly selectedIds = signal<ReadonlySet<string>>(new Set<string>());
  readonly selectedCount = computed(() => this.selectedIds().size);

  // =========================================================================
  // Pagination
  // =========================================================================

  readonly pageSizeOptions = [5, 10, 25, 50, 100] as const;
  readonly pageSize = signal<number>(5);
  readonly currentPage = signal<number>(1);

  // =========================================================================
  // Computed filtered list
  // =========================================================================

  readonly filteredItems = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const cat = this.filterCategory();
    const lowStock = this.filterLowStock();
    const outOfStock = this.filterOutOfStock();
    const backordered = this.filterBackordered();
    const staleStock = this.filterStaleStock();
    const showInactive = this.showInactive();

    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

    return this.items().filter(item => {
      if (!showInactive && !item.is_active) return false;
      if (cat && item.category !== cat) return false;
      if (lowStock && !(item.quantity > 0 && item.quantity <= item.low_stock_threshold)) return false;
      if (outOfStock && item.quantity !== 0) return false;
      if (backordered && item.quantity >= 0) return false;
      if (staleStock && !(item.quantity > 0 && new Date(item.updated_at) < twoMonthsAgo)) return false;
      if (q) {
        const haystack = [item.name, item.sku ?? '', item.category ?? '', item.description ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  readonly categories = computed(() => this.stats().categories);

  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredItems().length / this.pageSize()))
  );

  readonly pagedItems = computed(() => {
    const all = this.filteredItems();
    const size = this.pageSize();
    const page = Math.min(Math.max(1, this.currentPage()), Math.max(1, Math.ceil(all.length / size)));
    const start = (page - 1) * size;
    return all.slice(start, start + size);
  });

  readonly pageRangeStart = computed(() =>
    this.filteredItems().length === 0 ? 0 : (this.currentPage() - 1) * this.pageSize() + 1
  );

  readonly pageRangeEnd = computed(() =>
    Math.min(this.currentPage() * this.pageSize(), this.filteredItems().length)
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
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  });

  /** True if every item on the current page is selected (and page is non-empty). */
  readonly isAllVisibleSelected = computed(() => {
    const visible = this.pagedItems();
    if (visible.length === 0) return false;
    const sel = this.selectedIds();
    return visible.every(i => sel.has(i.id));
  });

  // =========================================================================
  // Forms
  // =========================================================================

  readonly addForm = this.fb.nonNullable.group({
    name:                ['', [Validators.required, Validators.minLength(2)]],
    sku:                 [''],
    category:            [''],
    unit:                ['pieces', Validators.required],
    quantity:            [0, [Validators.required, Validators.min(0)]],
    low_stock_threshold: [10, [Validators.required, Validators.min(0)]],
    unit_price:          [null as number | null],
    description:         [''],
  });

  readonly editForm = this.fb.nonNullable.group({
    name:                ['', [Validators.required, Validators.minLength(2)]],
    sku:                 [''],
    category:            [''],
    unit:                ['pieces', Validators.required],
    quantity:            [0, [Validators.required, Validators.min(0)]],
    low_stock_threshold: [10, [Validators.required, Validators.min(0)]],
    unit_price:          [null as number | null],
    description:         [''],
  });

  // =========================================================================
  // Lifecycle
  // =========================================================================

  ngOnInit(): void {
    void this.inventoryService.loadItems();
  }

  // =========================================================================
  // Add
  // =========================================================================

  onShowAddForm(): void {
    this.addForm.reset({ unit: 'pieces', quantity: 0, low_stock_threshold: 10, unit_price: null });
    this.showAddForm.set(true);
    this.editingId.set(null);
  }

  onCancelAdd(): void {
    this.showAddForm.set(false);
    this.addForm.reset();
  }

  async onSubmitAdd(): Promise<void> {
    this.addForm.markAllAsTouched();
    if (this.addForm.invalid) return;

    const v = this.addForm.getRawValue();
    const dto: CreateInventoryItemDto = {
      name: v.name,
      sku: v.sku || null,
      category: v.category || null,
      unit: v.unit,
      quantity: v.quantity,
      low_stock_threshold: v.low_stock_threshold,
      unit_price: v.unit_price ?? null,
      description: v.description || null,
    };

    const result = await this.inventoryService.createItem(dto);
    if (result.success) {
      this.toastService.success(`"${result.data.name}" added to inventory.`);
      this.onCancelAdd();
    } else {
      this.toastService.error(result.error);
    }
  }

  // =========================================================================
  // Edit
  // =========================================================================

  onStartEdit(item: InventoryItem): void {
    this.editingId.set(item.id);
    this.showAddForm.set(false);
    this.editForm.patchValue({
      name: item.name,
      sku: item.sku ?? '',
      category: item.category ?? '',
      unit: item.unit,
      quantity: item.quantity,
      low_stock_threshold: item.low_stock_threshold,
      unit_price: item.unit_price,
      description: item.description ?? '',
    });
  }

  onCancelEdit(): void {
    this.editingId.set(null);
    this.editForm.reset();
  }

  async onSubmitEdit(item: InventoryItem): Promise<void> {
    this.editForm.markAllAsTouched();
    if (this.editForm.invalid) return;

    const v = this.editForm.getRawValue();
    const dto: UpdateInventoryItemDto = {
      name: v.name,
      sku: v.sku || null,
      category: v.category || null,
      unit: v.unit,
      quantity: v.quantity,
      low_stock_threshold: v.low_stock_threshold,
      unit_price: v.unit_price ?? null,
      description: v.description || null,
    };

    const result = await this.inventoryService.updateItem(item.id, dto);
    if (result.success) {
      this.toastService.success(`"${result.data.name}" updated.`);
      this.onCancelEdit();
    } else {
      this.toastService.error(result.error);
    }
  }

  // =========================================================================
  // Toggle active
  // =========================================================================

  async onToggleActive(item: InventoryItem): Promise<void> {
    const result = await this.inventoryService.toggleActive(item);
    if (result.success) {
      this.toastService.success(
        result.data.is_active ? `"${item.name}" reactivated.` : `"${item.name}" deactivated.`
      );
    } else {
      this.toastService.error(result.error);
    }
  }

  // =========================================================================
  // Delete
  // =========================================================================

  onDeleteRequest(item: InventoryItem): void {
    this.itemPendingDelete.set(item);
    this.confirmDeleteOpen.set(true);
  }

  async onConfirmDelete(): Promise<void> {
    this.confirmDeleteOpen.set(false);
    const item = this.itemPendingDelete();
    this.itemPendingDelete.set(null);
    if (!item) return;

    const result = await this.inventoryService.deleteItem(item.id);
    if (result.success) {
      this.toastService.success(`"${item.name}" deleted.`);
    } else {
      this.toastService.error(result.error);
    }
  }

  onCancelDelete(): void {
    this.confirmDeleteOpen.set(false);
    this.itemPendingDelete.set(null);
  }

  // =========================================================================
  // Search / Filter
  // =========================================================================

  onSearchChange(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  onCategoryChange(event: Event): void {
    this.filterCategory.set((event.target as HTMLSelectElement).value);
    this.currentPage.set(1);
  }

  onToggleLowStock(): void {
    this.filterLowStock.update(v => !v);
    if (this.filterLowStock()) {
      this.filterOutOfStock.set(false);
      this.filterStaleStock.set(false);
    }
    this.currentPage.set(1);
  }

  onToggleOutOfStock(): void {
    this.filterOutOfStock.update(v => !v);
    if (this.filterOutOfStock()) {
      this.filterLowStock.set(false);
      this.filterStaleStock.set(false);
    }
    this.currentPage.set(1);
  }

  onToggleBackordered(): void {
    this.filterBackordered.update(v => !v);
    if (this.filterBackordered()) {
      this.filterLowStock.set(false);
      this.filterOutOfStock.set(false);
      this.filterStaleStock.set(false);
    }
    this.currentPage.set(1);
  }

  onToggleStaleStock(): void {
    this.filterStaleStock.update(v => !v);
    if (this.filterStaleStock()) {
      this.filterLowStock.set(false);
      this.filterOutOfStock.set(false);
    }
    this.currentPage.set(1);
  }

  onToggleShowInactive(): void {
    this.showInactive.update(v => !v);
    this.currentPage.set(1);
  }

  async onRefresh(): Promise<void> {
    await this.inventoryService.loadItems();
  }

  // =========================================================================
  // Movement history panel
  // =========================================================================

  onOpenHistory(item: InventoryItem): void {
    this.historyPanelItem.set(item);
    this.historyPanelOpen.set(true);
  }

  onCloseHistory(): void {
    this.historyPanelOpen.set(false);
    this.historyPanelItem.set(null);
  }

  // =========================================================================
  // Restock
  // =========================================================================

  onOpenRestock(item: InventoryItem): void {
    this.restockItem.set(item);
    this.restockOpen.set(true);
  }

  onCloseRestock(): void {
    this.restockOpen.set(false);
    this.restockItem.set(null);
  }

  async onConfirmRestock(event: { quantity: number; note: string | null }): Promise<void> {
    const item = this.restockItem();
    if (!item) return;

    const result = await this.inventoryService.restock(item.id, event.quantity, event.note);
    if (result.success) {
      this.toastService.success(`Added ${event.quantity} ${item.unit} to "${item.name}".`);
      this.onCloseRestock();
    } else {
      this.toastService.error(result.error);
    }
  }

  // =========================================================================
  // Banner dismissal
  // =========================================================================

  onDismissOutOfStockBanner(): void { this.outOfStockBannerDismissed.set(true); }
  onDismissLowStockBanner(): void { this.lowStockBannerDismissed.set(true); }
  onDismissStaleStockBanner(): void { this.staleStockBannerDismissed.set(true); }

  // =========================================================================
  // Bulk actions
  // =========================================================================

  isRowSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  onToggleRow(id: string): void {
    const next = new Set(this.selectedIds());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.selectedIds.set(next);
  }

  onToggleSelectAllVisible(): void {
    const visible = this.pagedItems();
    const next = new Set(this.selectedIds());
    if (this.isAllVisibleSelected()) {
      visible.forEach(i => next.delete(i.id));
    } else {
      visible.forEach(i => next.add(i.id));
    }
    this.selectedIds.set(next);
  }

  clearSelection(): void {
    this.selectedIds.set(new Set<string>());
  }

  async onBulkDeactivate(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    const result = await this.inventoryService.bulkToggleActive(ids, false);
    if (result.success) {
      this.toastService.success(`Deactivated ${ids.length} item(s).`);
      this.clearSelection();
    } else {
      this.toastService.error(result.error);
    }
  }

  async onBulkActivate(): Promise<void> {
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    const result = await this.inventoryService.bulkToggleActive(ids, true);
    if (result.success) {
      this.toastService.success(`Activated ${ids.length} item(s).`);
      this.clearSelection();
    } else {
      this.toastService.error(result.error);
    }
  }

  onBulkDeleteRequest(): void {
    if (this.selectedIds().size === 0) return;
    this.confirmBulkDeleteOpen.set(true);
  }

  async onConfirmBulkDelete(): Promise<void> {
    this.confirmBulkDeleteOpen.set(false);
    const ids = Array.from(this.selectedIds());
    if (ids.length === 0) return;

    const result = await this.inventoryService.bulkDelete(ids);
    if (result.success) {
      this.toastService.success(`Deleted ${ids.length} item(s).`);
      this.clearSelection();
    } else {
      this.toastService.error(result.error);
    }
  }

  onCancelBulkDelete(): void {
    this.confirmBulkDeleteOpen.set(false);
  }

  getBulkDeleteMessage(): string {
    const n = this.selectedIds().size;
    return `Permanently delete ${n} item${n === 1 ? '' : 's'}? This cannot be undone.`;
  }

  // =========================================================================
  // Helpers
  // =========================================================================

  getAddFieldError(field: string): string | null {
    return this.getFormFieldError(this.addForm, field);
  }

  getEditFieldError(field: string): string | null {
    return this.getFormFieldError(this.editForm, field);
  }

  private getFormFieldError(
    form: { get(field: string): AbstractControl | null },
    field: string
  ): string | null {
    const ctrl = form.get(field);
    if (!ctrl || !ctrl.touched || !ctrl.errors) return null;
    if (ctrl.errors?.['required']) return 'This field is required.';
    if (ctrl.errors?.['minlength']) return `Must be at least ${ctrl.errors['minlength'].requiredLength} characters.`;
    if (ctrl.errors?.['min']) return `Must be ${ctrl.errors['min'].min} or greater.`;
    return null;
  }

  isLowStock(item: InventoryItem): boolean {
    return item.quantity > 0 && item.quantity <= item.low_stock_threshold;
  }

  /** True when quantity is negative (backordered) */
  isBackordered(item: InventoryItem): boolean {
    return item.quantity < 0;
  }

  isOutOfStock(item: InventoryItem): boolean {
    return item.quantity === 0;
  }

  isStaleStock(item: InventoryItem): boolean {
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    return item.quantity > 0 && new Date(item.updated_at) < twoMonthsAgo;
  }

  formatCurrency(value: number | null): string {
    if (value === null) return '—';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
  }

  trackById = (_index: number, item: InventoryItem): string => item.id;

  // =========================================================================
  // Pagination controls
  // =========================================================================

  goToPage(page: number): void {
    const clamped = Math.min(Math.max(1, page), this.totalPages());
    this.currentPage.set(clamped);
  }

  prevPage(): void {
    this.goToPage(this.currentPage() - 1);
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  onPageSizeChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value);
    if (Number.isFinite(value) && value > 0) {
      this.pageSize.set(value);
      this.currentPage.set(1);
    }
  }

  getDeleteMessage(): string {
    const item = this.itemPendingDelete();
    return item
      ? `Are you sure you want to permanently delete "${item.name}"? This cannot be undone.`
      : 'Are you sure you want to delete this item?';
  }
}
