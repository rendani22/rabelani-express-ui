import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
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
}

export interface UpdatePurchaseOrderLineValue {
  readonly purchaseOrderItemId: string;
  readonly orderedQuantity: number;
}

export interface UpdatePurchaseOrderRequest {
  readonly purchaseOrderId: string;
  readonly poNumber: string;
  readonly items: readonly UpdatePurchaseOrderLineValue[];
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

  readonly isOpen = input(false);
  readonly purchaseOrder = input<PurchaseOrderEditFormValue | null>(null);

  readonly closeModal = output<void>();
  readonly updated = output<UpdatePurchaseOrderRequest>();

  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    poNumber: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    items: this.fb.array<PurchaseOrderEditLineFormGroup>([], [Validators.required, Validators.minLength(1)]),
  });

  get itemsArray(): FormArray<PurchaseOrderEditLineFormGroup> {
    return this.form.controls.items;
  }

  constructor() {
    effect(() => {
      const isOpen = this.isOpen();
      const purchaseOrder = this.purchaseOrder();
      if (!isOpen || !purchaseOrder) return;
      this.prefillForm(purchaseOrder);
    });
  }

  getFieldError(fieldName: 'poNumber'): string | null {
    const control = this.form.controls[fieldName];
    if (!control.touched || !control.errors) return null;

    if (control.errors['required']) return 'PO number is required';
    return null;
  }

  getLineFieldError(index: number): string | null {
    const control = this.itemsArray.at(index)?.controls.orderedQuantity;
    if (!control || !control.touched || !control.errors) return null;

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
        orderedQuantity: Number(item.orderedQuantity),
      })),
    });
  }

  onClose(): void {
    this.form.reset();
    this.itemsArray.clear();
    this.errorMessage.set(null);
    this.closeModal.emit();
  }

  private prefillForm(purchaseOrder: PurchaseOrderEditFormValue): void {
    this.form.controls.poNumber.setValue(purchaseOrder.poNumber);

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
