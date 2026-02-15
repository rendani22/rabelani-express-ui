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
 * Banner Component
 *
 * A full-width alert banner that displays important messages to users.
 * Supports different severity levels and two style variants.
 *
 * @example
 * ```html
 * <app-banner
 *   severity="warning"
 *   message="System maintenance scheduled for tonight."
 *   [dismissible]="true"
 *   (dismissed)="onBannerDismissed()">
 * </app-banner>
 * ```
 */
@Component({
  selector: 'app-banner',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isVisible()) {
      <div role="alert" class="banner" [class]="containerClasses()">
        <div class="banner-content">
          <div class="banner-body">
            <svg 
              class="banner-icon" 
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
            <div class="banner-message" [class]="messageClasses()">
              {{ message() }}
            </div>
          </div>
          @if (dismissible()) {
            <button 
              type="button"
              class="banner-close" 
              [class]="closeButtonClasses()"
              (click)="dismiss()"
              aria-label="Close banner"
            >
              <span class="sr-only">Close</span>
              <svg class="close-icon" width="16" height="16" viewBox="0 0 16 16">
                <path d="M7.95 6.536l4.242-4.243a1 1 0 111.415 1.414L9.364 7.95l4.243 4.242a1 1 0 11-1.415 1.415L7.95 9.364l-4.243 4.243a1 1 0 01-1.414-1.415L6.536 7.95 2.293 3.707a1 1 0 011.414-1.414L7.95 6.536z"/>
              </svg>
            </button>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    .banner {
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      line-height: 1.25rem;
      border-radius: 0.375rem;
    }

    .banner-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }

    .banner-body {
      display: flex;
      align-items: flex-start;
    }

    .banner-icon {
      flex-shrink: 0;
      margin-right: 0.75rem;
      margin-top: 0.125rem;
      fill: currentColor;
    }

    .banner-message {
      flex: 1;
    }

    .banner-close {
      margin-left: 0.75rem;
      flex-shrink: 0;
      opacity: 0.7;
      cursor: pointer;
      background: transparent;
      border: none;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .banner-close:hover {
      opacity: 1;
    }

    .close-icon {
      fill: currentColor;
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

    /* Solid Variants */
    .banner-solid-warning {
      background-color: #eab308;
      color: white;
    }

    .banner-solid-success {
      background-color: #22c55e;
      color: white;
    }

    .banner-solid-error {
      background-color: #ef4444;
      color: white;
    }

    .banner-solid-info {
      background-color: #6366f1;
      color: white;
    }

    /* Soft Variants */
    .banner-soft-warning {
      background-color: #fef3c7;
      border: 1px solid #fcd34d;
      color: #92400e;
    }

    .banner-soft-success {
      background-color: #dcfce7;
      border: 1px solid #86efac;
      color: #166534;
    }

    .banner-soft-error {
      background-color: #fee2e2;
      border: 1px solid #fca5a5;
      color: #991b1b;
    }

    .banner-soft-info {
      background-color: #e0e7ff;
      border: 1px solid #a5b4fc;
      color: #3730a3;
    }

    /* Icon colors for soft variants */
    .icon-soft-warning {
      color: #d97706;
    }

    .icon-soft-success {
      color: #16a34a;
    }

    .icon-soft-error {
      color: #dc2626;
    }

    .icon-soft-info {
      color: #6366f1;
    }
  `],
})
export class BannerComponent {
  /** The severity level of the banner */
  readonly severity = input<AlertSeverity>('info');

  /** The message to display in the banner */
  readonly message = input.required<string>();

  /** Whether the banner can be dismissed */
  readonly dismissible = input<boolean>(true);

  /** Style variant: 'solid' for filled background, 'soft' for lighter background with border */
  readonly variant = input<'solid' | 'soft'>('solid');

  /** Auto-close the banner after a delay */
  readonly autoClose = input<boolean>(false);

  /** Delay in milliseconds before auto-closing (default: 5000ms) */
  readonly autoCloseDelay = input<number>(5000);

  /** Emitted when the banner is dismissed */
  readonly dismissed = output<void>();

  /** Internal visibility state */
  readonly isVisible = signal(true);

  /** Computed CSS classes for the container */
  readonly containerClasses = computed(() => {
    const v = this.variant();
    const s = this.severity();
    return `banner-${v}-${s}`;
  });

  /** Computed CSS classes for the icon */
  readonly iconClasses = computed(() => {
    if (this.variant() === 'soft') {
      return `icon-soft-${this.severity()}`;
    }
    return '';
  });

  /** Computed CSS classes for the message */
  readonly messageClasses = computed(() => {
    if (this.variant() === 'solid') {
      return 'font-medium';
    }
    return '';
  });

  /** Computed CSS classes for close button */
  readonly closeButtonClasses = computed(() => {
    return this.variant() === 'soft' ? `icon-soft-${this.severity()}` : '';
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

  /** Dismiss the banner */
  dismiss(): void {
    this.isVisible.set(false);
    this.dismissed.emit();
  }

  /** Show the banner (useful for programmatic control) */
  show(): void {
    this.isVisible.set(true);
  }
}

