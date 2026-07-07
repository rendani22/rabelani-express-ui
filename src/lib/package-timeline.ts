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

/**
 * Derive a chain-of-custody route line from the package model (there is no
 * per-event history table — this mirrors the Angular "derived timeline").
 */
export function packageRouteStops(pkg: Package): RouteStop[] {
  const returned = pkg.status === PACKAGE_STATUS.RETURNED
  const current = rank(pkg.status)

  const stages: { key: string; label: string; detail?: string }[] = [
    { key: PACKAGE_STATUS.DRAFT, label: 'Package created', detail: 'Order registered at depot' },
    { key: PACKAGE_STATUS.NOTIFIED, label: 'Receiver notified' },
    { key: PACKAGE_STATUS.IN_TRANSIT, label: 'Picked up by driver', detail: 'On the road' },
    { key: PACKAGE_STATUS.READY_FOR_COLLECTION, label: 'Ready for collection', detail: 'At collection point' },
    { key: PACKAGE_STATUS.COLLECTED, label: 'Collected by receiver' },
  ]

  const stops: RouteStop[] = stages.map((s) => {
    const r = rank(s.key)
    let state: RouteStop['state'] = 'upcoming'
    if (r < current) state = 'done'
    else if (r === current) state = 'done'
    if (r === current && pkg.status !== PACKAGE_STATUS.COLLECTED && pkg.status !== PACKAGE_STATUS.DELIVERED) {
      state = 'current'
    }
    return {
      label: s.label,
      detail: s.detail,
      state,
      // only the created stamp has a reliable timestamp on the model
      timestamp: s.key === PACKAGE_STATUS.DRAFT ? formatDateTime(pkg.created_at) : undefined,
    }
  })

  if (returned) {
    stops.push({ label: 'Returned', detail: 'Package sent back', state: 'current' })
  }

  return stops
}
