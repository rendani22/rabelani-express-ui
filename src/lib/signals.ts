/**
 * Signals: targets, alert bands, and the rule that orders the dashboard.
 *
 * The Signals view exists to answer "which number needs me today", so the
 * ranking is the product — a metric that is off target rises, one that is on
 * target sinks, and the page re-orders itself rather than presenting a fixed
 * grid at uniform weight. That rule lives here, as pure functions over
 * primitives, so it is covered by tests rather than only by looking at it.
 *
 * Every target and alert band is stated once. The card colour, the ordering,
 * and (later) the notification all read the same row, so they cannot disagree
 * the way three hand-written thresholds eventually would.
 */
import { formatZAR } from '@/lib/chart'

export type SignalLevel = 'good' | 'watch' | 'risk' | 'neutral'

/** Whether a bigger number is better (a rate) or worse (hours, breaches). */
export type SignalDirection = 'higher' | 'lower'

export type SignalUnit = 'percent' | 'hours' | 'count' | 'currency' | 'ratio'

export interface SignalThreshold {
  label: string
  direction: SignalDirection
  /** On or past this is `good`. */
  target: number
  /** Between this and the target is `watch`; past it is `risk`. */
  alert: number
  unit: SignalUnit
}

export type SignalKey =
  | 'perfectOrderRate'
  | 'onTime'
  | 'firstTimeRight'
  | 'podCompliance'
  | 'poAccuracy'
  | 'cycleP90'
  | 'tailRatio'
  | 'openBreaches'
  | 'valueAtRisk'
  | 'reverts'
  | 'coupaFailureRate'
  | 'unassignedLocation'
  | 'stockOuts'
  | 'topCustomerShare'

/**
 * The targets. Changing a number here changes the colour, the ordering and the
 * alert together — which is the point of them being in one table.
 *
 * The rate targets are deliberately not all 95%: a POD is either captured or it
 * is not (a process anyone can hit at 98%), whereas on-time depends on traffic,
 * drivers and customers being in. Setting them equal would make one of them a
 * permanent red that people learn to ignore.
 */
export const SIGNAL_TARGETS: Record<SignalKey, SignalThreshold> = {
  perfectOrderRate: { label: 'Perfect Order Rate', direction: 'higher', target: 95, alert: 90, unit: 'percent' },
  onTime: { label: 'On-time rate', direction: 'higher', target: 95, alert: 90, unit: 'percent' },
  firstTimeRight: { label: 'First-time-right', direction: 'higher', target: 98, alert: 95, unit: 'percent' },
  podCompliance: { label: 'POD compliance', direction: 'higher', target: 98, alert: 95, unit: 'percent' },
  poAccuracy: { label: 'PO accuracy', direction: 'higher', target: 100, alert: 98, unit: 'percent' },
  cycleP90: { label: 'Cycle time p90', direction: 'lower', target: 72, alert: 96, unit: 'hours' },
  // p90 ÷ p50. Above 3× the operation is inconsistent rather than slow, which
  // is a different problem with a different fix.
  tailRatio: { label: 'Consistency', direction: 'lower', target: 2, alert: 3, unit: 'ratio' },
  openBreaches: { label: 'Open SLA breaches', direction: 'lower', target: 0, alert: 5, unit: 'count' },
  valueAtRisk: { label: 'Value at risk', direction: 'lower', target: 0, alert: 50000, unit: 'currency' },
  reverts: { label: 'Overnight reverts', direction: 'lower', target: 0, alert: 3, unit: 'count' },
  coupaFailureRate: { label: 'Coupa PO failures', direction: 'lower', target: 0, alert: 2, unit: 'percent' },
  unassignedLocation: { label: 'No delivery location', direction: 'lower', target: 0, alert: 5, unit: 'count' },
  stockOuts: { label: 'Stock-outs blocking orders', direction: 'lower', target: 0, alert: 1, unit: 'count' },
  topCustomerShare: { label: 'Top customer share', direction: 'lower', target: 35, alert: 50, unit: 'percent' },
}

/**
 * Plain-English explanation of a signal, in three parts: what the number
 * counts, why it is worth looking at, and what actually moves it.
 *
 * Written for someone meeting the metric for the first time, so no term is
 * assumed — "p90" is "the slowest one in ten", not "the 90th percentile". The
 * third part matters most: a metric nobody knows how to move is a metric they
 * learn to scroll past.
 */
export interface SignalHint {
  what: string
  why: string
  moves: string
}

