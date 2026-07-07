import { Injectable, signal } from '@angular/core';

/** Options passed to {@link ConfirmService.confirm}. */
export interface ConfirmOptions {
  title?: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ActiveRequest {
  options: Required<ConfirmOptions>;
  resolve: (value: boolean) => void;
}

const DEFAULTS: Required<ConfirmOptions> = {
  title: 'Confirm Action',
  message: 'Are you sure you want to proceed?',
  confirmLabel: 'Confirm',
  cancelLabel: 'Cancel',
  danger: false,
};

/**
 * Imperative confirmation dialog service. Mirrors the pattern used by
 * {@link ToastService}: inject anywhere, call `await confirm.confirm({...})`
 * and receive a boolean. A single global host component
 * (`ConfirmDialogHostComponent`) renders the dialog.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _active = signal<ActiveRequest | null>(null);

  /** The currently active request (or null). Read by the host component. */
  readonly active = this._active.asReadonly();

  /** Open a confirmation dialog. Resolves to `true` if confirmed, `false` otherwise. */
  confirm(options: ConfirmOptions = {}): Promise<boolean> {
    // If a previous dialog is still open, auto-cancel it before opening a new one.
    const prev = this._active();
    if (prev) {
      prev.resolve(false);
    }

    return new Promise<boolean>((resolve) => {
      this._active.set({
        options: { ...DEFAULTS, ...options },
        resolve,
      });
    });
  }

  /** Convenience: confirm discarding unsaved changes. */
  confirmDiscard(): Promise<boolean> {
    return this.confirm({
      title: 'Discard changes?',
      message:
        'You have unsaved changes. Are you sure you want to close without saving?',
      confirmLabel: 'Discard',
      cancelLabel: 'Keep editing',
      danger: true,
    });
  }

  /** Called by the host when the user confirms. */
  _onConfirmed(): void {
    const current = this._active();
    if (!current) return;
    this._active.set(null);
    current.resolve(true);
  }

  /** Called by the host when the user cancels / dismisses. */
  _onCancelled(): void {
    const current = this._active();
    if (!current) return;
    this._active.set(null);
    current.resolve(false);
  }
}

/**
 * Helper that prompts the user to discard changes when a form is dirty.
 * Returns `true` when the caller may proceed with closing, `false` otherwise.
 *
 * - Returns `false` immediately when `isSubmitting` is `true` (prevents
 *   closing during submission).
 * - Returns `true` immediately when not dirty.
 * - Otherwise opens the discard confirmation dialog and returns its result.
 */
export async function confirmDiscardIfDirty(
  service: ConfirmService,
  isDirty: boolean,
  isSubmitting = false,
): Promise<boolean> {
  if (isSubmitting) return false;
  if (!isDirty) return true;
  return service.confirmDiscard();
}

