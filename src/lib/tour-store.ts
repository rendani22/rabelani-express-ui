import { create } from 'zustand'

/**
 * Onboarding product tours (ported from the Angular `OnboardingTourService`).
 *
 * Each named tour has its own completion flag in `localStorage`, so a
 * first-time visitor to a page auto-sees its tour exactly once. The overlay
 * component (`OnboardingTour`) subscribes to this store and renders the
 * spotlight + tooltip. UI-only state lives here, alongside the other Zustand
 * stores in `src/lib/` — server state stays in TanStack Query.
 */

/** Preferred placement of the tooltip; the overlay auto-flips if it won't fit. */
export type TourPlacement = 'top' | 'bottom' | 'left' | 'right' | 'center'

/**
 * A single step. `target` is a CSS selector; if it resolves to nothing when the
 * step activates the step auto-skips (handy for elements hidden on mobile).
 * A `null` target renders a centered, full-screen step (welcome / finish).
 */
export interface TourStep {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly target: string | null
  readonly placement?: TourPlacement
  /** Optional route to navigate to before the step is shown. */
  readonly route?: string
}

/** Registered tours. Add new ones to {@link TOUR_REGISTRY}. */
export type TourId = 'dashboard' | 'orders' | 'purchase-orders'

interface TourDefinition {
  readonly id: TourId
  readonly storageKey: string
  readonly steps: readonly TourStep[]
}

/** Shown the first time a user lands on the dashboard. */
const DASHBOARD_TOUR: TourDefinition = {
  id: 'dashboard',
  storageKey: 'tour-dashboard-completed-v1',
  steps: [
    {
      id: 'welcome',
      title: '👋 Welcome to Dispatch',
      body: 'Take a quick 60-second tour to learn the essentials. You can skip anytime and replay it later from Settings or the Help menu.',
      target: null,
      placement: 'center',
    },
    {
      id: 'sidebar',
      title: 'Navigation',
      body: 'Jump between Dashboard, Global PO, Orders, Inventory, Drivers, Customers and more from the sidebar.',
      target: '[data-tour="sidebar"]',
      placement: 'right',
    },
    {
      id: 'dashboard-title',
      title: 'Your dashboard',
      body: 'An at-a-glance view of packages, drivers and inventory health. Switch between the Operations and Executive views with the tabs below.',
      target: '[data-tour="dashboard-title"]',
      placement: 'bottom',
    },
    {
      id: 'global-search',
      title: 'Global search (⌘K)',
      body: 'Find any package, driver or customer instantly. Press ⌘K (Ctrl+K on Windows) from anywhere.',
      target: '[data-tour="global-search"]',
      placement: 'bottom',
    },
    {
      id: 'notifications',
      title: 'Notifications',
      body: 'Stay across new orders, driver pickups and delivery confirmations.',
      target: '[data-tour="notifications"]',
      placement: 'bottom',
    },
    {
      id: 'help',
      title: 'Help & tours',
      body: 'Stuck? Reach support or replay any product tour from here at any time.',
      target: '[data-tour="help-menu"]',
      placement: 'bottom',
    },
    {
      id: 'user-menu',
      title: 'Your account',
      body: 'Open your profile menu for Settings, theme switching and sign out.',
      target: '[data-tour="user-menu"]',
      placement: 'bottom',
    },
    {
      id: 'finish',
      title: '🎉 You are all set!',
      body: 'Replay this tour anytime from Settings → Help & onboarding. Happy shipping!',
      target: null,
      placement: 'center',
    },
  ],
}

/** Shown the first time a user opens the Orders page. */
const ORDERS_TOUR: TourDefinition = {
  id: 'orders',
  storageKey: 'tour-orders-completed-v1',
  steps: [
    {
      id: 'welcome',
      title: '📦 Managing your orders',
      body: 'A quick walkthrough of the Orders page — search, filter, create and track every package from one screen.',
      target: null,
      placement: 'center',
    },
    {
      id: 'search',
      title: 'Search packages',
      body: 'Find a package by reference, PO number, receiver or item. Results filter as you type.',
      target: '[data-tour="orders-search"]',
      placement: 'bottom',
    },
    {
      id: 'status',
      title: 'Filter by status',
      body: 'Narrow the list to Pending, In Transit, Ready for Collection or Completed. Set your default filter in Settings.',
      target: '[data-tour="orders-status"]',
      placement: 'bottom',
    },
    {
      id: 'refresh',
      title: 'Refresh',
      body: 'Reload the latest packages from the server. Auto-refresh can be enabled in Settings.',
      target: '[data-tour="orders-refresh"]',
      placement: 'bottom',
    },
    {
      id: 'create',
      title: 'Create a new order',
      body: 'Add a package, generate a QR label and assign a driver right after creation.',
      target: '[data-tour="orders-create"]',
      placement: 'left',
    },
    {
      id: 'table',
      title: 'Your packages',
      body: 'Click any row for full details — update status, view the POD or print the QR code.',
      target: '[data-tour="orders-table"]',
      placement: 'top',
    },
    {
      id: 'pagination',
      title: 'Pagination',
      body: 'Browse through packages and adjust the page size to fit your workflow.',
      target: '[data-tour="orders-pagination"]',
      placement: 'top',
    },
    {
      id: 'finish',
      title: '🚀 You are ready to ship',
      body: 'Replay this tour anytime from Settings → Help & onboarding.',
      target: null,
      placement: 'center',
    },
  ],
}