export const SIGNAL_HINTS: Record<SignalKey, SignalHint> = {
  perfectOrderRate: {
    what: 'Of every order that finished in the last 28 days, how many went through with nothing wrong: on time, not sent back, and with a signed proof of delivery on file. Purchase orders Coupa sent that never reached the system count against it too.',
    why: 'It is the one number that drops when any part of the job slips, so you do not have to watch four things to know how the month went.',
    moves: 'Whichever bar is biggest in "points lost to" — that is where the next fix pays most.',
  },
  onTime: {
    what: 'Of the orders that finished, how many never sat in one stage longer than allowed: 24 hours for pending, notified and in transit, 72 hours waiting at the collection point.',
    why: 'Late is usually the largest single reason an order is not perfect, and it is the one customers phone about.',
    moves: 'Getting orders picked up and dropped the same day. Watch overnight reverts — an order a driver still holds at 20:00 is often next week’s late one.',
  },
  firstTimeRight: {
    what: 'How many finished orders were not sent back — your return rate, the other way up.',
    why: 'A return costs the delivery twice, and it usually means something was already wrong before the parcel left: wrong address, wrong item, nobody there.',
    moves: 'Address and contact detail at intake. Nothing records *why* an order came back, so the worst location on the Executive tab is the best clue available.',
  },
  podCompliance: {
    what: 'Of the orders that were actually completed, how many have a proof-of-delivery document on file. Returns are left out — there was no delivery to evidence. The delivery photo is counted separately, underneath.',
    why: 'The POD is the only thing that settles a dispute. An order without one is delivered as far as you know, and undelivered as far as anyone can prove.',
    moves: 'Making sure every completion captures a signature. Where a driver dropped the order off, the picture is the second half of the evidence — that is the figure below this one.',
  },
  poAccuracy: {
    what: 'Of the purchase orders Coupa emailed over, how many became a Global PO by themselves instead of failing and needing someone to key them in by hand.',
    why: 'A failure is work you were given and never recorded. It is not late and not lost — it simply is not here, which means nothing else on this page can see it.',
    moves: 'The failure reasons on the Executive tab. Each reason is a different thing to go and fix.',
  },
  cycleP90: {
    what: 'How long the slowest one in ten orders takes, from being created to being collected. Nine out of ten finish faster than this. It is not the average.',
    why: 'An average hides your worst orders, and the worst orders are the ones that generate the phone calls.',
    moves: 'Finding where the time actually goes — waiting for pickup, out on the road, or sitting at the collection point.',
  },
  tailRatio: {
    what: 'How much longer the slowest tenth takes than a typical order. 2× means the slow ones take twice as long as normal.',
    why: 'It separates "we are slow" from "we are inconsistent". A high number means a handful of orders stall badly while the rest are fine.',
    moves: 'Chasing the stalled few, rather than trying to speed up everything.',
  },
  openBreaches: {
    what: 'Orders open right now that have sat in one stage past the time allowed. Counted live, as of this moment — not for the 28-day window.',
    why: 'Every one is a customer already waiting longer than they were promised.',
    moves: 'Work the SLA list on the Operations tab, oldest first.',
  },
  valueAtRisk: {
    what: 'What the orders currently past their SLA are worth, added together. Gross value of the goods.',
    why: 'It puts a figure on the delay: this is billable work that has stopped moving.',
    moves: 'The same as breaches — clear the oldest ones.',
  },
  reverts: {
    what: 'Orders a driver still had at the 20:00 cut-off, which the system sent back to the dispatch queue overnight. Last 7 days.',
    why: 'The earliest warning on this page. An order that goes back tonight is usually a late one next week, so this moves before the on-time rate does.',
    moves: 'A conversation with whoever is holding orders — usually a route that is too long, or a drop that keeps failing.',
  },
  coupaFailureRate: {
    what: 'The share of Coupa purchase-order emails in the last 30 days that failed to become a Global PO.',
    why: 'The most dangerous number here, because a failure leaves no trace in the system. The order is in someone’s inbox, not on any screen.',
    moves: 'Each failure carries a reason on the Executive tab, and each reason is a separate fix.',
  },
  unassignedLocation: {
    what: 'Open orders with no delivery location set.',
    why: 'Not a place — a hole in the record. These cannot be routed properly, and they drop out of every by-location report, so the geography figures are quietly short by this much.',
    moves: 'Set a location on each one.',
  },
  stockOuts: {
    what: 'Items showing zero stock that appear on an order still open.',
    why: 'An out-of-stock item nobody has ordered is a purchasing note. These are actually holding up work.',
    moves: 'Restock, or tell the customer.',
  },
  topCustomerShare: {
    what: 'The share of the last 28 days’ revenue that came from your single largest customer.',
    why: 'If one customer is most of the book, losing them is most of the business. Worth knowing; not worth watching daily.',
    moves: 'Nothing this week. This is a quarterly conversation, not a job.',
  },
}

