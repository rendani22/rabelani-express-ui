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
import { InventoryService, InventoryItem, ReceiverService } from '../../../../core';

export interface CreatePurchaseOrderLine {
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
}

export interface CreatePurchaseOrderRequest {
  readonly poNumber: string;
  readonly items: readonly CreatePurchaseOrderLine[];
  readonly documentFile: File;
  /** Customer (receiver profile) the PO is raised for. */
  readonly receiverId: string;
  /** Monetary value of the PO in ZAR. */
  readonly poValue: number;
  /** PO date as an ISO `YYYY-MM-DD` string. */
  readonly poDate: string;
  /** Optional free-text details / notes. */
  readonly details: string;
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
  private readonly receiverService = inject(ReceiverService);

  readonly isOpen = input(false);
  readonly closeModal = output<void>();
  readonly created = output<CreatePurchaseOrderRequest>();

  readonly errorMessage = signal<string | null>(null);
  readonly inventoryItems = this.inventoryService.items;
  readonly inventorySearch = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly fileError = signal<string | null>(null);

  /** Customers (receiver profiles) available for selection, sorted by name. */
  readonly customers = computed(() =>
    [...this.receiverService.receiverList()]
      .filter(receiver => receiver.is_active)
      .sort((a, b) =>
        `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)
      )
  );

  /** Today's date as `YYYY-MM-DD`, used as the default PO date. */
  private readonly today = new Date().toISOString().slice(0, 10);

  readonly form = this.fb.nonNullable.group({
    poNumber: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    receiverId: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    poValue: this.fb.nonNullable.control<number | null>(null, [Validators.required, Validators.min(0)]),
    poDate: this.fb.nonNullable.control(this.today, [Validators.required, trimRequired]),
    details: this.fb.nonNullable.control(''),
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
        // Load inventory items + customers each time the modal opens so lists are fresh
        this.inventoryService.loadItems();
        this.receiverService.loadAllReceivers();
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

  getFieldError(fieldName: 'poNumber' | 'receiverId' | 'poValue' | 'poDate'): string | null {
    const control = this.form.controls[fieldName];
    if (!control.touched || !control.errors) return null;

    if (control.errors['required']) {
      switch (fieldName) {
        case 'poNumber': return 'PO number is required';
        case 'receiverId': return 'Please select a customer';
        case 'poValue': return 'PO value is required';
        case 'poDate': return 'PO date is required';
      }
    }
    if (control.errors['min']) return 'PO value cannot be negative';
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
      receiverId: value.receiverId.trim(),
      poValue: Number(value.poValue),
      poDate: value.poDate.trim(),
      details: value.details.trim(),
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
