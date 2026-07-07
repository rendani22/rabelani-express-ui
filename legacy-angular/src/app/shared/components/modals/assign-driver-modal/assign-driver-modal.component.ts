import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';

import { DriverProfile, DriverService, Package } from '../../../../core';

/**
 * Payload emitted when the user confirms a driver selection.
 */
export interface AssignDriverPayload {
  /** The driver's auth.users.id — written to packages.picked_up_by */
  readonly driverUserId: string;
  /** The driver's staff_profiles.id (for UI/feedback purposes) */
  readonly driverId: string;
  /** Display name of the chosen driver */
  readonly driverName: string;
}

/**
 * Modal that prompts the user to assign a driver to a package before it
 * transitions to the `in_transit` status.
 */
@Component({
  selector: 'app-assign-driver-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './assign-driver-modal.component.html',
})
export class AssignDriverModalComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly driverService = inject(DriverService);

  // ---- Inputs / Outputs ---------------------------------------------------

  readonly isOpen = input<boolean>(false);
  readonly package = input<Package | null>(null);
  readonly isSubmitting = input<boolean>(false);

  readonly closeModal = output<void>();
  readonly confirmed = output<AssignDriverPayload>();

  // ---- State --------------------------------------------------------------

  readonly form = this.fb.nonNullable.group({
    driverUserId: ['', [Validators.required]],
  });

  readonly errorMessage = signal<string | null>(null);

  /** All loaded drivers (active only). */
  readonly drivers = computed<DriverProfile[]>(() =>
    this.driverService.drivers().filter((d) => d.is_active),
  );

  readonly hasDrivers = computed(() => this.drivers().length > 0);
  readonly isLoadingDrivers = this.driverService.loading;

  constructor() {
    // Reset state and (re)load drivers each time the modal opens.
    effect(() => {
      if (this.isOpen()) {
        this.form.reset({ driverUserId: '' });
        this.errorMessage.set(null);

        // Pre-select the currently assigned driver, if any.
        const currentUserId = this.package()?.picked_up_by ?? '';
        if (currentUserId) {
          this.form.controls.driverUserId.setValue(currentUserId);
        }

        // Refresh driver list so availability is current.
        void this.driverService.loadDrivers();
      }
    });
  }

  ngOnInit(): void {
    // Pre-load drivers on first construction so the list shows quickly.
    if (this.driverService.drivers().length === 0) {
      void this.driverService.loadDrivers();
    }
  }

  // ---- Helpers ------------------------------------------------------------

  /** Human-friendly status label for a driver row. */
  driverStatusLabel(driver: DriverProfile): string {
    if (!driver.is_active) return 'Inactive';
    if (driver.is_available === false) return 'On delivery';
    return 'Available';
  }

  trackByDriverId(_index: number, driver: DriverProfile): string {
    return driver.id;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.isOpen() && !this.isSubmitting()) {
      this.onClose();
    }
  }

  onBackdropClick(): void {
    if (!this.isSubmitting()) {
      this.onClose();
    }
  }

  onClose(): void {
    if (this.isSubmitting()) return;
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.errorMessage.set('Please select a driver to assign this package to.');
      return;
    }

    const driverUserId = this.form.controls.driverUserId.value;
    const driver = this.drivers().find((d) => d.user_id === driverUserId);

    if (!driver) {
      this.errorMessage.set('Selected driver could not be found. Please try again.');
      return;
    }

    this.errorMessage.set(null);
    this.confirmed.emit({
      driverUserId: driver.user_id,
      driverId: driver.id,
      driverName: driver.full_name,
    });
  }
}

