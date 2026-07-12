import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ALL_TOUR_IDS,
  TOUR_LABELS,
  type TourId,
  hasCompletedTour,
  tourIdForPath,
  useTourStore,
} from './tour-store'

const KEY = 'tour-dashboard-completed-v1'

beforeEach(() => {
  localStorage.clear()
  useTourStore.setState({ activeTourId: null, steps: [], stepIndex: 0, isActive: false })
})
afterEach(() => vi.restoreAllMocks())

describe('registry metadata', () => {
  it('exposes ids and labels for every tour', () => {
    expect(ALL_TOUR_IDS).toEqual(['dashboard', 'orders', 'purchase-orders'])
    expect(TOUR_LABELS['purchase-orders']).toBe('Global PO')
  })
})

describe('tourIdForPath', () => {
  it('maps routes to their tour (PO before orders)', () => {
    expect(tourIdForPath('/dashboard')).toBe('dashboard')
    expect(tourIdForPath('/purchase-orders')).toBe('purchase-orders')
    expect(tourIdForPath('/orders')).toBe('orders')
    expect(tourIdForPath('/orders/completed')).toBe('orders')
    expect(tourIdForPath('/inventory')).toBeNull()
  })
})

describe('hasCompletedTour', () => {
  it('reflects the persisted flag', () => {
    expect(hasCompletedTour('dashboard')).toBe(false)
    localStorage.setItem(KEY, 'true')
    expect(hasCompletedTour('dashboard')).toBe(true)
  })

  it('returns false if localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(hasCompletedTour('dashboard')).toBe(false)
  })
})

describe('start / restart', () => {
  it('starts a fresh tour and no-ops once completed', () => {
    useTourStore.getState().start('dashboard')
    expect(useTourStore.getState().isActive).toBe(true)
    expect(useTourStore.getState().steps.length).toBeGreaterThan(0)

    // reset + mark completed → start is a no-op without force
    useTourStore.setState({ isActive: false })
    localStorage.setItem(KEY, 'true')
    useTourStore.getState().start('dashboard')
    expect(useTourStore.getState().isActive).toBe(false)

    // force overrides the completed flag
    useTourStore.getState().start('dashboard', true)
    expect(useTourStore.getState().isActive).toBe(true)
  })

  it('ignores an unknown tour id', () => {
    useTourStore.getState().start('nope' as TourId)
    expect(useTourStore.getState().isActive).toBe(false)
  })

  it('restart always starts, ignoring the completed flag', () => {
    localStorage.setItem(KEY, 'true')
    useTourStore.getState().restart('dashboard')
    expect(useTourStore.getState().isActive).toBe(true)
    expect(useTourStore.getState().stepIndex).toBe(0)
  })
})

describe('navigation', () => {
  it('advances and completes on the last step', () => {
    const store = useTourStore.getState()
    store.start('dashboard')
    const last = useTourStore.getState().steps.length - 1

    useTourStore.getState().next()
    expect(useTourStore.getState().stepIndex).toBe(1)

    useTourStore.getState().goTo(last)
    useTourStore.getState().next() // past the end → complete
    expect(useTourStore.getState().isActive).toBe(false)
    expect(localStorage.getItem(KEY)).toBe('true')
  })

  it('previous is a no-op at the first step and decrements otherwise', () => {
    useTourStore.getState().start('dashboard')
    useTourStore.getState().previous()
    expect(useTourStore.getState().stepIndex).toBe(0)
    useTourStore.getState().goTo(2)
    useTourStore.getState().previous()
    expect(useTourStore.getState().stepIndex).toBe(1)
  })

  it('goTo clamps to the valid range', () => {
    useTourStore.getState().start('dashboard')
    const max = useTourStore.getState().steps.length - 1
    useTourStore.getState().goTo(999)
    expect(useTourStore.getState().stepIndex).toBe(max)
    useTourStore.getState().goTo(-5)
    expect(useTourStore.getState().stepIndex).toBe(0)
  })

  it('skip marks the tour completed', () => {
    useTourStore.getState().start('dashboard')
    useTourStore.getState().skip()
    expect(useTourStore.getState().isActive).toBe(false)
    expect(hasCompletedTour('dashboard')).toBe(true)
  })
})

describe('complete / resetCompletion edge cases', () => {
  it('complete with no active tour just closes without persisting', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    useTourStore.setState({ activeTourId: null, isActive: true })
    useTourStore.getState().complete()
    expect(useTourStore.getState().isActive).toBe(false)
    expect(setItem).not.toHaveBeenCalled()
  })

  it('complete swallows localStorage failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    useTourStore.getState().start('dashboard')
    expect(() => useTourStore.getState().complete()).not.toThrow()
  })

  it('resetCompletion clears the flag and swallows failures', () => {
    localStorage.setItem(KEY, 'true')
    useTourStore.getState().resetCompletion('dashboard')
    expect(hasCompletedTour('dashboard')).toBe(false)

    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied')
    })
    expect(() => useTourStore.getState().resetCompletion('dashboard')).not.toThrow()
  })
})
