import {
  Component,
  computed,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReceiverProfile } from '../../../core';
import { ClickOutsideDirective } from '../../../shared/directives/outside-click.directive';

/**
 * Customer record card.
 *
 * A contact record for a package receiver. The whole card opens the customer's
 * package-history ledger (the primary lookup job); admin actions live in the ⋮ menu.
 * Identity is a monogram in the brand tint with a status ring — no decorative banner.
 *
 * Customer-specific by design: the shared `user-card` is left untouched for the
 * user-management / staff surfaces that use it.
 */
@Component({
  selector: 'app-customer-card',
  standalone: true,
  imports: [CommonModule, ClickOutsideDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="cust-card group relative overflow-hidden rounded-2xl border border-black/5 bg-white dark:border-white/10 dark:bg-gray-800/40 cursor-pointer"
      (click)="open($event)"
    >
      <!-- Identity -->
      <div class="flex items-start gap-3 p-4 pb-0">
        <span class="shrink-0">
          <span
            class="flex h-[46px] w-[46px] items-center justify-center rounded-full text-base font-semibold ring-2 ring-offset-2 ring-offset-white dark:ring-offset-gray-900"
            [ngClass]="active()
              ? 'bg-violet-100 text-violet-700 ring-violet-300 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/50'
              : 'bg-gray-100 text-gray-500 ring-gray-300 dark:bg-gray-700/50 dark:text-gray-400 dark:ring-gray-600'"
            aria-hidden="true"
          >{{ initials() }}</span>
        </span>

        <div class="min-w-0 flex-1 pt-0.5">
          <h3 class="truncate text-[15px] font-semibold tracking-tight text-gray-900 dark:text-gray-50">{{ fullName() }}</h3>
          <p class="mt-0.5 flex items-center gap-2 text-xs">
            <span class="tabular-nums text-gray-400 dark:text-gray-500">Customer since {{ since() }}</span>
            @if (!active()) {
              <span class="inline-flex items-center rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700/60 dark:text-gray-400">Dormant</span>
            }
          </p>
        </div>

        <!-- Menu -->
        <div class="relative shrink-0" (clickOutside)="closeMenu()">
          <button
            type="button"
            class="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            (click)="toggleMenu($event)"
            [attr.aria-expanded]="menuOpen()"
            aria-haspopup="true"
            [attr.aria-label]="'Actions for ' + fullName()"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>
            </svg>
          </button>

          @if (menuOpen()) {
            <div
              class="menu-pop absolute right-0 top-10 z-20 min-w-[188px] overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg dark:border-white/10 dark:bg-gray-800"
              role="menu"
              (click)="$event.stopPropagation()"
              (keydown.escape)="closeMenu()"
            >
              <button type="button" role="menuitem" class="menu-item" (click)="fire(editDetails, $event)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Edit details
              </button>
              <button type="button" role="menuitem" class="menu-item" (click)="fire(manageContacts, $event)">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                Manage contacts
              </button>
              <div class="my-1 h-px bg-black/5 dark:bg-white/10"></div>
              @if (active()) {
                <button type="button" role="menuitem" class="menu-item danger" (click)="fire(deactivate, $event)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m2 0v14a2 2 0 01-2 2H8a2 2 0 01-2-2V6"/></svg>
                  Deactivate
                </button>
              } @else {
                <button type="button" role="menuitem" class="menu-item" (click)="fire(reactivate, $event)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  Reactivate
                </button>
              }
            </div>
          }
        </div>
      </div>

      <!-- Notification channels -->
      <div class="flex flex-col gap-2 px-4 py-3.5">
        <div class="flex min-w-0 items-center gap-2.5 text-[12.5px] text-gray-500 dark:text-gray-400">
          <svg class="shrink-0 text-gray-400 dark:text-gray-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
          <span class="truncate">{{ receiver().email }}</span>
        </div>
        <div class="flex min-w-0 items-center gap-2.5 text-[12.5px] text-gray-500 dark:text-gray-400" [class.opacity-60]="!receiver().phone">
          <svg class="shrink-0 text-gray-400 dark:text-gray-500" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 5a2 2 0 012-2h3.3a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11 11 0 005.5 5.5l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.7 21 3 14.3 3 6z"/></svg>
          <span class="truncate">{{ receiver().phone || 'No phone on file' }}</span>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-stretch border-t border-black/5 dark:border-white/10">
        <button
          type="button"
          class="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-violet-600 transition-colors hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-500/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
          (click)="open($event)"
        >
          View history
          <svg class="arw" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
        <button
          type="button"
          class="flex w-12 items-center justify-center border-l border-black/5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-800 dark:border-white/10 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-400"
          (click)="fire(email, $event)"
          [attr.aria-label]="'Email ' + fullName()"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .cust-card {
      transition: transform .18s cubic-bezier(.23, 1, .32, 1), box-shadow .18s cubic-bezier(.23, 1, .32, 1);
    }
    .cust-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 0 0 1px rgba(9, 14, 25, .05), 0 1px 2px -1px rgba(9, 14, 25, .08), 0 6px 16px -6px rgba(9, 14, 25, .12);
    }
    .cust-card:active { transform: translateY(0) scale(.994); }
    :host-context(.dark) .cust-card:hover {
      box-shadow: 0 0 0 1px rgba(255, 255, 255, .09);
    }

    .arw { transition: transform .18s cubic-bezier(.23, 1, .32, 1); }
    .cust-card:hover .arw { transform: translateX(2px); }

    .menu-pop {
      animation: menu-in .15s cubic-bezier(.23, 1, .32, 1);
      transform-origin: top right;
    }
    @keyframes menu-in {
      from { opacity: 0; transform: scale(.96) translateY(-4px); }
      to   { opacity: 1; transform: none; }
    }

    .menu-item {
      display: flex;
      width: 100%;
      align-items: center;
      gap: 0.625rem;
      padding: 0.5rem 0.875rem;
      font-size: 0.8125rem;
      text-align: left;
      color: rgb(75 85 99);
      transition: background-color .15s, color .15s;
    }
    .menu-item:hover { background: rgb(249 250 251); color: rgb(17 24 39); }
    :host-context(.dark) .menu-item { color: rgb(209 213 219); }
    :host-context(.dark) .menu-item:hover { background: rgb(55 65 81 / .5); color: #fff; }
    .menu-item.danger { color: rgb(225 29 72); }
    .menu-item.danger:hover { background: rgb(225 29 72 / .08); }
    :host-context(.dark) .menu-item.danger { color: rgb(251 113 133); }
    :host-context(.dark) .menu-item.danger:hover { background: rgb(244 63 94 / .12); }

    @media (prefers-reduced-motion: reduce) {
      .cust-card, .arw { transition: none; }
      .cust-card:hover, .cust-card:active { transform: none; }
      .menu-pop { animation: none; }
    }
  `],
})
export class CustomerCardComponent {
  /** The receiver this card represents. */
  readonly receiver = input.required<ReceiverProfile>();

  /** Primary gesture — open the customer's package-history ledger. */
  readonly viewHistory = output<ReceiverProfile>();
  readonly email = output<ReceiverProfile>();
  readonly editDetails = output<ReceiverProfile>();
  readonly manageContacts = output<ReceiverProfile>();
  readonly deactivate = output<ReceiverProfile>();
  readonly reactivate = output<ReceiverProfile>();

  readonly menuOpen = signal(false);

  readonly active = computed(() => this.receiver().is_active);
  readonly fullName = computed(() => `${this.receiver().name} ${this.receiver().surname}`);

  readonly initials = computed(() => {
    const r = this.receiver();
    return `${r.name?.[0] ?? ''}${r.surname?.[0] ?? ''}`.toUpperCase() || '?';
  });

  readonly since = computed(() =>
    new Date(this.receiver().created_at).toLocaleDateString('en-US', {
      month: 'short',
      year: 'numeric',
    })
  );

  /** Open the package history (whole-card click + footer action). */
  open(event: Event): void {
    event.stopPropagation();
    this.viewHistory.emit(this.receiver());
  }

  toggleMenu(event: Event): void {
    event.stopPropagation();
    this.menuOpen.update(v => !v);
  }

  closeMenu(): void {
    this.menuOpen.set(false);
  }

  /** Close the menu and emit the given output with the receiver. */
  fire(emitter: { emit: (r: ReceiverProfile) => void }, event: Event): void {
    event.stopPropagation();
    this.closeMenu();
    emitter.emit(this.receiver());
  }
}
