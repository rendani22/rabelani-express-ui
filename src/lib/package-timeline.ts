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
 * Walk the lifecycle stages against the package's current rank and mark each
 * one done / current / upcoming. Shared by the staff and customer route lines
 * so the two can never disagree about where a parcel is — only about how the
 * stops are worded.
 */
function buildStops(stages: Stage[], pkg: TimelinePackage): RouteStop[] {
  const current = rank(pkg.status)
  const terminal =
    pkg.status === PACKAGE_STATUS.COLLECTED || pkg.status === PACKAGE_STATUS.DELIVERED

  return stages.map((s) => {
    const r = rank(s.key)
    let state: RouteStop['state'] = 'upcoming'
    if (r < current) state = 'done'
    else if (r === current) state = terminal ? 'done' : 'current'
    return {
      label: s.label,
      detail: s.detail,
      state,
      // only the created stamp has a reliable timestamp on the model
      timestamp: s.key === PACKAGE_STATUS.DRAFT ? formatDateTime(pkg.created_at) : undefined,
    }
  })
}

/**
 * Derive a chain-of-custody route line from the package model (there is no
 * per-event history table — this mirrors the Angular "derived timeline").
 */
export function packageRouteStops(pkg: Package): RouteStop[] {
  const stops = buildStops(
    [
      { key: PACKAGE_STATUS.DRAFT, label: 'Package created', detail: 'Order registered at depot' },
      { key: PACKAGE_STATUS.NOTIFIED, label: 'Receiver notified' },
      { key: PACKAGE_STATUS.IN_TRANSIT, label: 'Picked up by driver', detail: 'On the road' },
      { key: PACKAGE_STATUS.READY_FOR_COLLECTION, label: 'Ready for collection', detail: 'At collection point' },
      { key: PACKAGE_STATUS.COLLECTED, label: 'Collected by receiver' },
    ],
    pkg,
  )

  if (pkg.status === PACKAGE_STATUS.RETURNED) {
    stops.push({ label: 'Returned', detail: 'Package sent back', state: 'current' })
  }

  return stops
}

/**
 * The same route line, worded for the person waiting on the parcel rather than
 * the depot running it. The staff line names depot events ("Receiver notified",
 * "Picked up by driver"); a customer thinks in terms of their own journey, so
 * these mirror the customer-facing status labels in `status.ts`.
 */
export function customerRouteStops(pkg: TimelinePackage): RouteStop[] {
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
  )

  if (pkg.status === PACKAGE_STATUS.RETURNED) {
    stops.push({ label: 'Returned', detail: 'Sent back to the depot', state: 'current' })
  }

  return stops
}
