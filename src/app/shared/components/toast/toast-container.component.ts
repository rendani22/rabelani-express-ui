import {
  Component,
  inject,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ToastComponent } from './toast.component';
import { ToastService } from './toast.service';

/**
 * Position options for the toast container
 */
export type ToastPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

/**
 * Toast Container Component
 *
 * A container component that displays toasts managed by the ToastService.
 * Add this component once to your app (e.g., in app.component.html).
 *
 * @example
 * ```html
 * <!-- In app.component.html -->
 * <app-toast-container position="top-right"></app-toast-container>
 * ```
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container" [class]="positionClasses()">
      @for (toast of toastService.toasts(); track toast.id) {
        <app-toast
          [severity]="toast.severity"
          [message]="toast.message"
          [variant]="toast.variant"
          [dismissible]="true"
          (dismissed)="toastService.dismiss(toast.id)"
        />
      }
    </div>
  `,
  styles: [`
    .toast-container {
      position: fixed;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      padding: 1rem;
      pointer-events: none;
    }

    .toast-container > * {
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
export class ToastContainerComponent {
  protected readonly toastService = inject(ToastService);

  /** Position of the toast container */
  readonly position = input<ToastPosition>('top-right');

  /** Computed position classes */
  positionClasses(): string {
    return `position-${this.position()}`;
  }
}

