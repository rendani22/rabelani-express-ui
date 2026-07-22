import type { RouteStop } from '@/components/dispatch'
import type { Package } from '@/lib/models/package'
import { PACKAGE_STATUS } from '@/lib/status'
import { formatDateTime } from '@/lib/format'

/** Linear order of the happy-path lifecycle used to derive the route line. */
const ORDER: string[] = [
  PACKAGE_STATUS.DRAFT,
  PACKAGE_STATUS.PENDING,
  PACKAGE_STATUS.NOTIFIED,
  PACKAGE_STATUS.IN_TRANSIT,
  PACKAGE_STATUS.READY_FOR_COLLECTION,
  PACKAGE_STATUS.COLLECTED,
]

function rank(status: string): number {
  const i = ORDER.indexOf(status)
  if (i >= 0) return i
  if (status === PACKAGE_STATUS.DELIVERED) return ORDER.length - 1
  return 0
}

interface Stage {
  key: string
  label: string
  detail?: string
}

/** The minimum a route line needs; both the staff model and the customer view satisfy it. */
interface TimelinePackage {
  status: string
  created_at: string
}

/**
 * One recorded status transition — structurally what `package_status_history`
 * rows carry. Declared here rather than imported so this module stays free of
 * the Supabase layer.
 */
export interface TimelineEvent {
  status: string
  changed_at: string
}

/**
 * When each status was *first* entered. A parcel can revisit a status (bounced
 * back to in_transit after a failed collection); the chain of custody stamps the
 * first arrival, so a later repeat never rewrites an earlier stop.
 */
function firstEntryTimes(history: TimelineEvent[]): Map<string, string> {
  const first = new Map<string, string>()
  for (const e of history) if (!first.has(e.status)) first.set(e.status, e.changed_at)
  return first
}

/**
 * The stamp for one stage. `draft` is the creation stop and always falls back to
 * the package's own `created_at`; the terminal stop accepts either completion
 * status because `delivered` and `collected` share it.
 */
function stampFor(key: string, pkg: TimelinePackage, times: Map<string, string>): string | undefined {
  const at =
    key === PACKAGE_STATUS.COLLECTED
      ? (times.get(PACKAGE_STATUS.COLLECTED) ?? times.get(PACKAGE_STATUS.DELIVERED))
      : times.get(key)
  if (at) return formatDateTime(at)
  return key === PACKAGE_STATUS.DRAFT ? formatDateTime(pkg.created_at) : undefined
}

/**
 * Walk the lifecycle stages against the package's current rank and mark each
 * one done / current / upcoming. Shared by the staff and customer route lines
 * so the two can never disagree about where a parcel is — only about how the
 * stops are worded.
 *
 * `history` is optional: without it only the creation stop carries a stamp
 * (the package model has no other reliable per-event time), with it every stop
 * the parcel has actually reached is stamped from its transition row.
 */
function buildStops(stages: Stage[], pkg: TimelinePackage, history: TimelineEvent[]): RouteStop[] {
  const current = rank(pkg.status)
  const terminal =
    pkg.status === PACKAGE_STATUS.COLLECTED || pkg.status === PACKAGE_STATUS.DELIVERED
  const times = firstEntryTimes(history)

  return stages.map((s) => {
    const r = rank(s.key)
    let state: RouteStop['state'] = 'upcoming'
    if (r < current) state = 'done'
    else if (r === current) state = terminal ? 'done' : 'current'
    return {
      label: s.label,
      detail: s.detail,
      state,
      // an upcoming stop hasn't happened, so it never carries a stamp even if a
      // stray history row exists for it
      timestamp: state === 'upcoming' ? undefined : stampFor(s.key, pkg, times),
    }
  })
}

/**
 * Derive a chain-of-custody route line from the package model. Stage order is
 * derived from the model's status (the Angular "derived timeline"); the stamps
 * come from `package_status_history` when the caller has loaded it.
 */
export function packageRouteStops(pkg: Package, history: TimelineEvent[] = []): RouteStop[] {
  const stops = buildStops(
    [
      { key: PACKAGE_STATUS.DRAFT, label: 'Package created', detail: 'Order registered at depot' },
      { key: PACKAGE_STATUS.NOTIFIED, label: 'Receiver notified' },
      { key: PACKAGE_STATUS.IN_TRANSIT, label: 'Picked up by driver', detail: 'On the road' },
      { key: PACKAGE_STATUS.READY_FOR_COLLECTION, label: 'Ready for collection', detail: 'At collection point' },
      { key: PACKAGE_STATUS.COLLECTED, label: 'Collected by receiver' },
    ],
    pkg,
    history,
  )

  if (pkg.status === PACKAGE_STATUS.RETURNED) {
    stops.push({
      label: 'Returned',
      detail: 'Package sent back',
      state: 'current',
      timestamp: returnedStamp(history),
    })
  }

  return stops
}

/** Stamp for the off-happy-path "Returned" stop, when the history records it. */
function returnedStamp(history: TimelineEvent[]): string | undefined {
  const at = firstEntryTimes(history).get(PACKAGE_STATUS.RETURNED)
  return at ? formatDateTime(at) : undefined
}

/**
 * The same route line, worded for the person waiting on the parcel rather than
 * the depot running it. The staff line names depot events ("Receiver notified",
 * "Picked up by driver"); a customer thinks in terms of their own journey, so
 * these mirror the customer-facing status labels in `status.ts`.
 */
export function customerRouteStops(pkg: TimelinePackage, history: TimelineEvent[] = []): RouteStop[] {
  const stops = buildStops(
    [
      { key: PACKAGE_STATUS.DRAFT, label: 'Order received', detail: 'We have your order' },
      { key: PACKAGE_STATUS.NOTIFIED, label: 'Being prepared', detail: 'Packed at the depot' },
      { key: PACKAGE_STATUS.IN_TRANSIT, label: 'On the way', detail: 'Out for delivery' },
      { key: PACKAGE_STATUS.READY_FOR_COLLECTION, label: 'Ready for collection', detail: 'Waiting at the collection point' },
      {
        key: PACKAGE_STATUS.COLLECTED,
        label: pkg.status === PACKAGE_STATUS.COLLECTED ? 'Collected' : 'Delivered',
      },
    ],
    pkg,
    history,
  )

  if (pkg.status === PACKAGE_STATUS.RETURNED) {
    stops.push({
      label: 'Returned',
      detail: 'Sent back to the depot',
      state: 'current',
      timestamp: returnedStamp(history),
    })
  }

  return stops
}
