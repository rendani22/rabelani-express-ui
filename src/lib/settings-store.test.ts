import { beforeEach, describe, expect, it } from 'vitest'
import { REFRESH_INTERVAL_OPTIONS, useSettings } from './settings-store'

describe('useSettings', () => {
  beforeEach(() => {
    localStorage.clear()
    useSettings.getState().reset()
  })

  it('exposes sensible defaults', () => {
    const s = useSettings.getState()
    expect(s.autoRefreshEnabled).toBe(true)
    expect(s.autoRefreshInterval).toBe(30)
    expect(s.defaultOrdersFilter).toBe('all')
    expect(s.defaultDriversView).toBe('map')
    expect(s.compactMode).toBe(false)
  })

  it('applies partial updates', () => {
    useSettings.getState().update({ compactMode: true, autoRefreshInterval: 60 })
    expect(useSettings.getState().compactMode).toBe(true)
    expect(useSettings.getState().autoRefreshInterval).toBe(60)
    // untouched keys keep their value
    expect(useSettings.getState().defaultDriversView).toBe('map')
  })

  it('resets back to defaults', () => {
    useSettings.getState().update({ compactMode: true })
    useSettings.getState().reset()
    expect(useSettings.getState().compactMode).toBe(false)
  })

  it('publishes the refresh interval options', () => {
    expect(REFRESH_INTERVAL_OPTIONS.map((o) => o.value)).toEqual([15, 30, 60, 300])
  })
})
