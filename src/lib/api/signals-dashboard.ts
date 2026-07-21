/**
 * Signals dashboard data module.
 *
 * One RPC — `get_signal_metrics` — returns the Perfect Order Rate, its four
 * input levers, the live guardrails and a small business layer, all aggregated
 * server-side. This module maps that payload onto presentation shapes and does
 * nothing else; the targets, banding and ordering live in `@/lib/signals`.
 *
 * Unlike `fetchOperationsDashboard`, a failure throws rather than returning a
 * zeroed bundle. Every figure here is a rate against a target, and a zeroed
 * rate does not read as "no data" — it reads as total failure, which is the one
 * thing an absent payload cannot tell you. The view renders an error state.
 */
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'

/** Perfect Order Rate: the North Star, and where its missing points went. */
export interface NorthStar {
  /** Terminal orders in the window (collected + returned). */
  orders: number
  /** Orders that were on time, not returned, and have a POD on file. */
  clean: number
  /** Coupa POs dropped in the window — work never recorded, so never perfect. */
  coupaDropped: number
  /** orders + coupaDropped. */
  denominator: number
  /** Null when nothing completed in the window. */
  rate: number | null
  priorRate: number | null
  /**
   * Percentage points lost to each cause. Each failed order is attributed to
   * exactly one cause (returned → late → POD), so these sum to 100 − rate
   * rather than double-counting an order that failed several ways.
   */
  lost: {
    returned: number
    late: number
    pod: number
    poAccuracy: number
  }
}

/** A rate lever with its prior-period comparison. */
export interface RateInput {
  rate: number | null
  priorRate: number | null
  total: number
}

export interface OnTimeInput extends RateInput {
  late: number
}

export interface FirstTimeRightInput extends RateInput {
  returned: number
}

/**
 * `total` here is *completed* orders, not all terminal ones: returns are
 * excluded, because a returned order has no delivery to evidence and would
 * otherwise be counted as a POD failure. Matches the Executive tab's POD card.
 */
export interface PodInput extends RateInput {
  /**
   * Deliveries with a photo, over deliveries — collections are excluded, and
   * this does not gate `rate`. Weak evidence is not the same as no POD.
   */
  photoRate: number | null
  /** Orders with a POD document on file. */
  compliant: number
  /**
   * Orders whose POD is locked. Reported, not required: nothing in the product
   * currently sets `pods.is_locked`, so gating on it read as 0% for everything.
   */
  locked: number
  deliveries: number
  deliveriesWithPhoto: number
}

/** Coupa ingestion. Network-wide; `available` is false when company-scoped. */
export interface PoAccuracyInput {
  available: boolean
  rate: number | null
  processed: number
  failed: number
}

export interface CycleTimeInput {
  p50: number | null
  p90: number | null
  priorP90: number | null
  /** p90 ÷ p50 — consistency, not speed. Above 3× is a tail problem. */
  tailRatio: number | null
  sample: number
}

export interface SignalInputs {
  onTime: OnTimeInput
  firstTimeRight: FirstTimeRightInput
  podCompliance: PodInput
  poAccuracy: PoAccuracyInput
  cycleTime: CycleTimeInput
}

/** One week of the trend. Rates are null for a week with no orders. */
export interface SignalWeek {
  week: string
  orders: number
  clean: number
  rate: number | null
  onTime: number | null
  firstTimeRight: number | null
  pod: number | null
  p50: number | null
  p90: number | null
}

/** Live floors. Mostly leading indicators — they predict next week's rate. */
export interface SignalGuardrails {
  openBreaches: number
  worstBreachHours: number | null
  openOrders: number
  valueAtRisk: number
  reverts7d: number
  revertDrivers: number
  worstDriverName: string | null
  worstDriverReverts: number | null
  coupaAvailable: boolean
  coupaWindowDays: number
  coupaFailed: number
  coupaFailureRate: number | null
  unassignedLocation: number
  stockOutsBlocking: number
}

export interface SignalBusiness {
  /** Gross revenue. There is no cost_price anywhere — nothing here is margin. */
  revenue: number
  priorRevenue: number
  orders: number
  perPerfectOrder: number | null
  topCustomerShare: number | null
  /** False when company-scoped: purchase_orders carries no customer link. */
  orderBookAvailable: boolean
  orderBookValue: number
  orderBookCount: number
}

export interface SignalsDashboardData {
  weeks: number
  /** Length of the headline comparison window, in days (both sides). */
  periodDays: number
  companyScoped: boolean
  generatedAt: Date
  northStar: NorthStar
  inputs: SignalInputs
  series: SignalWeek[]
  guardrails: SignalGuardrails
  business: SignalBusiness
}

/** Raw payload shape — same fields, dates still strings. */
type SignalMetricsPayload = Omit<SignalsDashboardData, 'generatedAt'> & {
  generatedAt: string
}

/**
 * Load the Signals bundle.
 *
 * `p_weeks` sizes the sparkline window only; the headline figures are always a
 * rolling 28 days against the preceding 28, decided server-side so the two
 * sides of every comparison are the same length.
 */
export async function fetchSignalsDashboard(
  companyId?: string | null,
  weeks = 12,
): Promise<SignalsDashboardData> {
  const { data, error } = await supabase.rpc('get_signal_metrics', {
    p_weeks: weeks,
    p_company_id: companyId ?? null,
  })

  if (error || !data) {
    logger.error(error, { op: 'signalsDashboard.get_signal_metrics' })
    throw error ?? new Error('No signal metrics returned.')
  }

  const payload = data as unknown as SignalMetricsPayload
  return {
    ...payload,
    generatedAt: new Date(payload.generatedAt),
  }
}
