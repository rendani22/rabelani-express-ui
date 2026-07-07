import { Injectable, signal, computed } from '@angular/core';
import { AlertSeverity, AlertVariant } from '../shared/alert.types';

/**
 * Interface for a toast item managed by the ToastService
 */
export interface ToastItem {
  id: string;
  severity: AlertSeverity;
  message: string;
  variant: AlertVariant;
  autoClose: boolean;
  autoCloseDelay: number;
}

/**
 * Toast Service
 *
 * A service for managing toast notifications programmatically.
 * Allows showing and dismissing toasts from anywhere in the application.
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   private toastService = inject(ToastService);
 *
 *   showSuccess() {
 *     this.toastService.success('Operation completed successfully!');
 *   }
 *
 *   showError() {
 *     this.toastService.error('An error occurred. Please try again.');
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly _toasts = signal<ToastItem[]>([]);

  /** Observable list of current toasts */
  readonly toasts = computed(() => this._toasts());

  /** Counter for generating unique IDs */
  private idCounter = 0;

  /**
   * Show a toast notification
   */
  show(
    message: string,
    severity: AlertSeverity = 'info',
    options?: {
      variant?: AlertVariant;
      autoClose?: boolean;
      autoCloseDelay?: number;
    }
  ): string {
    const id = `toast-${++this.idCounter}`;
    const toast: ToastItem = {
      id,
      message,
      severity,
      variant: options?.variant ?? 'solid',
      autoClose: options?.autoClose ?? true,
      autoCloseDelay: options?.autoCloseDelay ?? 3000,
    };

    this._toasts.update(toasts => [...toasts, toast]);

    if (toast.autoClose) {
      setTimeout(() => {
        this.dismiss(id);
      }, toast.autoCloseDelay);
    }

    return id;
  }

  /**
   * Show a success toast
   */
  success(message: string, options?: { variant?: AlertVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'success', options);
  }

  /**
   * Show an error toast
   */
  error(message: string, options?: { variant?: AlertVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'error', { autoClose: false, ...options });
  }

  /**
   * Show a warning toast
   */
  warning(message: string, options?: { variant?: AlertVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'warning', options);
  }

  /**
   * Show an info toast
   */
  info(message: string, options?: { variant?: AlertVariant; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(message, 'info', options);
  }

  /**
   * Dismiss a specific toast by ID
   */
  dismiss(id: string): void {
    this._toasts.update(toasts => toasts.filter(t => t.id !== id));
  }

  /**
   * Dismiss all toasts
   */
  dismissAll(): void {
    this._toasts.set([]);
  }
}

