import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerBox,
  tablerCheck,
  tablerPlus,
  tablerTrendingUp,
  tablerX,
} from '@ng-icons/tabler-icons';

import { InventoryItem } from '../../../../core';

@Component({
  selector: 'app-restock-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule, NgIcon],
  viewProviders: [
    provideIcons({ tablerBox, tablerCheck, tablerPlus, tablerTrendingUp, tablerX }),
  ],
  templateUrl: './restock-modal.html',
  styleUrl: './restock-modal.css',
})
export class RestockModalComponent {
  private readonly fb = inject(FormBuilder);

  readonly isOpen = input.required<boolean>();
  readonly item = input<InventoryItem | null>(null);

  readonly closed = output<void>();
  readonly confirmed = output<{ quantity: number; note: string | null }>();

  readonly form = this.fb.nonNullable.group({
    quantity: [1, [Validators.required, Validators.min(1)]],
    note:     [''],
  });

  /** Preview of what the new quantity will be after the restock. */
  readonly previewAfter = computed(() => {
    const current = this.item()?.quantity ?? 0;
    const add = Number(this.form.controls.quantity.value) || 0;
    return current + Math.max(0, add);
  });

  constructor() {
    // Reset form every time the modal opens with a (new) item.
    effect(() => {
      if (this.isOpen()) {
        this.form.reset({ quantity: 1, note: '' });
      }
    });
  }

  onCancel(): void {
    this.closed.emit();
  }

  onSubmit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;

    const v = this.form.getRawValue();
    this.confirmed.emit({
      quantity: v.quantity,
      note: v.note?.trim() ? v.note.trim() : null,
    });
  }

  getQuantityError(): string | null {
    const ctrl = this.form.controls.quantity;
    if (!ctrl.touched || !ctrl.errors) return null;
    if (ctrl.errors['required']) return 'Quantity is required.';
    if (ctrl.errors['min']) return 'Must add at least 1.';
    return null;
  }
}

