import {
  Component,
  computed,
  input,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonType = 'button' | 'submit' | 'reset';

/**
 * Button Component
 *
 * The shared button primitive. Prefer this over hand-rolled `<button>` markup so
 * every action shares the same sizing, focus ring, and press feedback.
 *
 * Feel details baked in:
 * - Scale-on-press (`active:scale-[0.96]`) for tactile feedback — pass `[static]="true"` to disable.
 * - Concentric `rounded-lg` radius matching the app's card/input radii.
 * - Icon-only buttons keep a ≥40x40px hit area.
 * - `focus-visible` ring (keyboard only), never on mouse click.
 * - Scoped transition (never `transition: all`).
 *
 * Native clicks bubble from the inner `<button>`, so bind `(click)` directly on `<app-button>`.
 *
 * @example
 * ```html
 * <app-button variant="primary" (click)="save()">Save</app-button>
 * <app-button variant="secondary" size="sm" [loading]="saving()">Saving…</app-button>
 * <app-button variant="ghost" [iconOnly]="true" ariaLabel="Close">
 *   <svg ...></svg>
 * </app-button>
 * ```
 */
@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.w-full]': 'fullWidth()',
    '[class.inline-flex]': '!fullWidth()',
  },
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [attr.aria-label]="ariaLabel() || null"
      [attr.aria-busy]="loading() ? 'true' : null"
      [class]="buttonClasses()"
    >
      @if (loading()) {
        <svg
          class="animate-spin shrink-0"
          [class.h-4]="size() !== 'lg'"
          [class.w-4]="size() !== 'lg'"
          [class.h-5]="size() === 'lg'"
          [class.w-5]="size() === 'lg'"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"></path>
        </svg>
      }
      <ng-content></ng-content>
    </button>
  `,
})
export class ButtonComponent {
  /** Visual style. */
  readonly variant = input<ButtonVariant>('primary');

  /** Size preset. */
  readonly size = input<ButtonSize>('md');

  /** Native button type — use 'submit' inside forms. */
  readonly type = input<ButtonType>('button');

  /** Disable the button. */
  readonly disabled = input<boolean>(false);

  /** Show a spinner and block interaction while an action is in flight. */
  readonly loading = input<boolean>(false);

  /** Stretch to fill the container width. */
  readonly fullWidth = input<boolean>(false);

  /** Square icon-only button — keeps a ≥40x40px hit area. Provide `ariaLabel`. */
  readonly iconOnly = input<boolean>(false);

  /** Accessible label — required for icon-only buttons that have no text. */
  readonly ariaLabel = input<string>('');

  /** Disable the scale-on-press animation where motion would be distracting.
   *  Bound as `[static]` in templates. */
  readonly noPress = input<boolean>(false, { alias: 'static' });

  private readonly base =
    'relative inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
    'whitespace-nowrap select-none transition duration-150 ease-out ' +
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
    'focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 ' +
    'disabled:cursor-not-allowed disabled:opacity-50';

  private readonly variantClasses: Record<ButtonVariant, string> = {
    primary:
      'bg-violet-500 text-white shadow-sm hover:bg-violet-600 ' +
      'focus-visible:ring-violet-400 disabled:hover:bg-violet-500',
    secondary:
      'bg-white text-gray-700 border border-gray-200 shadow-sm hover:bg-gray-50 hover:border-gray-300 ' +
      'dark:bg-gray-800/40 dark:text-gray-100 dark:border-gray-700/60 dark:hover:bg-gray-800 dark:hover:border-gray-600 ' +
      'focus-visible:ring-violet-400',
    ghost:
      'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-800 ' +
      'dark:text-gray-300 dark:hover:bg-gray-800/60 dark:hover:text-gray-100 ' +
      'focus-visible:ring-violet-400',
    danger:
      'bg-red-500 text-white shadow-sm hover:bg-red-600 ' +
      'focus-visible:ring-red-400 disabled:hover:bg-red-500',
  };

  /** Text-button paddings/heights per size. */
  private readonly textSizeClasses: Record<ButtonSize, string> = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-11 px-5 text-base',
  };

  /** Icon-only keeps square dimensions with a floor of 40px (md/lg). */
  private readonly iconSizeClasses: Record<ButtonSize, string> = {
    sm: 'h-9 w-9', // 36px — dense toolbars
    md: 'h-10 w-10', // 40px — hit-area floor
    lg: 'h-11 w-11', // 44px
  };

  readonly buttonClasses = computed(() => {
    const size = this.size();
    const sizing = this.iconOnly() ? this.iconSizeClasses[size] : this.textSizeClasses[size];
    const press = this.noPress() ? '' : 'active:scale-[0.96]';
    const width = this.fullWidth() ? 'w-full' : '';
    return [this.base, this.variantClasses[this.variant()], sizing, press, width]
      .filter(Boolean)
      .join(' ');
  });
}
