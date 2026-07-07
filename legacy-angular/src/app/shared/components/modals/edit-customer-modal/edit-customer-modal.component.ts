import {
  Component,
  inject,
  input,
  output,
  signal,
  effect,
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
  tablerEdit,
  tablerX,
} from '@ng-icons/tabler-icons';

import {
  ReceiverService,
  ReceiverProfile,
  UpdateReceiverProfileDto,
} from '../../../../core';
import { ConfirmService, confirmDiscardIfDirty } from '../../confirm-dialog';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 1500;

/** Email validation pattern */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal component for editing an existing receiver (customer) profile.
 * Mirrors the styling of the add-customer modal but updates instead of creating.
 */
@Component({
  selector: 'app-edit-customer-modal',
  standalone: true,
  imports: [ReactiveFormsModule, NgIcon],
  templateUrl: './edit-customer-modal.component.html',
  styleUrl: './edit-customer-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      tablerUser,
      tablerMail,
      tablerPhone,
      tablerEdit,
      tablerX,
    }),
  ],
})
export class EditCustomerModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly receiverService = inject(ReceiverService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmService = inject(ConfirmService);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Customer being edited */
  readonly receiver = input<ReceiverProfile | null>(null);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the updated receiver profile on success */
  readonly customerUpdated = output<ReceiverProfile>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    surname: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    phone: [''],
  });

  // =========================================================================
  // UI State
  // =========================================================================

  readonly isSubmitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  constructor() {
    // Patch the form when receiver/isOpen change so the modal always
    // reflects the latest customer data.
    effect(() => {
      const open = this.isOpen();
      const r = this.receiver();
      if (open && r) {
        this.form.reset({
          name: r.name,
          surname: r.surname,
          email: r.email,
          phone: r.phone ?? '',
        });
        this.errorMessage.set(null);
        this.successMessage.set(null);
      }
    });
  }

  // =========================================================================
  // Form Field Error Handling
  // =========================================================================

  getFieldError(fieldName: string): string | null {
    const control = this.form.get(fieldName);
    if (!control || !control.touched || !control.errors) return null;

    const errors = control.errors;
    if (errors['required']) return this.getRequiredMessage(fieldName);
    if (errors['pattern']) return 'Please enter a valid email address';
    if (errors['minlength']) {
      return `Must be at least ${errors['minlength'].requiredLength} characters`;
    }
    return null;
  }

  private getRequiredMessage(fieldName: string): string {
    const messages: Record<string, string> = {
      name: 'First name is required',
      surname: 'Last name is required',
      email: 'Email is required',
    };
    return messages[fieldName] || 'This field is required';
  }

  // =========================================================================
  // Actions
  // =========================================================================

  async onSubmit(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.errorMessage.set('Please fix the errors in the form');
      return;
    }

    const current = this.receiver();
    if (!current) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const v = this.form.getRawValue();
    const dto: UpdateReceiverProfileDto = {
      name: v.name.trim(),
      surname: v.surname.trim(),
      email: v.email.trim(),
      phone: v.phone.trim() || undefined,
    };

    const result = await this.receiverService.updateReceiver(current.id, dto);

    if (result.error || !result.profile) {
      this.isSubmitting.set(false);
      this.errorMessage.set(result.error ?? 'Failed to update customer.');
      return;
    }

    this.isSubmitting.set(false);
    this.successMessage.set(
      `Customer "${result.profile.name} ${result.profile.surname}" updated successfully!`
    );
    this.customerUpdated.emit(result.profile);

    timer(SUCCESS_CLOSE_DELAY_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetAndClose());
  }

  async onClose(): Promise<void> {
    if (this.isSubmitting()) return;
    if (this.successMessage()) {
      this.resetAndClose();
      return;
    }
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      this.form.dirty,
      false,
    );
    if (!proceed) return;
    this.resetAndClose();
  }

  private resetAndClose(): void {
    this.form.reset();
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.closeModal.emit();
  }
}