/** Shown the first time a user opens the Global PO page. */
const PURCHASE_ORDERS_TOUR: TourDefinition = {
  id: 'purchase-orders',
  storageKey: 'tour-purchase-orders-completed-v1',
  steps: [
    {
      id: 'welcome',
      title: '📋 Global PO',
      body: 'Every purchase order with its linked orders and inventory in one place. Here is a quick tour.',
      target: null,
      placement: 'center',
    },
    {
      id: 'stats',
      title: 'PO at a glance',
      body: 'Live totals across all purchase orders — active, completed, drafts, and the orders and inventory they link.',
      target: '[data-tour="po-stats"]',
      placement: 'bottom',
    },
    {
      id: 'search',
      title: 'Search',
      body: 'Find a PO by number, or by any linked order reference, receiver or inventory item.',
      target: '[data-tour="po-search"]',
      placement: 'bottom',
    },
    {
      id: 'status',
      title: 'Filter by status',
      body: 'Focus on In progress, Completed, Draft or Mixed purchase orders.',
      target: '[data-tour="po-status"]',
      placement: 'left',
    },
    {
      id: 'create',
      title: 'Create a PO',
      body: 'Open a new purchase order, then link orders and inventory to it.',
      target: '[data-tour="po-create"]',
      placement: 'left',
    },
    {
      id: 'list',
      title: 'Your purchase orders',
      body: 'Each card shows a PO with its linked orders and items. Click to expand or edit.',
      target: '[data-tour="po-list"]',
      placement: 'top',
    },
    {
      id: 'finish',
      title: '✅ That is Global PO',
      body: 'Replay this tour anytime from Settings → Help & onboarding.',
      target: null,
      placement: 'center',
    },
  ],
}

const TOUR_REGISTRY: Readonly<Record<TourId, TourDefinition>> = {
  dashboard: DASHBOARD_TOUR,
  orders: ORDERS_TOUR,
  'purchase-orders': PURCHASE_ORDERS_TOUR,
}

/** Human label for a tour — used by the Settings replay list. */
export const TOUR_LABELS: Readonly<Record<TourId, string>> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  'purchase-orders': 'Global PO',
}

export const ALL_TOUR_IDS = Object.keys(TOUR_REGISTRY) as TourId[]

/** Has the user already completed (or skipped) the named tour? */
export function hasCompletedTour(id: TourId): boolean {
  try {
    return localStorage.getItem(TOUR_REGISTRY[id].storageKey) === 'true'
  } catch {
    return false
  }
}

/** Which tour, if any, belongs to a given route path. */
export function tourIdForPath(pathname: string): TourId | null {
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/purchase-orders')) return 'purchase-orders'
  if (pathname.startsWith('/orders')) return 'orders'
  return null
}

interface TourState {
  activeTourId: TourId | null
  steps: readonly TourStep[]
  stepIndex: number
  isActive: boolean
  /** Start a tour from step 0. No-op if already completed (unless `force`). */
  start: (id: TourId, force?: boolean) => void
  /** Always start, ignoring the completed flag. */
  restart: (id: TourId) => void
  next: () => void
  previous: () => void
  goTo: (index: number) => void
  /** Dismiss without finishing — still marks completed. */
  skip: () => void
  /** Close and remember the tour was seen. */
  complete: () => void
  /** Clear the completed flag so the tour runs again. */
  resetCompletion: (id: TourId) => void
}

export const useTourStore = create<TourState>((set, get) => ({
  activeTourId: null,
  steps: [],
  stepIndex: 0,
  isActive: false,

  start: (id, force = false) => {
    const def = TOUR_REGISTRY[id]
    if (!def) return
    if (!force && hasCompletedTour(id)) return
    set({ activeTourId: id, steps: def.steps, stepIndex: 0, isActive: true })
  },

  restart: (id) => get().start(id, true),

  next: () => {
    const { stepIndex, steps } = get()
    if (stepIndex >= steps.length - 1) {
      get().complete()
      return
    }
    set({ stepIndex: stepIndex + 1 })
  },

  previous: () => {
    const { stepIndex } = get()
    if (stepIndex === 0) return
    set({ stepIndex: stepIndex - 1 })
  },

  goTo: (index) => {
    const max = get().steps.length - 1
    set({ stepIndex: Math.max(0, Math.min(max, index)) })
  },

  skip: () => get().complete(),

  complete: () => {
    const id = get().activeTourId
    set({ isActive: false })
    if (!id) return
    try {
      localStorage.setItem(TOUR_REGISTRY[id].storageKey, 'true')
    } catch {
      // localStorage unavailable — fail silently
    }
  },

  resetCompletion: (id) => {
    try {
      localStorage.removeItem(TOUR_REGISTRY[id].storageKey)
    } catch {
      // ignore
    }
  },
}))
