import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
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
import { InventoryItem, InventoryService, ReceiverProfile, ReceiverService } from '../../../../core';

export interface PurchaseOrderEditLineValue {
  readonly purchaseOrderItemId: string;
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
  readonly minAllowedQuantity: number;
}

export interface PurchaseOrderEditFormValue {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly items: readonly PurchaseOrderEditLineValue[];
  readonly receiverId: string | null;
  readonly poValue: number | null;
  readonly poDate: string | null;
  readonly details: string | null;
}

export interface UpdatePurchaseOrderLineValue {
  /** Empty for a brand-new line that is being added during the edit. */
  readonly purchaseOrderItemId: string;
  /** Set for new lines; carries the chosen inventory item. */
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
}

export interface UpdatePurchaseOrderRequest {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly items: readonly UpdatePurchaseOrderLineValue[];
  readonly receiverId: string;
  readonly poValue: number;
  readonly poDate: string;
  readonly details: string;
}

type PurchaseOrderEditLineFormGroup = FormGroup<{
  purchaseOrderItemId: FormControl<string>;
  inventoryItemId: FormControl<string>;
  minAllowedQuantity: FormControl<number>;
  orderedQuantity: FormControl<number>;
}>;

const trimRequired: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value;
  if (typeof value === 'string' && value.trim().length === 0) {
    return { required: true };
  }
  return null;
};

const minAllowedQuantityValidator = (minAllowedQuantity: number): ValidatorFn => {
  return (control: AbstractControl): ValidationErrors | null => {
    const value = Number(control.value);
    return Number.isFinite(value) && value >= minAllowedQuantity
      ? null
      : {
          minAllowedQuantity: {
            minAllowedQuantity,
            actual: value,
          },
        };
  };
};

