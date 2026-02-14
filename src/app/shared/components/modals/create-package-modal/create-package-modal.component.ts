import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { timer } from 'rxjs';

import {
  CreatePackageRequest,
  Package,
  PackageItemFormValue,
  PackageItemRequest,
  PackageService,
} from '../../../../core';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 2000;

/** Email validation pattern */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal component for creating new packages.
 * Uses reactive forms and follows Angular best practices.
 */
@Component({
  selector: 'app-create-package-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './create-package-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreatePackageModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly packageService = inject(PackageService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the created package on success */
  readonly packageCreated = output<Package>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    receiverEmail: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    notes: [''],
    poNumber: [''],
    deliveryLocationId: [''],
    items: this.fb.array<FormGroup>([]),
  });

  /** Typed accessor for items FormArray */
  get itemsArray(): FormArray<FormGroup> {
    return this.form.controls.items;
  }

  // =========================================================================
  // UI State
  // =========================================================================

  /** Whether form submission is in progress */
  readonly isSubmitting = signal(false);

  /** Error message to display */
  readonly errorMessage = signal<string | null>(null);

  /** Success message to display */
  readonly successMessage = signal<string | null>(null);

  /** Loading state from service */
  readonly isLoading = this.packageService.isLoading;

  /** Form status as a signal (reacts to form validity changes) */
  private readonly formStatus = toSignal(this.form.statusChanges, {
    initialValue: this.form.status,
  });

  /** Whether submit button should be disabled */
  readonly isSubmitDisabled = computed(
    () => this.isSubmitting() || this.formStatus() !== 'VALID'
  );

  // =========================================================================
  // Lifecycle
  // =========================================================================

  constructor() {
    // Reset form when modal opens
    effect(() => {
      if (this.isOpen()) {
        this.resetForm();
      }
    });
  }

  // =========================================================================
  // Form Helpers
  // =========================================================================

  /**
   * Creates a new item form group
   */
  private createItemGroup(item?: PackageItemFormValue): FormGroup {
    return this.fb.group({
      quantity: [item?.quantity ?? 1, [Validators.required, Validators.min(1)]],
      description: [item?.description ?? '', Validators.required],
    });
  }

  /**
   * Adds a new item to the items array
   */
  addItem(): void {
    this.itemsArray.push(this.createItemGroup());
  }

  /**
   * Removes an item at the specified index
   */
  removeItem(index: number): void {
    this.itemsArray.removeAt(index);
  }

  /**
   * Resets the form to initial state
   */
  private resetForm(): void {
    this.form.reset();
    this.itemsArray.clear();
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  /**
   * Gets error message for a form control
   */
  getFieldError(fieldName: 'receiverEmail' | 'notes' | 'poNumber'): string | null {
    const control = this.form.controls[fieldName];
    if (!control.touched || control.valid) {
      return null;
    }

    if (control.hasError('required')) {
      return 'This field is required';
    }

    if (control.hasError('pattern')) {
      return 'Please enter a valid email address';
    }

    return null;
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Handles modal close action
   */
  onClose(): void {
    this.resetForm();
    this.closeModal.emit();
  }

  /**
   * Handles form submission
   */
  async onSubmit(): Promise<void> {
    // Mark all fields as touched to show validation errors
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    // Reset messages
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.isSubmitting.set(true);

    try {
      const request = this.buildRequest();
      const result = await this.packageService.createPackage(request);

      if (result.success) {
        this.handleSuccess(result.data.package);
      } else {
        this.errorMessage.set(result.error);
      }
    } catch {
      this.errorMessage.set('An unexpected error occurred');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  /**
   * Builds the API request from form values
   */
  private buildRequest(): CreatePackageRequest {
    const { receiverEmail, notes, poNumber, deliveryLocationId, items } =
      this.form.getRawValue();

    // Filter valid items and map to request format
    const validItems: PackageItemRequest[] = items
      .filter((item: Record<string, unknown>) => {
        const desc = item['description'] as string | undefined;
        const qty = item['quantity'] as number | undefined;
        return desc?.trim() && qty && qty > 0;
      })
      .map((item: Record<string, unknown>) => ({
        quantity: item['quantity'] as number,
        description: (item['description'] as string).trim(),
      }));

    // Build request object with all required and optional fields
    return {
      receiver_email: receiverEmail.trim().toLowerCase(),
      ...(notes?.trim() && { notes: notes.trim() }),
      ...(poNumber?.trim() && { po_number: poNumber.trim() }),
      ...(deliveryLocationId?.trim() && { delivery_location_id: deliveryLocationId.trim() }),
      ...(validItems.length > 0 && { items: validItems }),
    };
  }

  /**
   * Handles successful package creation
   */
  private handleSuccess(pkg: Package): void {
    this.successMessage.set(
      `Package created successfully! Reference: ${pkg.reference}`
    );
    this.packageCreated.emit(pkg);

    // Auto-close after delay
    timer(SUCCESS_CLOSE_DELAY_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.onClose());
  }
}




