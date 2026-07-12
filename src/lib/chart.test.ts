import { describe, expect, it } from 'vitest'
import { CHART_COLORS, formatCompact, formatZAR, statusColor } from './chart'
import { PACKAGE_STATUS } from './status'

describe('statusColor', () => {
  it('maps status tones to chart palette variables', () => {
    expect(statusColor(PACKAGE_STATUS.IN_TRANSIT)).toBe(CHART_COLORS.primary)
    expect(statusColor(PACKAGE_STATUS.NOTIFIED)).toBe(CHART_COLORS.route)
    expect(statusColor(PACKAGE_STATUS.DELIVERED)).toBe(CHART_COLORS.success)
    expect(statusColor(PACKAGE_STATUS.READY_FOR_COLLECTION)).toBe(CHART_COLORS.warning)
    expect(statusColor(PACKAGE_STATUS.PENDING)).toBe(CHART_COLORS.steel)
    expect(statusColor(PACKAGE_STATUS.RETURNED)).toBe('var(--destructive)')
  })

  it('uses the neutral colour for unknown statuses', () => {
    expect(statusColor('unknown')).toBe(CHART_COLORS.steel)
  })
})

describe('formatCompact', () => {
  it('formats large numbers compactly', () => {
    // en-ZA uses a comma decimal separator, e.g. "1,5K"
    expect(formatCompact(1500)).toMatch(/1[.,]5\s?K/i)
  })
})

describe('formatZAR', () => {
  it('formats standard currency by default', () => {
    const out = formatZAR(1234)
    expect(out).toContain('R')
    expect(out).toContain('1')
  })

  it('formats compact currency when requested', () => {
    expect(formatZAR(2_000_000, true)).toMatch(/2[.,]0\s?M/i)
  })
})
