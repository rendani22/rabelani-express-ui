import { Injectable, computed, signal } from '@angular/core';

/**
 * Preferred placement of the tour tooltip relative to the highlighted target.
 * The component will automatically flip the placement if there is not enough
 * room on screen.
 */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center';

/**
 * A single step in the product tour.
 *
 * `target` is a CSS selector. If the selector does not match anything when the
 * step becomes active the step is skipped automatically (useful for steps that
 * only apply on certain screen sizes, e.g. sidebar items on desktop).
 *
 * Set `target` to `null` for a centered, full-screen step (welcome / finish).
 */
export interface TourStep {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly target: string | null;
  readonly placement?: TourPlacement;
  /** Optional route to navigate to before this step is shown. */
  readonly route?: string;
}

const TOUR_COMPLETED_KEY = 'onboarding-tour-completed-v1';

/**
 * Default product tour for the Rabelani Express dashboard. Each `target`
 * selector references a `data-tour="…"` attribute that is wired up in the
 * matching templates (sidebar, header, dashboard actions, …).
 */
const DEFAULT_TOUR: readonly TourStep[] = [
  {
    id: 'welcome',
    title: '👋 Welcome to Rabelani Express',
    body: 'Take a quick 60-second tour to learn the essentials. You can skip at any time and restart it later from Settings.',
    target: null,
    placement: 'center',
  },
  {
    id: 'sidebar',
    title: 'Navigation',
    body: 'Use the sidebar to jump between Dashboard, Orders, Drivers, Inventory, Customers and more.',
    target: '[data-tour="sidebar"]',
    placement: 'right',
  },
  {
    id: 'dashboard-title',
    title: 'Your dashboard',
    body: 'This is your at-a-glance view of packages, drivers and inventory health for the selected date range.',
    target: '[data-tour="dashboard-title"]',
    placement: 'bottom',
  },
  {
    id: 'dashboard-search',
    title: 'Global search (⌘K)',
    body: 'Find any package, driver or customer instantly. You can also press ⌘K (Ctrl+K on Windows) from anywhere.',
    target: '[data-tour="global-search"]',
    placement: 'bottom',
  },
  {
    id: 'dashboard-create',
    title: 'Create a package',
    body: 'Click the + button to add a new package. You can print a QR label and assign a driver right after.',
    target: '[data-tour="create-package"]',
    placement: 'bottom',
  },
  {
    id: 'header-notifications',
    title: 'Notifications',
    body: 'Stay informed about new orders, driver pickups and delivery confirmations.',
    target: '[data-tour="notifications"]',
    placement: 'bottom',
  },
  {
    id: 'header-user',
    title: 'Your account',
    body: 'Open your profile menu to access Settings, switch theme or sign out.',
    target: '[data-tour="user-menu"]',
    placement: 'bottom',
  },
  {
    id: 'finish',
    title: '🎉 You are all set!',
    body: 'You can restart this tour anytime from Settings → About. Happy shipping!',
    target: null,
    placement: 'center',
  },
];

/**
 * Drives the first-time-user onboarding tour.
 *
 * Persists a "completed" flag in `localStorage` so the tour does not re-launch
 * on every login. Components listen to the `isActive` / `currentStep` signals
 * and render the spotlight + tooltip overlay (`OnboardingTourComponent`).
 */
@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  private readonly _steps = signal<readonly TourStep[]>(DEFAULT_TOUR);
  private readonly _stepIndex = signal(0);
  private readonly _isActive = signal(false);

  readonly steps = this._steps.asReadonly();
  readonly stepIndex = this._stepIndex.asReadonly();
  readonly isActive = this._isActive.asReadonly();
  readonly totalSteps = computed(() => this._steps().length);
  readonly currentStep = computed<TourStep | null>(() => {
    if (!this._isActive()) return null;
    return this._steps()[this._stepIndex()] ?? null;
  });
  readonly isFirstStep = computed(() => this._stepIndex() === 0);
  readonly isLastStep = computed(() => this._stepIndex() === this._steps().length - 1);

  /** Has the user already completed (or skipped) the tour at least once? */
  hasCompleted(): boolean {
    try {
      return localStorage.getItem(TOUR_COMPLETED_KEY) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Start the tour from step 0. If `force` is false (default) and the user has
   * already completed the tour, this is a no-op — used by the dashboard to
   * auto-launch only for first-time visitors.
   */
  start(force = false): void {
    if (!force && this.hasCompleted()) return;
    this._stepIndex.set(0);
    this._isActive.set(true);
  }

  /** Explicit restart — always starts the tour, ignoring the completed flag. */
  restart(): void {
    this.start(true);
  }

  next(): void {
    if (this._stepIndex() >= this._steps().length - 1) {
      this.complete();
      return;
    }
    this._stepIndex.update(i => i + 1);
  }

  previous(): void {
    if (this._stepIndex() === 0) return;
    this._stepIndex.update(i => i - 1);
  }

  goTo(index: number): void {
    const max = this._steps().length - 1;
    this._stepIndex.set(Math.max(0, Math.min(max, index)));
  }

  /** User dismissed the tour without finishing — still mark as completed. */
  skip(): void {
    this.complete();
  }

  /** Closes the tour and remembers that the user has seen it. */
  complete(): void {
    this._isActive.set(false);
    try {
      localStorage.setItem(TOUR_COMPLETED_KEY, 'true');
    } catch {
      // localStorage unavailable, fail silently
    }
  }

  /** Test/admin helper: clear the completed flag so the tour will run again. */
  resetCompletion(): void {
    try {
      localStorage.removeItem(TOUR_COMPLETED_KEY);
    } catch {
      // ignore
    }
  }
}

