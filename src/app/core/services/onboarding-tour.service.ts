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

/** Identifier for a registered tour. Add new ones to {@link TOUR_REGISTRY}. */
export type TourId = 'dashboard' | 'orders';

interface TourDefinition {
  readonly id: TourId;
  readonly storageKey: string;
  readonly steps: readonly TourStep[];
}

/** Default product tour shown the first time a user lands on the dashboard. */
const DASHBOARD_TOUR: TourDefinition = {
  id: 'dashboard',
  storageKey: 'onboarding-tour-completed-v1',
  steps: [
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
      body: 'You can restart this tour anytime from Settings → Help & Onboarding. Happy shipping!',
      target: null,
      placement: 'center',
    },
  ],
};

/** Tour shown the first time a user opens the Orders page. */
const ORDERS_TOUR: TourDefinition = {
  id: 'orders',
  storageKey: 'onboarding-tour-orders-completed-v1',
  steps: [
    {
      id: 'welcome',
      title: '📦 Managing your orders',
      body: 'A quick walkthrough of the Orders page — search, filter, create and track packages from one screen.',
      target: null,
      placement: 'center',
    },
    {
      id: 'search',
      title: 'Search packages',
      body: 'Find a package by PO number or receiver name. Results filter as you type.',
      target: '[data-tour-orders="search"]',
      placement: 'bottom',
    },
    {
      id: 'status-filter',
      title: 'Filter by status',
      body: 'Narrow the list to Pending, In Transit, Ready for Pickup or Completed. Your default filter can be set in Settings.',
      target: '[data-tour-orders="status-filter"]',
      placement: 'bottom',
    },
    {
      id: 'refresh',
      title: 'Refresh',
      body: 'Reload the latest packages from the server. Auto-refresh can be enabled in Settings.',
      target: '[data-tour-orders="refresh"]',
      placement: 'bottom',
    },
    {
      id: 'add-package',
      title: 'Create a new order',
      body: 'Add a package, generate a QR label and assign a driver right after creation.',
      target: '[data-tour-orders="add-package"]',
      placement: 'left',
    },
    {
      id: 'table',
      title: 'Your packages',
      body: 'Click any row to see full details, update its status, view the POD or print the QR code. Use the checkboxes to select multiple rows for bulk actions.',
      target: '[data-tour-orders="table"]',
      placement: 'top',
    },
    {
      id: 'pagination',
      title: 'Pagination',
      body: 'Browse through your packages and adjust the page size to fit your workflow.',
      target: '[data-tour-orders="pagination"]',
      placement: 'top',
    },
    {
      id: 'finish',
      title: '🚀 You are ready to ship',
      body: 'You can replay this tour anytime from Settings → Help & Onboarding.',
      target: null,
      placement: 'center',
    },
  ],
};

const TOUR_REGISTRY: Readonly<Record<TourId, TourDefinition>> = {
  dashboard: DASHBOARD_TOUR,
  orders: ORDERS_TOUR,
};

/**
 * Drives first-time-user onboarding tours across the app. Multiple named tours
 * are registered (see {@link TourId}), each with its own completion flag in
 * `localStorage`. Components listen to `isActive` / `currentStep` and render
 * the spotlight + tooltip overlay (`OnboardingTourComponent`).
 */
@Injectable({ providedIn: 'root' })
export class OnboardingTourService {
  private readonly _activeTourId = signal<TourId | null>(null);
  private readonly _steps = signal<readonly TourStep[]>([]);
  private readonly _stepIndex = signal(0);
  private readonly _isActive = signal(false);

  readonly steps = this._steps.asReadonly();
  readonly stepIndex = this._stepIndex.asReadonly();
  readonly isActive = this._isActive.asReadonly();
  readonly activeTourId = this._activeTourId.asReadonly();
  readonly totalSteps = computed(() => this._steps().length);
  readonly currentStep = computed<TourStep | null>(() => {
    if (!this._isActive()) return null;
    return this._steps()[this._stepIndex()] ?? null;
  });
  readonly isFirstStep = computed(() => this._stepIndex() === 0);
  readonly isLastStep = computed(() => this._stepIndex() === this._steps().length - 1);

  /** Has the user already completed (or skipped) the named tour at least once? */
  hasCompleted(tourId: TourId): boolean {
    try {
      return localStorage.getItem(TOUR_REGISTRY[tourId].storageKey) === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Start the named tour from step 0. If `force` is false (default) and the
   * user has already completed the tour, this is a no-op — used by feature
   * pages to auto-launch only for first-time visitors.
   */
  start(tourId: TourId, force = false): void {
    const def = TOUR_REGISTRY[tourId];
    if (!def) return;
    if (!force && this.hasCompleted(tourId)) return;
    this._activeTourId.set(tourId);
    this._steps.set(def.steps);
    this._stepIndex.set(0);
    this._isActive.set(true);
  }

  /** Explicit restart — always starts the tour, ignoring the completed flag. */
  restart(tourId: TourId): void {
    this.start(tourId, true);
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

  /** Closes the active tour and remembers that the user has seen it. */
  complete(): void {
    const id = this._activeTourId();
    this._isActive.set(false);
    if (!id) return;
    try {
      localStorage.setItem(TOUR_REGISTRY[id].storageKey, 'true');
    } catch {
      // localStorage unavailable, fail silently
    }
  }

  /** Test/admin helper: clear the completed flag so the tour will run again. */
  resetCompletion(tourId: TourId): void {
    try {
      localStorage.removeItem(TOUR_REGISTRY[tourId].storageKey);
    } catch {
      // ignore
    }
  }
}

