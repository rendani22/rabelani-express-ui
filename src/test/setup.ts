import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// jsdom doesn't implement matchMedia; next-themes (and others) call it on mount.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

// jsdom doesn't implement IntersectionObserver; the customer portal's infinite
// scroll observes a sentinel. Never intersects here, so tests drive the list's
// "Load more" button instead — which is the same path a keyboard user takes.
if (!('IntersectionObserver' in window)) {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ''
      thresholds = []
    },
  )
}

// jsdom stubs that Radix (dropdowns/dialogs) relies on but jsdom lacks.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = vi.fn()
if (!Element.prototype.hasPointerCapture) Element.prototype.hasPointerCapture = vi.fn(() => false)
if (!Element.prototype.setPointerCapture) Element.prototype.setPointerCapture = vi.fn()
if (!Element.prototype.releasePointerCapture) Element.prototype.releasePointerCapture = vi.fn()

// Unmount React trees between tests so DOM queries don't leak across cases.
afterEach(() => cleanup())
