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
  tablerCurrencyDollar,
  tablerBox,
  tablerToggleRight,
  tablerToggleLeft,
} from '@ng-icons/tabler-icons';

import { LayoutComponent } from '../../shared/components/layout/layout.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { ToastService } from '../../shared/components/toast/toast.service';
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
    LayoutComponent,
    NgIcon,
    ConfirmDialogComponent,
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
      tablerCurrencyDollar,
      tablerBox,
      tablerToggleRight,
      tablerToggleLeft,
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
  readonly showInactive = signal(false);

  // Confirm delete dialog
  readonly confirmDeleteOpen = signal(false);
  readonly itemPendingDelete = signal<InventoryItem | null>(null);

  // =========================================================================
  // Computed filtered list
  // =========================================================================

  readonly filteredItems = computed(() => {
    const q = this.searchQuery().toLowerCase();
    const cat = this.filterCategory();
    const lowStock = this.filterLowStock();
    const outOfStock = this.filterOutOfStock();
    const showInactive = this.showInactive();

    return this.items().filter(item => {
      if (!showInactive && !item.is_active) return false;
      if (cat && item.category !== cat) return false;
      if (lowStock && !(item.quantity > 0 && item.quantity <= item.low_stock_threshold)) return false;
      if (outOfStock && item.quantity !== 0) return false;
      if (q) {
        const haystack = [item.name, item.sku ?? '', item.category ?? '', item.description ?? ''].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  readonly categories = computed(() => this.stats().categories);

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
  }

  onCategoryChange(event: Event): void {
    this.filterCategory.set((event.target as HTMLSelectElement).value);
  }

  onToggleLowStock(): void {
    this.filterLowStock.update(v => !v);
    if (this.filterLowStock()) this.filterOutOfStock.set(false);
  }

  onToggleOutOfStock(): void {
    this.filterOutOfStock.update(v => !v);
    if (this.filterOutOfStock()) this.filterLowStock.set(false);
  }

  onToggleShowInactive(): void {
    this.showInactive.update(v => !v);
  }

  async onRefresh(): Promise<void> {
    await this.inventoryService.loadItems();
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

  isOutOfStock(item: InventoryItem): boolean {
    return item.quantity === 0;
  }

  formatCurrency(value: number | null): string {
    if (value === null) return '—';
    return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
  }

  trackById(_index: number, item: InventoryItem): string {
    return item.id;
  }

  getDeleteMessage(): string {
    const item = this.itemPendingDelete();
    return item
      ? `Are you sure you want to permanently delete "${item.name}"? This cannot be undone.`
      : 'Are you sure you want to delete this item?';
  }
}
