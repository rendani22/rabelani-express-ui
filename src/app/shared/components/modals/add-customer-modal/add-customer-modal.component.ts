import {
  Component,
  inject,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { timer } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerUser,
  tablerMail,
  tablerPhone,
  tablerId,
  tablerUserPlus,
  tablerX
} from '@ng-icons/tabler-icons';

import { ReceiverService, ReceiverProfile, CreateReceiverProfileDto } from '../../../../core';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 2000;

/** Email validation pattern */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal component for creating new customer (receiver) profiles.
 * Uses reactive forms and follows Angular best practices.
 */
@Component({
  selector: 'app-add-customer-modal',
  standalone: true,
  imports: [ReactiveFormsModule, NgIcon],
  templateUrl: './add-customer-modal.component.html',
  styleUrl: './add-customer-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      tablerUser,
      tablerMail,
      tablerPhone,
      tablerId,
      tablerUserPlus,
      tablerX
    })
  ]
})
export class AddCustomerModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly receiverService = inject(ReceiverService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the created receiver profile on success */
  readonly customerCreated = output<ReceiverProfile>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    surname: ['', [Validators.required, Validators.minLength(2)]],
    employee_number: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    phone: [''],
  });

  // =========================================================================
  // UI State
  // =========================================================================

  /** Whether form submission is in progress */
  readonly isSubmitting = signal(false);

  /** Error message to display */
  readonly errorMessage = signal<string | null>(null);

  /** Success message to display */
  readonly successMessage = signal<string | null>(null);

  // =========================================================================
  // Form Field Error Handling
  // =========================================================================

  /**
   * Gets the error message for a specific form field.
   */
  getFieldError(fieldName: string): string | null {
    const control = this.form.get(fieldName);
    if (!control || !control.touched || !control.errors) {
      return null;
    }

    const errors = control.errors;
    if (errors['required']) {
      return this.getRequiredMessage(fieldName);
    }
    if (errors['pattern']) {
      return 'Please enter a valid email address';
    }
    if (errors['minlength']) {
      const minLength = errors['minlength'].requiredLength;
      return `Must be at least ${minLength} characters`;
    }
    return null;
  }

  /**
   * Gets the required field message.
   */
  private getRequiredMessage(fieldName: string): string {
    const messages: Record<string, string> = {
      name: 'First name is required',
      surname: 'Last name is required',
      employee_number: 'Employee number is required',
      email: 'Email is required',
    };
    return messages[fieldName] || 'This field is required';
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Handles form submission.
   */
  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.errorMessage.set('Please fix the errors in the form');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const formValue = this.form.getRawValue();
    const dto: CreateReceiverProfileDto = {
      name: formValue.name,
      surname: formValue.surname,
      employee_number: formValue.employee_number,
      email: formValue.email,
      phone: formValue.phone || undefined,
    };

    const result = await this.receiverService.createReceiver(dto);

    this.isSubmitting.set(false);

    if (result.error) {
      this.errorMessage.set(result.error);
      return;
    }

    if (result.profile) {
      this.successMessage.set(`Customer "${result.profile.name} ${result.profile.surname}" created successfully!`);
      this.customerCreated.emit(result.profile);

      timer(SUCCESS_CLOSE_DELAY_MS)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.resetAndClose();
        });
    }
  }

  /**
   * Handles modal close.
   */
  onClose(): void {
    if (!this.isSubmitting()) {
      this.resetAndClose();
    }
  }

  /**
   * Resets the form and closes the modal.
   */
  private resetAndClose(): void {
    this.form.reset();
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.closeModal.emit();
  }
}
