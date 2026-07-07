import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ConfirmDialogComponent } from './confirm-dialog.component';
import { ConfirmService } from './confirm.service';

/**
 * Global host that renders a single {@link ConfirmDialogComponent} bound to
 * the application-wide {@link ConfirmService}. Mount once in `app.html`.
 */
@Component({
  selector: 'app-confirm-dialog-host',
  standalone: true,
  imports: [ConfirmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-confirm-dialog
      [isOpen]="isOpen()"
      [title]="options().title"
      [message]="options().message"
      [confirmLabel]="options().confirmLabel"
      [cancelLabel]="options().cancelLabel"
      [danger]="options().danger"
      (confirmed)="onConfirmed()"
      (cancelled)="onCancelled()"
    ></app-confirm-dialog>
  `,
})
export class ConfirmDialogHostComponent {
  private readonly service = inject(ConfirmService);

  protected readonly isOpen = computed(() => this.service.active() !== null);
  protected readonly options = computed(
    () =>
      this.service.active()?.options ?? {
        title: '',
        message: '',
        confirmLabel: 'Confirm',
        cancelLabel: 'Cancel',
        danger: false,
      },
  );

  protected onConfirmed(): void {
    this.service._onConfirmed();
  }

  protected onCancelled(): void {
    this.service._onCancelled();
  }
}

