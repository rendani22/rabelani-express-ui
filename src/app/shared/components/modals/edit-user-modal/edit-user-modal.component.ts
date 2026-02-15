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
  tablerBuildingSkyscraper,
  tablerEdit,
  tablerX
} from '@ng-icons/tabler-icons';

import { StaffService, StaffProfile, StaffRole, UpdateStaffProfileDto } from '../../../../core';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 1500;

/**
 * Modal component for editing existing staff users.
 * Uses reactive forms and follows Angular best practices.
 */
@Component({
  selector: 'app-edit-user-modal',
  standalone: true,
  imports: [ReactiveFormsModule, NgIcon],
  templateUrl: './edit-user-modal.component.html',
  styleUrl: './edit-user-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      tablerUser,
      tablerMail,
      tablerPhone,
      tablerBuildingSkyscraper,
      tablerEdit,
      tablerX
    })
  ]
})
export class EditUserModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly staffService = inject(StaffService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** The staff profile to edit */
  readonly staff = input<StaffProfile | null>(null);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the updated staff profile on success */
  readonly userUpdated = output<StaffProfile>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Available roles for selection */
  readonly roles: { value: StaffRole; label: string }[] = [
    { value: 'admin', label: 'Administrator' },
    { value: 'manager', label: 'Manager' },
    { value: 'staff', label: 'Staff' },
    { value: 'viewer', label: 'Viewer' }
  ];

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    role: ['staff' as StaffRole, [Validators.required]],
    phone: [''],
    department: [''],
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

  /** Loading state from service */
  readonly isLoading = this.staffService.loading;

  constructor() {
    // Populate form when staff input changes
    effect(() => {
      const staffProfile = this.staff();
      if (staffProfile && this.isOpen()) {
        this.populateForm(staffProfile);
      }
    });
  }

  /**
   * Populates the form with staff data.
   */
  private populateForm(staff: StaffProfile): void {
    this.form.patchValue({
      full_name: staff.full_name,
      role: staff.role,
      phone: staff.phone || '',
      department: staff.department || '',
    });
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

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
      full_name: 'Full name is required',
      role: 'Role is required',
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
    const staffProfile = this.staff();
    if (!staffProfile) {
      this.errorMessage.set('No user selected for editing');
      return;
    }

    // Mark all fields as touched to show validation
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.errorMessage.set('Please fix the errors in the form');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const formValue = this.form.getRawValue();
    const dto: UpdateStaffProfileDto = {
      full_name: formValue.full_name,
      role: formValue.role,
      phone: formValue.phone || undefined,
      department: formValue.department || undefined,
    };

    const result = await this.staffService.updateStaff(staffProfile.id, dto);

    this.isSubmitting.set(false);

    if (result.error) {
      this.errorMessage.set(result.error);
      return;
    }

    if (result.profile) {
      this.successMessage.set(`User "${result.profile.full_name}" updated successfully!`);
      this.userUpdated.emit(result.profile);

      // Auto-close after success
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
    this.form.reset({ role: 'staff' });
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.closeModal.emit();
  }
}

