import {
  Component,
  ChangeDetectionStrategy,
  input,
  output,
} from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  tablerAlertTriangle,
  tablerX,
  tablerCheck,
} from '@ng-icons/tabler-icons';

/**
 * A styled confirmation dialog that replaces the native browser confirm().
 *
 * Usage:
 * ```html
 * <app-confirm-dialog
 *   [isOpen]="confirmOpen()"
 *   title="Deactivate User"
 *   message="Are you sure you want to deactivate John Doe?"
 *   confirmLabel="Deactivate"
 *   [danger]="true"
 *   (confirmed)="onDeactivateConfirmed()"
 *   (cancelled)="onDeactivateCancelled()"
 * ></app-confirm-dialog>
 * ```
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [NgIcon],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  viewProviders: [
    provideIcons({ tablerAlertTriangle, tablerX, tablerCheck }),
  ],
})
export class ConfirmDialogComponent {
  /** Whether the dialog is visible */
  readonly isOpen = input(false);

  /** Dialog heading */
  readonly title = input('Confirm Action');

  /** Body text / question */
  readonly message = input('Are you sure you want to proceed?');

  /** Label for the confirm button */
  readonly confirmLabel = input('Confirm');

  /** Label for the cancel button */
  readonly cancelLabel = input('Cancel');

  /** When true the confirm button is rendered as a danger (red) action */
  readonly danger = input(false);

  /** Emits when the user clicks the confirm button */
  readonly confirmed = output<void>();

  /** Emits when the user dismisses the dialog without confirming */
  readonly cancelled = output<void>();

  onConfirm(): void {
    this.confirmed.emit();
  }

  onCancel(): void {
    this.cancelled.emit();
  }
}
