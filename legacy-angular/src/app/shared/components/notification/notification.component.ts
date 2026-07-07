import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlertSeverity } from '../shared/alert.types';

/**
 * Notification Component
 *
 * A rich notification component with title, description, and optional action link.
 * Perfect for detailed notifications that require user attention.
 *
 * @example
 * ```html
 * <app-notification
 *   severity="success"
 *   title="Pull Request Merged"
 *   message="Your changes have been successfully merged into the main branch."
 *   actionLabel="View Changes"
 *   actionUrl="/changes"
 *   (actionClicked)="onActionClick()">
 * </app-notification>
 * ```
 */
@Component({
  selector: 'app-notification',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isVisible()) {
      <div role="alert" class="notification">
        <div class="notification-main">
          <div class="notification-body">
            <svg 
              class="notification-icon" 
              [class]="iconClasses()" 
              width="16" 
              height="16" 
              viewBox="0 0 16 16"
            >
              @switch (severity()) {
                @case ('warning') {
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm0 12c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1zm1-3H7V4h2v5z"/>
                }
                @case ('success') {
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zM7 11.4L3.6 8 5 6.6l2 2 4-4L12.4 6 7 11.4z"/>
                }
                @case ('error') {
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm3.5 10.1l-1.4 1.4L8 9.4l-2.1 2.1-1.4-1.4L6.6 8 4.5 5.9l1.4-1.4L8 6.6l2.1-2.1 1.4 1.4L9.4 8l2.1 2.1z"/>
                }
                @case ('info') {
                  <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 12H7V7h2v5zM8 6c-.6 0-1-.4-1-1s.4-1 1-1 1 .4 1 1-.4 1-1 1z"/>
                }
              }
            </svg>
            <div class="notification-content">
              <div class="notification-title">{{ title() }}</div>
              <div class="notification-message">{{ message() }}</div>
            </div>
          </div>
          @if (dismissible()) {
            <button 
              type="button"
              class="notification-close"
              (click)="dismiss()"
              aria-label="Close notification"
            >
              <span class="sr-only">Close</span>
              <svg class="close-icon" width="16" height="16" viewBox="0 0 16 16">
                <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z"/>
              </svg>
            </button>
          }
        </div>
        @if (actionLabel()) {
          <div class="notification-action">
            @if (actionUrl()) {
              <a 
                [href]="actionUrl()" 
                class="action-link"
                (click)="onActionClick($event)"
              >
                {{ actionLabel() }} →
              </a>
            } @else {
              <button 
                type="button"
                class="action-button"
                (click)="onActionClick($event)"
              >
                {{ actionLabel() }} →
              </button>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .notification {
      display: inline-flex;
      flex-direction: column;
      padding: 1rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      border-radius: 0.5rem;
      background-color: white;
      border: 1px solid #e5e7eb;
      box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
      min-width: 320px;
      max-width: 400px;
    }

    .notification-main {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      width: 100%;
    }

    .notification-body {
      display: flex;
      align-items: flex-start;
    }

    .notification-icon {
      flex-shrink: 0;
      margin-right: 0.75rem;
      margin-top: 0.125rem;
      fill: currentColor;
    }

    .notification-content {
      flex: 1;
    }

    .notification-title {
      font-weight: 500;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }

    .notification-message {
      color: #6b7280;
    }

    .notification-close {
      margin-left: 0.75rem;
      flex-shrink: 0;
      color: #9ca3af;
      cursor: pointer;
      background: transparent;
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .notification-close:hover {
      color: #6b7280;
    }

    .close-icon {
      fill: currentColor;
    }

    .notification-action {
      margin-top: 0.75rem;
      padding-top: 0.75rem;
      border-top: 1px solid #e5e7eb;
    }

    .action-link,
    .action-button {
      color: #8b5cf6;
      font-weight: 500;
      text-decoration: none;
      background: transparent;
      border: none;
      padding: 0;
      cursor: pointer;
      font-size: 0.875rem;
    }

    .action-link:hover,
    .action-button:hover {
      color: #7c3aed;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    /* Icon colors */
    .icon-warning {
      color: #d97706;
    }

    .icon-success {
      color: #16a34a;
    }

    .icon-error {
      color: #dc2626;
    }

    .icon-info {
      color: #6366f1;
    }

    /* Dark mode support */
    @media (prefers-color-scheme: dark) {
      .notification {
        background-color: #1f2937;
        border-color: #374151;
      }

      .notification-title {
        color: #f3f4f6;
      }

      .notification-message {
        color: #9ca3af;
      }

      .notification-close {
        color: #6b7280;
      }

      .notification-close:hover {
        color: #9ca3af;
      }

      .notification-action {
        border-color: #374151;
      }
    }
  `],
})
export class NotificationComponent {
  /** The severity level of the notification */
  readonly severity = input<AlertSeverity>('info');

  /** The title of the notification */
  readonly title = input.required<string>();

  /** The message/description to display */
  readonly message = input.required<string>();

  /** Whether the notification can be dismissed */
  readonly dismissible = input<boolean>(true);

  /** Label for the action button/link */
  readonly actionLabel = input<string | null>(null);

  /** URL for the action (if provided, renders as a link) */
  readonly actionUrl = input<string | null>(null);

  /** Auto-close the notification after a delay */
  readonly autoClose = input<boolean>(false);

  /** Delay in milliseconds before auto-closing (default: 5000ms) */
  readonly autoCloseDelay = input<number>(5000);

  /** Emitted when the notification is dismissed */
  readonly dismissed = output<void>();

  /** Emitted when the action is clicked */
  readonly actionClicked = output<void>();

  /** Internal visibility state */
  readonly isVisible = signal(true);

  /** Computed CSS classes for the icon */
  readonly iconClasses = computed(() => {
    return `icon-${this.severity()}`;
  });

  constructor() {
    effect(() => {
      if (this.autoClose() && this.isVisible()) {
        const delay = this.autoCloseDelay();
        const timer = setTimeout(() => {
          this.dismiss();
        }, delay);

        return () => clearTimeout(timer);
      }
      return;
    });
  }

  /** Dismiss the notification */
  dismiss(): void {
    this.isVisible.set(false);
    this.dismissed.emit();
  }

  /** Show the notification (useful for programmatic control) */
  show(): void {
    this.isVisible.set(true);
  }

  /** Handle action click */
  onActionClick(event: Event): void {
    this.actionClicked.emit();
    // Don't prevent default if there's a URL - let the link work naturally
    if (!this.actionUrl()) {
      event.preventDefault();
    }
  }
}

