import { describe, expect, it } from 'vitest'
import { DRIVER_STATUS } from './driver-status'

describe('DRIVER_STATUS', () => {
  it('defines meta for every driver status', () => {
    expect(Object.keys(DRIVER_STATUS).sort()).toEqual(['available', 'offline', 'on_delivery'])
  })

  it('carries a label, tailwind classes and a map colour for each', () => {
    for (const meta of Object.values(DRIVER_STATUS)) {
      expect(meta.label).toBeTruthy()
      expect(meta.text).toMatch(/^text-/)
      expect(meta.dot).toMatch(/^bg-/)
      expect(meta.chip).toContain('border')
      expect(meta.color).toMatch(/^var\(--/)
    }
  })
})
