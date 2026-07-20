import type { PackageStatus } from '@/lib/status'
import type { StatusTone } from '@/lib/status'
import { statusMeta } from '@/lib/status'

/**
 * Dispatch chart palette — CSS variables so charts follow light/dark theme.
 * Recharts accepts `var(--...)` strings for fill/stroke.
 */
export const CHART_COLORS = {
  primary: 'var(--chart-1)', // cargo orange
  route: 'var(--chart-2)', // route blue
  success: 'var(--chart-3)', // delivered green
  warning: 'var(--chart-4)', // caution amber
  steel: 'var(--chart-5)', // neutral steel
} as const

const TONE_COLOR: Record<StatusTone, string> = {
  neutral: CHART_COLORS.steel,
  route: CHART_COLORS.route,
  transit: CHART_COLORS.primary,
  wait: CHART_COLORS.warning,
  done: CHART_COLORS.success,
  alert: 'var(--destructive)',
}

/** Color for a package status, matching its StatusStamp tone. */
export function statusColor(status: PackageStatus | string): string {
  return TONE_COLOR[statusMeta(status).tone]
}

/** Format a number compactly for axis ticks / big figures. */
export function formatCompact(n: number): string {
  return new Intl.NumberFormat('en-ZA', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

/** Rand currency formatter for the executive view. */
export function formatZAR(n: number, compact = false): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    notation: compact ? 'compact' : 'standard',
    maximumFractionDigits: compact ? 1 : 0,
  }).format(n)
}
