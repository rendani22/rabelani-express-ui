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
  tablerLock,
  tablerPhone,
  tablerTruck,
  tablerId,
  tablerUserPlus,
  tablerX
} from '@ng-icons/tabler-icons';

import { DriverService, DriverProfile, CreateDriverDto } from '../../../core';

/** Duration to show success message before auto-closing */
const SUCCESS_CLOSE_DELAY_MS = 2000;

/** Email validation pattern */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Password minimum length */
const PASSWORD_MIN_LENGTH = 8;

/**
 * Modal component for creating new driver accounts.
 * Uses reactive forms and follows Angular best practices.
 */
@Component({
  selector: 'app-add-driver-modal',
  standalone: true,
  imports: [ReactiveFormsModule, NgIcon],
  templateUrl: './add-driver-modal.component.html',
  styleUrl: './add-driver-modal.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({
      tablerUser,
      tablerMail,
      tablerLock,
      tablerPhone,
      tablerTruck,
      tablerId,
      tablerUserPlus,
      tablerX
    })
  ]
})
export class AddDriverModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly driverService = inject(DriverService);
  private readonly destroyRef = inject(DestroyRef);

  // =========================================================================
  // Inputs & Outputs
  // =========================================================================

  /** Controls modal visibility */
  readonly isOpen = input(false);

  /** Emits when modal should close */
  readonly closeModal = output<void>();

  /** Emits the created driver profile on success */
  readonly driverCreated = output<DriverProfile>();

  // =========================================================================
  // Form Definition
  // =========================================================================

  /** Vehicle types for selection */
  readonly vehicleTypes: { value: string; label: string }[] = [
    { value: 'motorcycle', label: 'Motorcycle' },
    { value: 'car', label: 'Car' },
    { value: 'van', label: 'Van' },
    { value: 'truck', label: 'Truck' }
  ];

  /** Main form group */
  readonly form = this.fb.nonNullable.group({
    full_name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
    password: ['', [Validators.required, Validators.minLength(PASSWORD_MIN_LENGTH)]],
    phone: [''],
    vehicle_type: ['car'],
    vehicle_registration: [''],
    license_number: [''],
  });

  // =========================================================================
  // State Signals
  // =========================================================================

  /** Loading state */
  readonly isLoading = signal(false);

  /** Error message */
  readonly errorMessage = signal<string | null>(null);

  /** Success state */
  readonly isSuccess = signal(false);

  // =========================================================================
  // Public Methods
  // =========================================================================

  /**
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    if (this.form.invalid || this.isLoading()) {
      this.markFormAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    const formValue = this.form.getRawValue();
    const dto: CreateDriverDto = {
      email: formValue.email,
      password: formValue.password,
      full_name: formValue.full_name,
      phone: formValue.phone || undefined,
      vehicle_type: formValue.vehicle_type || undefined,
      vehicle_registration: formValue.vehicle_registration || undefined,
      license_number: formValue.license_number || undefined,
    };

    const result = await this.driverService.createDriver(dto);

    this.isLoading.set(false);

    if (result.error) {
      this.errorMessage.set(result.error);
      return;
    }

    if (result.driver) {
      this.isSuccess.set(true);
      this.driverCreated.emit(result.driver);

      // Auto-close after success
      timer(SUCCESS_CLOSE_DELAY_MS)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.handleClose();
        });
    }
  }

  /**
   * Handle modal close
   */
  handleClose(): void {
    this.resetForm();
    this.closeModal.emit();
  }

  /**
   * Check if a field has an error and has been touched
   */
  hasError(fieldName: string): boolean {
    const control = this.form.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }

  /**
   * Get error message for a field
   */
  getErrorMessage(fieldName: string): string {
    const control = this.form.get(fieldName);
    if (!control || !control.errors) return '';

    if (control.errors['required']) return `${this.getFieldLabel(fieldName)} is required`;
    if (control.errors['minlength']) {
      const minLength = control.errors['minlength'].requiredLength;
      return `${this.getFieldLabel(fieldName)} must be at least ${minLength} characters`;
    }
    if (control.errors['pattern']) return `Please enter a valid ${this.getFieldLabel(fieldName).toLowerCase()}`;

    return 'Invalid value';
  }

  // =========================================================================
  // Private Methods
  // =========================================================================

  /**
   * Reset form to initial state
   */
  private resetForm(): void {
    this.form.reset({
      full_name: '',
      email: '',
      password: '',
      phone: '',
      vehicle_type: 'car',
      vehicle_registration: '',
      license_number: '',
    });
    this.errorMessage.set(null);
    this.isSuccess.set(false);
  }

  /**
   * Mark all form fields as touched
   */
  private markFormAsTouched(): void {
    Object.keys(this.form.controls).forEach(key => {
      const control = this.form.get(key);
      control?.markAsTouched();
    });
  }

  /**
   * Get field label for error messages
   */
  private getFieldLabel(fieldName: string): string {
    const labels: Record<string, string> = {
      full_name: 'Full name',
      email: 'Email',
      password: 'Password',
      phone: 'Phone',
      vehicle_type: 'Vehicle type',
      vehicle_registration: 'Vehicle registration',
      license_number: 'License number',
    };
    return labels[fieldName] || fieldName;
  }
}



