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
  tablerTruck,
  tablerId,
  tablerEdit,
  tablerX,
} from '@ng-icons/tabler-icons';

import { StaffService, DriverProfile, UpdateStaffProfileDto } from '../../../core';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 1500;

/**
 * Modal component for editing an existing driver profile.
 * Mirrors the EditUserModalComponent pattern.
 */
@Component({
  selector: 'app-edit-driver-modal',
  standalone: true,
  imports: [ReactiveFormsModule, NgIcon],
  templateUrl: './edit-driver-modal.component.html',
  styleUrl: './edit-driver-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      tablerUser,
      tablerMail,
      tablerPhone,
      tablerTruck,
      tablerId,
      tablerEdit,
      tablerX,
    }),
  ],
})
export class EditDriverModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly staffService = inject(StaffService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** The driver profile to edit */
  readonly driver = input<DriverProfile | null>(null);

  /** Emits when the modal should close */
  readonly closeModal = output<void>();

  /** Emits the updated driver profile on success */
  readonly driverUpdated = output<DriverProfile>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Vehicle types for selection */
  readonly vehicleTypes: { value: string; label: string }[] = [
    { value: 'motorcycle', label: 'Motorcycle' },
    { value: 'car', label: 'Car' },
    { value: 'van', label: 'Van' },
    { value: 'truck', label: 'Truck' },
  ];

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    phone: [''],
    vehicle_type: ['car'],
    vehicle_registration: [''],
    license_number: [''],
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

  constructor() {
    // Populate form when driver input changes and modal opens
    effect(() => {
      const driverProfile = this.driver();
      if (driverProfile && this.isOpen()) {
        this.populateForm(driverProfile);
      }
    });
  }

  /**
   * Populates the form with driver data.
   */
  private populateForm(driver: DriverProfile): void {
    // Attempt to extract vehicle_type from department field
    let vehicleType = 'car';
    if (driver.department?.startsWith('Vehicle: ')) {
      vehicleType = driver.department.replace('Vehicle: ', '').toLowerCase();
    }

    this.form.patchValue({
      full_name: driver.full_name,
      phone: driver.phone ?? '',
      vehicle_type: vehicleType,
      vehicle_registration: driver.vehicle_info?.vehicle_registration ?? '',
      license_number: driver.vehicle_info?.license_number ?? '',
    });
    this.errorMessage.set(null);
    this.successMessage.set(null);
  }

  // =========================================================================
  // Field Error Handling
  // =========================================================================

  /**
   * Gets the error message for a specific form field.
   */
  getFieldError(fieldName: string): string | null {
    const control = this.form.get(fieldName);
    if (!control || !control.touched || !control.errors) return null;

    const errors = control.errors;
    if (errors['required']) return this.getRequiredMessage(fieldName);
    if (errors['minlength']) {
      const minLength = errors['minlength'].requiredLength;
      return `Must be at least ${minLength} characters`;
    }
    return null;
  }

  private getRequiredMessage(fieldName: string): string {
    const messages: Record<string, string> = {
      full_name: 'Full name is required',
    };
    return messages[fieldName] ?? 'This field is required';
  }

  // =========================================================================
  // Actions
  // =========================================================================

  /**
   * Handles form submission.
   */
  async onSubmit(): Promise<void> {
    const driverProfile = this.driver();
    if (!driverProfile) {
      this.errorMessage.set('No driver selected for editing.');
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.errorMessage.set('Please fix the errors in the form.');
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    const formValue = this.form.getRawValue();
    const dto: UpdateStaffProfileDto = {
      full_name: formValue.full_name,
      phone: formValue.phone || undefined,
      department: formValue.vehicle_type ? `Vehicle: ${formValue.vehicle_type}` : undefined,
    };

    const result = await this.staffService.updateStaff(driverProfile.id, dto);

    this.isSubmitting.set(false);

    if (result.error) {
      this.errorMessage.set(result.error);
      return;
    }

    if (result.profile) {
      this.successMessage.set(`Driver "${result.profile.full_name}" updated successfully!`);
      this.driverUpdated.emit(result.profile as DriverProfile);

      // Auto-close after success
      timer(SUCCESS_CLOSE_DELAY_MS)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.resetAndClose());
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
    this.form.reset({ vehicle_type: 'car' });
    this.errorMessage.set(null);
    this.successMessage.set(null);
    this.closeModal.emit();
  }
}