@Component({
  selector: 'app-edit-purchase-order-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-purchase-order-modal.component.html',
  styleUrl: './edit-purchase-order-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EditPurchaseOrderModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly receiverService = inject(ReceiverService);
  private readonly inventoryService = inject(InventoryService);

  readonly isOpen = input(false);
  readonly purchaseOrder = input<PurchaseOrderEditFormValue | null>(null);

  readonly closeModal = output<void>();
  readonly updated = output<UpdatePurchaseOrderRequest>();

  readonly errorMessage = signal<string | null>(null);
  readonly inventoryItems = this.inventoryService.items;
  readonly inventorySearch = signal('');
  readonly customerSearch = signal('');

  /** Customers (receiver profiles) available for selection, sorted by name. */
  readonly customers = computed(() =>
    [...this.receiverService.receiverList()]
      .filter(receiver => receiver.is_active)
      .sort((a, b) =>
        `${a.name} ${a.surname}`.localeCompare(`${b.name} ${b.surname}`)
      )
  );

  /** Customers filtered by the type-ahead search (name, surname, email or phone). */
  readonly filteredCustomers = computed(() => {
    const search = this.customerSearch().trim().toLowerCase();
    const customers = this.customers();
    if (!search) return customers;
    return customers.filter(customer =>
      `${customer.name} ${customer.surname}`.toLowerCase().includes(search) ||
      customer.email.toLowerCase().includes(search) ||
      (customer.phone ?? '').toLowerCase().includes(search)
    );
  });

  /**
   * Lookup of customers by id, for resolving the selected customer's display label.
   * Built from the full receiver list so a prefilled but now-inactive customer still resolves.
   */
  private readonly customerDetails = computed(() => {
    const map = new Map<string, ReceiverProfile>();
    for (const customer of this.receiverService.receiverList()) {
      map.set(customer.id, customer);
    }
    return map;
  });

  /** IDs of inventory items already on the PO (existing lines + new lines). */
  private readonly selectedItemIds = computed(() => {
    return new Set(this.itemsArray.value.map(item => item.inventoryItemId).filter(Boolean));
  });

  /** Inventory items available to add, filtered by search and excluding those already on the PO. */
  readonly filteredInventoryItems = computed(() => {
    const search = this.inventorySearch().toLowerCase();
    const selected = this.selectedItemIds();

    return this.inventoryItems().filter(item => {
      if (selected.has(item.id)) return false;
      if (!search) return true;
      return (
        item.name.toLowerCase().includes(search) ||
        (item.sku ?? '').toLowerCase().includes(search) ||
        item.id.toLowerCase().includes(search)
      );
    });
  });

  /** Lookup of inventory item details by id, for display in form lines. */
  readonly itemDetails = computed(() => {
    const map = new Map<string, InventoryItem>();
    for (const item of this.inventoryItems()) {
      map.set(item.id, item);
    }
    return map;
  });

  readonly form = this.fb.nonNullable.group({
    poNumber: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    receiverId: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    poValue: this.fb.nonNullable.control<number | null>(null, [Validators.required, Validators.min(0)]),
    poDate: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    details: this.fb.nonNullable.control(''),
    items: this.fb.array<PurchaseOrderEditLineFormGroup>([], [Validators.required, Validators.minLength(1)]),
  });

  get itemsArray(): FormArray<PurchaseOrderEditLineFormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    effect(() => {
      const isOpen = this.isOpen();
      const purchaseOrder = this.purchaseOrder();
      if (!isOpen) {
        this.inventorySearch.set('');
        this.customerSearch.set('');
        return;
      }
      // Load customers + inventory so the dropdowns can resolve/add items
      this.receiverService.loadAllReceivers();
      this.inventoryService.loadItems();
      if (!purchaseOrder) return;
      this.prefillForm(purchaseOrder);
    });
  }

  /** True for a line that is being newly added (has no persisted PO item id yet). */
  isNewLine(index: number): boolean {
    return !this.itemsArray.at(index)?.controls.purchaseOrderItemId.value;
  }

  addLine(): void {
    this.itemsArray.push(
      this.fb.nonNullable.group({
        purchaseOrderItemId: this.fb.nonNullable.control(''),
        inventoryItemId: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
        minAllowedQuantity: this.fb.nonNullable.control(1),
        orderedQuantity: this.fb.nonNullable.control(1, [
          Validators.required,
          Validators.min(1),
          minAllowedQuantityValidator(1),
        ]),
      })
    );
    this.itemsArray.markAsDirty();
  }

  removeLine(index: number): void {
    if (index < 0 || index >= this.itemsArray.length) return;
    // Only newly-added lines can be removed; existing lines are preserved.
    if (!this.isNewLine(index)) return;
    this.itemsArray.removeAt(index);
    this.itemsArray.markAsTouched();
    this.itemsArray.updateValueAndValidity();
  }

  selectInventoryItem(itemId: string, lineIndex: number): void {
    this.itemsArray.at(lineIndex)?.controls.inventoryItemId.setValue(itemId);
    this.inventorySearch.set('');
  }

  selectCustomer(customerId: string): void {
    const control = this.form.controls.receiverId;
    control.setValue(customerId);
    control.markAsTouched();
    this.customerSearch.set('');
  }

  clearCustomer(): void {
    this.form.controls.receiverId.setValue('');
    this.customerSearch.set('');
  }

  getSelectedCustomerName(customerId: string): string {
    const customer = this.customerDetails().get(customerId);
    return customer ? `${customer.name} ${customer.surname}` : 'Unknown customer';
  }

  getSelectedCustomerEmail(customerId: string): string {
    return this.customerDetails().get(customerId)?.email ?? '';
  }

  getSelectedItemName(itemId: string): string {
    const item = this.itemDetails().get(itemId);
    if (item) return `${item.name}${item.sku ? ` (${item.sku})` : ''}`;
    return itemId || 'Unknown Item';
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

  getLineFieldError(
    index: number,
    field: 'orderedQuantity' | 'inventoryItemId' = 'orderedQuantity'
  ): string | null {
    const control = this.itemsArray.at(index)?.controls[field];
    if (!control || !control.touched || !control.errors) return null;

    if (field === 'inventoryItemId') {
      if (control.errors['required']) return 'Inventory item is required';
      return null;
    }

    if (control.errors['required']) return 'Ordered quantity is required';
    if (control.errors['minAllowedQuantity']) {
      const minAllowed = control.errors['minAllowedQuantity']['minAllowedQuantity'];
      return `Ordered quantity cannot be less than ${minAllowed}`;
    }
    if (control.errors['min']) return 'Ordered quantity must be at least 1';
    return null;
  }

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    this.errorMessage.set(null);

    if (this.form.invalid) {
      this.errorMessage.set('Please fix the errors in the form');
      return;
    }

    const current = this.purchaseOrder();
    if (!current) {
      this.errorMessage.set('Purchase order data is unavailable');
      return;
    }

    const value = this.form.getRawValue();
    this.updated.emit({
      purchaseOrderId: current.purchaseOrderId.trim(),
      poNumber: value.poNumber.trim(),
      items: value.items.map(item => ({
        purchaseOrderItemId: item.purchaseOrderItemId.trim(),
        inventoryItemId: item.inventoryItemId.trim(),
        orderedQuantity: Number(item.orderedQuantity),
      })),
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
    this.customerSearch.set('');
    this.closeModal.emit();
  }

  private prefillForm(purchaseOrder: PurchaseOrderEditFormValue): void {
    this.form.controls.poNumber.setValue(purchaseOrder.poNumber);
    this.form.controls.receiverId.setValue(purchaseOrder.receiverId ?? '');
    this.form.controls.poValue.setValue(purchaseOrder.poValue ?? null);
    this.form.controls.poDate.setValue(purchaseOrder.poDate ?? '');
    this.form.controls.details.setValue(purchaseOrder.details ?? '');

    const lineGroups = purchaseOrder.items.map(line => this.createLineFormGroup(line));
    this.form.setControl(
      'items',
      this.fb.array<PurchaseOrderEditLineFormGroup>(lineGroups, [Validators.required, Validators.minLength(1)])
    );

    this.form.markAsPristine();
    this.form.markAsUntouched();
    this.errorMessage.set(null);
  }

  private createLineFormGroup(line: PurchaseOrderEditLineValue): PurchaseOrderEditLineFormGroup {
    const minAllowedQuantity = Math.max(1, Number(line.minAllowedQuantity) || 1);

    return this.fb.nonNullable.group({
      purchaseOrderItemId: [line.purchaseOrderItemId],
      inventoryItemId: [line.inventoryItemId],
      minAllowedQuantity: [minAllowedQuantity],
      orderedQuantity: [line.orderedQuantity, [
        Validators.required,
        Validators.min(1),
        minAllowedQuantityValidator(minAllowedQuantity),
      ]],
    });
  }
}
