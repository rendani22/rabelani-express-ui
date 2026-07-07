/** Package status values returned by the API (ported from the Angular models). */
export const PACKAGE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  NOTIFIED: 'notified',
  IN_TRANSIT: 'in_transit',
  READY_FOR_COLLECTION: 'ready_for_collection',
  DELIVERED: 'delivered',
  COLLECTED: 'collected',
  RETURNED: 'returned',
} as const

export type PackageStatus = (typeof PACKAGE_STATUS)[keyof typeof PACKAGE_STATUS]

export type StatusTone = 'neutral' | 'route' | 'transit' | 'wait' | 'done' | 'alert'

interface StatusMeta {
  label: string
  tone: StatusTone
}

/**
 * Tone mapping is deliberate, not decorative:
 * green = only "delivered / collected", route-blue = on the road, amber-yellow =
 * waiting on someone, cargo-orange = actively in motion, red = returned.
 */
export const STATUS_META: Record<PackageStatus, StatusMeta> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'neutral' },
  notified: { label: 'Notified', tone: 'route' },
  in_transit: { label: 'In Transit', tone: 'transit' },
  ready_for_collection: { label: 'Ready for Collection', tone: 'wait' },
  delivered: { label: 'Delivered', tone: 'done' },
  collected: { label: 'Collected', tone: 'done' },
  returned: { label: 'Returned', tone: 'alert' },
}

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status as PackageStatus] ?? { label: status, tone: 'neutral' }
}

/**
 * Customer-facing status labels. The internal labels are operational jargon
 * ("Pending", "Notified") that mean little to the person receiving the goods —
 * these read for them. Tones are kept from the internal mapping. Unknown
 * statuses fall back to a safe generic label rather than echoing raw jargon.
 */
const CUSTOMER_STATUS_META: Record<PackageStatus, StatusMeta> = {
  draft: { label: 'Processing', tone: 'neutral' },
  pending: { label: 'Order received', tone: 'neutral' },
  notified: { label: 'Being prepared', tone: 'route' },
  in_transit: { label: 'On the way', tone: 'transit' },
  ready_for_collection: { label: 'Ready for collection', tone: 'wait' },
  delivered: { label: 'Delivered', tone: 'done' },
  collected: { label: 'Collected', tone: 'done' },
  returned: { label: 'Returned', tone: 'alert' },
}

export function customerStatusMeta(status: string): StatusMeta {
  return CUSTOMER_STATUS_META[status as PackageStatus] ?? { label: 'Processing', tone: 'neutral' }
}
