import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
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

export interface CreatePurchaseOrderLine {
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
}

export interface CreatePurchaseOrderRequest {
  readonly poNumber: string;
  readonly items: readonly CreatePurchaseOrderLine[];
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

  readonly isOpen = input(false);
  readonly closeModal = output<void>();
  readonly created = output<CreatePurchaseOrderRequest>();

  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    poNumber: this.fb.nonNullable.control('', [Validators.required, trimRequired]),
    items: this.fb.array<PurchaseOrderLineFormGroup>([], [Validators.required, Validators.minLength(1)]),
  });

  get itemsArray(): FormArray<PurchaseOrderLineFormGroup> {
    return this.form.controls.items;
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
      return field === 'inventoryItemId' ? 'Inventory item ID is required' : 'Ordered quantity is required';
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

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    this.errorMessage.set(null);

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
    });
  }

  onClose(): void {
    this.form.reset();
    this.itemsArray.clear();
    this.errorMessage.set(null);
    this.closeModal.emit();
  }
}