/** Hours, in the depot's shorthand: minutes under an hour, days over two. */
export function formatHours(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${Math.round(h / 24)}d`
}

export function formatSignalValue(value: number | null, unit: SignalUnit): string {
  if (value == null) return '—'
  switch (unit) {
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'hours':
      return formatHours(value)
    case 'currency':
      return formatZAR(value, true)
    case 'ratio':
      return `${value.toFixed(2)}×`
    default:
      return new Intl.NumberFormat('en-ZA').format(value)
  }
}

/**
 * Where a reading sits against its band. A null reading is `neutral`, not
 * `risk` — "we have no data" and "we are failing" are different states, and
 * colouring the first as the second is how a dashboard teaches people to
 * distrust it.
 */
export function signalLevel(value: number | null, t: SignalThreshold): SignalLevel {
  if (value == null) return 'neutral'
  if (t.direction === 'higher') {
    if (value >= t.target) return 'good'
    return value >= t.alert ? 'watch' : 'risk'
  }
  if (value <= t.target) return 'good'
  return value <= t.alert ? 'watch' : 'risk'
}

/**
 * How far off target, normalised so unlike metrics can be ranked against each
 * other — a percentage and a rand figure have to be comparable for the page to
 * sort. Scaled by the distance from target to alert, so "one alert band out"
 * is 1.0 whatever the unit. Zero when on target or better.
 */
export function signalDistance(value: number | null, t: SignalThreshold): number {
  if (value == null) return 0
  const band = Math.abs(t.alert - t.target)
  // A zero-width band would divide by zero; fall back to the target's own
  // magnitude, and then to 1 so a 0/0 target still ranks by raw shortfall.
  const scale = band > 0 ? band : Math.max(Math.abs(t.target), 1)
  const shortfall = t.direction === 'higher' ? t.target - value : value - t.target
  return shortfall > 0 ? shortfall / scale : 0
}

const LEVEL_RANK: Record<SignalLevel, number> = { risk: 0, watch: 1, good: 2, neutral: 3 }

export interface SignalReading {
  key: SignalKey
  value: number | null
  /** Same metric, previous comparable period. Drives the delta. */
  prior?: number | null
  /** What to do when this is off target. Shown only when it is. */
  action?: string
  /** Secondary line — the counts behind the rate. */
  context?: string
}

export interface EvaluatedSignal {
  key: SignalKey
  label: string
  unit: SignalUnit
  direction: SignalDirection
  value: number | null
  display: string
  target: number
  targetDisplay: string
  level: SignalLevel
  distance: number
  /** Signed change vs the prior period, in the metric's own unit. */
  delta: number | null
  /** Whether the change was an improvement, given the metric's direction. */
  deltaGood: boolean
  /** Plain-English explanation, for the ⓘ beside the label. */
  hint: SignalHint
  action?: string
  context?: string
}

export function evaluateSignal(reading: SignalReading): EvaluatedSignal {
  const t = SIGNAL_TARGETS[reading.key]
  const prior = reading.prior ?? null
  const delta = reading.value != null && prior != null ? reading.value - prior : null
  return {
    key: reading.key,
    label: t.label,
    unit: t.unit,
    direction: t.direction,
    value: reading.value,
    display: formatSignalValue(reading.value, t.unit),
    target: t.target,
    targetDisplay: formatSignalValue(t.target, t.unit),
    level: signalLevel(reading.value, t),
    distance: signalDistance(reading.value, t),
    delta,
    deltaGood: delta == null ? false : t.direction === 'higher' ? delta >= 0 : delta <= 0,
    hint: SIGNAL_HINTS[reading.key],
    action: reading.action,
    context: reading.context,
  }
}

export function evaluateSignals(readings: SignalReading[]): EvaluatedSignal[] {
  return readings.map(evaluateSignal)
}

/**
 * The ordering rule: worst first. Risk before watch before good before neutral,
 * and within a level the reading furthest from its target leads. `sort` is
 * stable, so equally-placed metrics keep the order they were declared in.
 */
export function rankSignals(signals: EvaluatedSignal[]): EvaluatedSignal[] {
  return [...signals].sort((a, b) => {
    const byLevel = LEVEL_RANK[a.level] - LEVEL_RANK[b.level]
    return byLevel !== 0 ? byLevel : b.distance - a.distance
  })
}

/**
 * The "needs you today" list. Only things off target, worst first — an empty
 * array is the good outcome and the view should say so rather than render a
 * heading over nothing.
 */
export function needsAttention(signals: EvaluatedSignal[]): EvaluatedSignal[] {
  return rankSignals(signals.filter((s) => s.level === 'risk' || s.level === 'watch'))
}

/**
 * Percentage-point contributions to a shortfall, largest first, with zero
 * contributors dropped. The North Star's leak list: one number becomes a ranked
 * list of what to go and fix, which is the entire reason for the view.
 */
export function rankContributions(
  parts: Array<{ key: string; label: string; points: number }>,
): Array<{ key: string; label: string; points: number; share: number }> {
  const present = parts.filter((p) => p.points > 0)
  // Every survivor is positive, so `max` is too whenever this map runs — no
  // divide-by-zero guard is reachable here.
  const max = present.reduce((m, p) => Math.max(m, p.points), 0)
  return present
    .map((p) => ({ ...p, share: (p.points / max) * 100 }))
    .sort((a, b) => b.points - a.points)
}
