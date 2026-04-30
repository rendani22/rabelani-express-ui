import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';

import { MarkCollectedPayload, Package } from '../../../../core';
import { SignaturePadComponent } from '../../signature-pad/signature-pad.component';
import { ConfirmService, confirmDiscardIfDirty } from '../../confirm-dialog';

const PHONE_PATTERN = /^[+\d][\d\s().-]{6,}$/;

type PartyKey = 'receiver' | 'witness';

/**
 * Modal that captures Proof-of-Delivery details (receiver + witness
 * identification and signatures) before a package is marked as collected.
 */
@Component({
  selector: 'app-mark-collected-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, SignaturePadComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mark-collected-modal.component.html',
})
export class MarkCollectedModalComponent {
  private readonly fb = inject(FormBuilder);
  private readonly confirmService = inject(ConfirmService);

  // ---- Inputs / Outputs ---------------------------------------------------

  readonly isOpen = input<boolean>(false);
  readonly package = input<Package | null>(null);
  readonly isSubmitting = input<boolean>(false);

  readonly closeModal = output<void>();
  readonly confirmed = output<MarkCollectedPayload>();

  // ---- Form ---------------------------------------------------------------

  private buildPartyGroup(): FormGroup {
    return this.fb.nonNullable.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      employeeNumber: ['', [Validators.required, Validators.minLength(2)]],
      phone: ['', [Validators.required, Validators.pattern(PHONE_PATTERN)]],
      signature: ['', [Validators.required]],
    });
  }

  readonly form = this.fb.nonNullable.group(
    {
      receiver: this.buildPartyGroup(),
      witness: this.buildPartyGroup(),
    },
    { validators: [uniqueEmployeeNumberValidator()] },
  );

  // ---- UI state -----------------------------------------------------------

  readonly errorMessage = signal<string | null>(null);

  readonly isInvalid = computed(() => this.form.invalid);

  constructor() {
    // Reset form whenever the modal is opened.
    effect(() => {
      if (this.isOpen()) {
        this.form.reset();
        this.errorMessage.set(null);
      }
    });
  }

  // ---- Helpers ------------------------------------------------------------

  partyGroup(key: PartyKey): FormGroup {
    return this.form.controls[key] as FormGroup;
  }

  control(key: PartyKey, name: string): AbstractControl {
    return this.partyGroup(key).controls[name];
  }

  hasError(key: PartyKey, name: string): boolean {
    const c = this.control(key, name);
    return !!c && c.touched && c.invalid;
  }

  fieldError(key: PartyKey, name: string): string | null {
    const c = this.control(key, name);
    if (!c || !c.touched || c.valid) return null;
    if (c.hasError('required')) return 'Required';
    if (c.hasError('minlength')) return 'Too short';
    if (c.hasError('pattern')) return 'Invalid phone number';
    if (c.hasError('duplicateEmployeeNumber')) {
      return 'Receiver and witness must have different employee numbers';
    }
    return 'Invalid value';
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

  async onClose(): Promise<void> {
    if (this.isSubmitting()) return;
    const proceed = await confirmDiscardIfDirty(
      this.confirmService,
      this.form.dirty,
      false,
    );
    if (!proceed) return;
    this.closeModal.emit();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      const dup = this.form.hasError('duplicateEmployeeNumber');
      this.errorMessage.set(
        dup
          ? 'Receiver and witness cannot share the same employee number.'
          : 'Please complete all fields and capture both signatures.',
      );
      return;
    }

    const buildParty = (key: PartyKey) => {
      const group = this.partyGroup(key);
      const get = (name: string) => String(group.controls[name].value ?? '').trim();
      return {
        name: get('name'),
        employee_number: get('employeeNumber'),
        phone: get('phone'),
        // Signatures must be preserved as-is (data URL, no trim).
        signature_data_url: String(group.controls['signature'].value ?? ''),
      };
    };

    const payload: MarkCollectedPayload = {
      receiver: buildParty('receiver'),
      witness: buildParty('witness'),
      collected_at: new Date().toISOString(),
    };

    this.errorMessage.set(null);
    this.confirmed.emit(payload);
  }
}

/**
 * Cross-field validator: ensures the receiver's and witness's employee
 * numbers are not identical. The same person cannot sign for the package
 * as both receiver and witness.
 *
 * Sets a `duplicateEmployeeNumber` error on both employee-number controls
 * (so they are highlighted in the UI) and on the form itself (so callers
 * can surface a top-level error message).
 */
function uniqueEmployeeNumberValidator(): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const receiver = group.get(['receiver', 'employeeNumber']);
    const witness = group.get(['witness', 'employeeNumber']);
    if (!receiver || !witness) return null;

    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();
    const r = norm(receiver.value);
    const w = norm(witness.value);

    const clearError = (ctrl: AbstractControl) => {
      if (!ctrl.errors) return;
      const { duplicateEmployeeNumber, ...rest } = ctrl.errors;
      ctrl.setErrors(Object.keys(rest).length ? rest : null);
    };

    if (r && w && r === w) {
      const err = { duplicateEmployeeNumber: true };
      receiver.setErrors({ ...(receiver.errors ?? {}), ...err });
      witness.setErrors({ ...(witness.errors ?? {}), ...err });
      return err;
    }

    clearError(receiver);
    clearError(witness);
    return null;
  };
}


