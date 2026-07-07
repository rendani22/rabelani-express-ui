import {
  Component,
  inject,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NotificationComponent } from './notification.component';
import { NotificationService } from './notification.service';

/**
 * Position options for the notification container
 */
export type NotificationPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Notification Container Component
 *
 * A container component that displays notifications managed by the NotificationService.
 * Add this component once to your app (e.g., in app.component.html).
 *
 * @example
 * ```html
 * <!-- In app.component.html -->
 * <app-notification-container position="top-right"></app-notification-container>
 * ```
 */
@Component({
  selector: 'app-notification-container',
  standalone: true,
  imports: [NotificationComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notification-container" [class]="positionClasses()">
      @for (notification of notificationService.notifications(); track notification.id) {
        <app-notification
          [severity]="notification.severity"
          [title]="notification.title"
          [message]="notification.message"
          [actionLabel]="notification.actionLabel ?? ''"
          [actionUrl]="notification.actionUrl ?? ''"
          [dismissible]="true"
          (dismissed)="notificationService.dismiss(notification.id)"
        />
      }
    </div>
  `,
  styles: [`
    .notification-container {
      position: fixed;
      z-index: 9998;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      pointer-events: none;
      max-width: 400px;
    }

    .notification-container > * {
      pointer-events: auto;
    }

    /* Top positions */
    .position-top-left {
      top: 0;
      left: 0;
      align-items: flex-start;
    }

    .position-top-center {
      top: 0;
      left: 50%;
      transform: translateX(-50%);
      align-items: center;
    }

    .position-top-right {
      top: 0;
      right: 0;
      align-items: flex-end;
    }

    /* Bottom positions */
    .position-bottom-left {
      bottom: 0;
      left: 0;
      align-items: flex-start;
      flex-direction: column-reverse;
    }

    .position-bottom-center {
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      align-items: center;
      flex-direction: column-reverse;
    }

    .position-bottom-right {
      bottom: 0;
      right: 0;
      align-items: flex-end;
      flex-direction: column-reverse;
    }
  `],
})
export class NotificationContainerComponent {
  protected readonly notificationService = inject(NotificationService);

  /** Position of the notification container */
  readonly position = input<NotificationPosition>('top-right');

  /** Computed position classes */
  positionClasses(): string {
    return `position-${this.position()}`;
  }
}

