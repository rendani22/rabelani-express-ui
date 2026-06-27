import { ChangeDetectionStrategy, Component, inject, input, output, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { InventoryService, InventoryItem } from '../../../../core';

export interface CreatePurchaseOrderLine {
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
}

export interface CreatePurchaseOrderRequest {
  readonly poNumber: string;
  readonly items: readonly CreatePurchaseOrderLine[];
  readonly documentFile: File;
}

type PurchaseOrderLineFormGroup = FormGroup<{
  inventoryItemId: FormControl<string>;
  orderedQuantity: FormControl<number>;
}>;

const trimRequired: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (typeof value === 'string' && value.trim().length === 0) {
    return { required: true };
  }
  return null;
};

@Component({
  selector: 'app-create-purchase-order-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-purchase-order-modal.component.html',
  styleUrl: './create-purchase-order-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePurchaseOrderModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly inventoryService = inject(InventoryService);

  readonly isOpen = input(false);
  readonly closeModal = output<void>();
  readonly created = output<CreatePurchaseOrderRequest>();

  readonly errorMessage = signal<string | null>(null);
  readonly inventoryItems = this.inventoryService.items;
  readonly inventorySearch = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    poNumber: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    items: this.fb.array<PurchaseOrderLineFormGroup>([], [Validators.required, Validators.minLength(1)]),
  });

  get itemsArray(): FormArray<PurchaseOrderLineFormGroup> {
    return this.form.controls.items;
  }

  /** IDs of inventory items already selected in the PO */
  private readonly selectedItemIds = computed(() => {
    return new Set(this.itemsArray.value.map(item => item.inventoryItemId).filter(Boolean));
  });

  /** Filtered inventory items based on search + excluding already-selected items */
  readonly filteredInventoryItems = computed(() => {
    const search = this.inventorySearch().toLowerCase();
    const selected = this.selectedItemIds();

    return this.inventoryItems().filter(item => {
      // Exclude already-selected items
      if (selected.has(item.id)) return false;

      // Filter by search
      if (!search) return true;
      const needle = search;
      return (
        item.name.toLowerCase().includes(needle) ||
        (item.sku ?? '').toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle)
      );
    });
  });

  /** Track selected item details for display in form lines */
  readonly itemDetails = computed(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of this.inventoryItems()) {
      map.set(item.id, item);
    }
    return map;
  });

  constructor() {
    effect(() => {
      if (this.isOpen()) {
        // Load inventory items each time the modal opens so the list is fresh
        this.inventoryService.loadItems();
      } else {
        // Reset search when modal closes
        this.inventorySearch.set('');
      }
    });
  }

  addLine(): void {
    this.itemsArray.push(
      this.fb.nonNullable.group({
        inventoryItemId: ['', [Validators.required, trimRequired]],
        orderedQuantity: [1, [Validators.required, Validators.min(1)]],
      })
    );
    this.itemsArray.markAsDirty();
  }

  removeLine(index: number): void {
    if (index < 0 || index >= this.itemsArray.length) return;
    this.itemsArray.removeAt(index);
    this.itemsArray.markAsTouched();
    this.itemsArray.updateValueAndValidity();
  }

  selectInventoryItem(itemId: string, lineIndex: number): void {
    const line = this.itemsArray.at(lineIndex);
    if (line) {
      line.get('inventoryItemId')?.setValue(itemId);
      this.inventorySearch.set('');
    }
  }

  getFieldError(fieldName: 'poNumber'): string | null {
    const control = this.form.controls[fieldName];
    if (!control.touched || !control.errors) return null;

    if (control.errors['required']) return 'PO number is required';
    return null;
  }

  getLineFieldError(index: number, field: 'inventoryItemId' | 'orderedQuantity'): string | null {
    const line = this.itemsArray.at(index);
    if (!line) return null;

    const control = line.controls[field];
    if (!control.touched || !control.errors) return null;

    if (control.errors['required']) {
      return field === 'inventoryItemId' ? 'Inventory item is required' : 'Ordered quantity is required';
    }
    if (control.errors['min']) return 'Ordered quantity must be at least 1';
    return null;
  }

  getItemsArrayError(): string | null {
    const control = this.form.controls.items;
    if (!control.touched || !control.errors) return null;

    if (control.errors['required'] || control.errors['minlength']) {
      return 'At least one PO line is required';
    }

    return null;
  }

  getSelectedItemName(itemId: string): string {
    const item = this.itemDetails().get(itemId);
    return item ? `${item.name}${item.sku ? ` (${item.sku})` : ''}` : 'Unknown Item';
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.selectedFile.set(file);
    this.fileError.set(null);
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.fileError.set(null);
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    this.errorMessage.set(null);

    if (!this.selectedFile()) {
      this.fileError.set('PO document is required');
      this.errorMessage.set('Please fix the errors in the form');
      return;
    }

    if (this.form.invalid) {
      this.errorMessage.set('Please fix the errors in the form');
      return;
    }

    const value = this.form.getRawValue();
    this.created.emit({
      poNumber: value.poNumber.trim(),
      items: value.items.map((item) => ({
        inventoryItemId: item.inventoryItemId.trim(),
        orderedQuantity: item.orderedQuantity,
      })),
      documentFile: this.selectedFile()!,
    });
  }

  onClose(): void {
    this.form.reset();
    this.itemsArray.clear();
    this.errorMessage.set(null);
    this.inventorySearch.set('');
    this.selectedFile.set(null);
    this.fileError.set(null);
    this.closeModal.emit();
  }
}
