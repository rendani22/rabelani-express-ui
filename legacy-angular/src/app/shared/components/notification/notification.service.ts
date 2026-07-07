import { Injectable, signal, computed } from '@angular/core';
import { AlertSeverity } from '../shared/alert.types';

/**
 * Interface for a notification item managed by the NotificationService
 */
export interface NotificationItem {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  actionLabel?: string;
  actionUrl?: string;
  autoClose: boolean;
  autoCloseDelay: number;
}

/**
 * Notification Service
 *
 * A service for managing notifications programmatically.
 * Allows showing and dismissing notifications from anywhere in the application.
 *
 * @example
 * ```typescript
 * export class MyComponent {
 *   private notificationService = inject(NotificationService);
 *
 *   showSuccess() {
 *     this.notificationService.success('Success', 'Operation completed successfully!');
 *   }
 *
 *   showError() {
 *     this.notificationService.error('Error', 'An error occurred. Please try again.');
 *   }
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly _notifications = signal<NotificationItem[]>([]);

  /** Observable list of current notifications */
  readonly notifications = computed(() => this._notifications());

  /** Counter for generating unique IDs */
  private idCounter = 0;

  /**
   * Show a notification
   */
  show(
    title: string,
    message: string,
    severity: AlertSeverity = 'info',
    options?: {
      actionLabel?: string;
      actionUrl?: string;
      autoClose?: boolean;
      autoCloseDelay?: number;
    }
  ): string {
    const id = `notification-${++this.idCounter}`;
    const notification: NotificationItem = {
      id,
      title,
      message,
      severity,
      actionLabel: options?.actionLabel,
      actionUrl: options?.actionUrl,
      autoClose: options?.autoClose ?? true,
      autoCloseDelay: options?.autoCloseDelay ?? 5000,
    };

    this._notifications.update(notifications => [...notifications, notification]);

    if (notification.autoClose) {
      setTimeout(() => {
        this.dismiss(id);
      }, notification.autoCloseDelay);
    }

    return id;
  }

  /**
   * Show a success notification
   */
  success(title: string, message: string, options?: { actionLabel?: string; actionUrl?: string; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(title, message, 'success', options);
  }

  /**
   * Show an error notification
   */
  error(title: string, message: string, options?: { actionLabel?: string; actionUrl?: string; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(title, message, 'error', { autoClose: false, ...options });
  }

  /**
   * Show a warning notification
   */
  warning(title: string, message: string, options?: { actionLabel?: string; actionUrl?: string; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(title, message, 'warning', options);
  }

  /**
   * Show an info notification
   */
  info(title: string, message: string, options?: { actionLabel?: string; actionUrl?: string; autoClose?: boolean; autoCloseDelay?: number }): string {
    return this.show(title, message, 'info', options);
  }

  /**
   * Dismiss a specific notification by ID
   */
  dismiss(id: string): void {
    this._notifications.update(notifications => notifications.filter(n => n.id !== id));
  }

  /**
   * Dismiss all notifications
   */
  dismissAll(): void {
    this._notifications.set([]);
  }
}

