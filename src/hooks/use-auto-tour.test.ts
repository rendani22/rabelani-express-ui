import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useTourStore } from '@/lib/tour-store'
import { useAutoTour } from './use-auto-tour'

describe('useAutoTour', () => {
  beforeEach(() => {
    localStorage.clear()
    useTourStore.setState({ activeTourId: null, steps: [], stepIndex: 0, isActive: false })
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('starts the tour after the mount delay', () => {
    renderHook(() => useAutoTour('orders'))
    expect(useTourStore.getState().isActive).toBe(false) // not yet
    act(() => vi.advanceTimersByTime(500))
    expect(useTourStore.getState().isActive).toBe(true)
    expect(useTourStore.getState().activeTourId).toBe('orders')
  })

  it('cancels the pending start if unmounted early', () => {
    const { unmount } = renderHook(() => useAutoTour('orders'))
    unmount()
    act(() => vi.advanceTimersByTime(500))
    expect(useTourStore.getState().isActive).toBe(false)
  })
})
