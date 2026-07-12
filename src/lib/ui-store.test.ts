import { beforeEach, describe, expect, it } from 'vitest'
import { useUIStore } from './ui-store'

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({ mobileNavOpen: false, commandOpen: false })
  })

  it('toggles the mobile nav', () => {
    useUIStore.getState().setMobileNavOpen(true)
    expect(useUIStore.getState().mobileNavOpen).toBe(true)
    useUIStore.getState().setMobileNavOpen(false)
    expect(useUIStore.getState().mobileNavOpen).toBe(false)
  })

  it('sets and toggles the command palette', () => {
    useUIStore.getState().setCommandOpen(true)
    expect(useUIStore.getState().commandOpen).toBe(true)
    useUIStore.getState().toggleCommand()
    expect(useUIStore.getState().commandOpen).toBe(false)
    useUIStore.getState().toggleCommand()
    expect(useUIStore.getState().commandOpen).toBe(true)
  })
})
