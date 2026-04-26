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
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { timer } from 'rxjs';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerUser,
  tablerMail,
  tablerPhone,
  tablerUserPlus,
  tablerUsers,
  tablerPlus,
  tablerTrash,
  tablerX
} from '@ng-icons/tabler-icons';

import {
  ReceiverService,
  ReceiverProfile,
  CreateReceiverProfileDto,
  CreateReceiverContactDto,
} from '../../../../core';
import { ConfirmService, confirmDiscardIfDirty } from '../../confirm-dialog';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 2000;

/** Email validation pattern */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Type for an alternative contact form group */
type ContactFormGroup = FormGroup<{
  name: FormControl<string>;
  phone: FormControl<string>;
}>;

/**
 * Modal component for creating new customer (receiver) profiles.
 * Supports adding alternative contacts inline during creation.
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
      tablerUserPlus,
      tablerUsers,
      tablerPlus,
      tablerTrash,
      tablerX
    })
  ]
})
export class AddCustomerModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly receiverService = inject(ReceiverService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly confirmService = inject(ConfirmService);

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
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    phone: [''],
    contacts: this.fb.nonNullable.array<ContactFormGroup>([]),
  });

  /** Convenience accessor for the contacts FormArray */
  get contacts(): FormArray<ContactFormGroup> {
    return this.form.controls.contacts;
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

  // =========================================================================
  // Form Field Error Handling
  // =========================================================================

  /**
   * Gets the error message for a top-level form field.
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
   * Gets the error message for a contact field at the given index.
   */
  getContactError(index: number, fieldName: 'name' | 'phone'): string | null {
    const control = this.contacts.at(index)?.get(fieldName);
    if (!control || !control.touched || !control.errors) return null;
    if (control.errors['required']) {
      return fieldName === 'name' ? 'Name is required' : 'Phone is required';
    }
    if (control.errors['minlength']) {
      const min = control.errors['minlength'].requiredLength;
      return `Must be at least ${min} characters`;
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
      email: 'Email is required',
    };
    return messages[fieldName] || 'This field is required';
  }

  // =========================================================================
  // Contact FormArray actions
  // =========================================================================

  /** Append a new empty contact form group. */
  addContact(): void {
    const group = this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.minLength(6)]],
    }) as ContactFormGroup;
    this.contacts.push(group);
  }

  /** Remove the contact at the given index. */
  removeContact(index: number): void {
    this.contacts.removeAt(index);
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
      email: formValue.email,
      phone: formValue.phone || undefined,
    };

    const result = await this.receiverService.createReceiver(dto);

    if (result.error || !result.profile) {
      this.isSubmitting.set(false);
      this.errorMessage.set(result.error ?? 'Failed to create customer.');
      return;
    }

    // Persist alternative contacts (if any). Failures are surfaced but the
    // receiver itself was created successfully, so we still emit success.
    const profile = result.profile;
    const contactErrors: string[] = [];
    for (const c of formValue.contacts) {
      const contactDto: CreateReceiverContactDto = {
        receiver_id: profile.id,
        name: c.name.trim(),
        phone: c.phone.trim(),
      };
      const { error } = await this.receiverService.addContact(contactDto);
      if (error) contactErrors.push(`${c.name}: ${error}`);
    }

    this.isSubmitting.set(false);

    if (contactErrors.length > 0) {
      this.errorMessage.set(
        `Customer created, but some contacts failed: ${contactErrors.join('; ')}`
      );
    }

    this.successMessage.set(
      `Customer "${profile.name} ${profile.surname}" created successfully!`
    );
    this.customerCreated.emit(profile);

    timer(SUCCESS_CLOSE_DELAY_MS)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.resetAndClose();
      });
  }

  /**
   * Handles modal close.
   */
  async onClose(): Promise<void> {
    if (this.isSubmitting()) return;
    if (this.successMessage()) {
      this.resetAndClose();
      return;
    }
    const isDirty = this.form.dirty || this.contacts.length > 0;
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      isDirty,
      false,
    );
    if (!proceed) return;
    this.resetAndClose();
  }

  /**
   * Resets the form and closes the modal.
   */
  private resetAndClose(): void {
    this.contacts.clear();
    this.form.reset();
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.closeModal.emit();
  }
}
