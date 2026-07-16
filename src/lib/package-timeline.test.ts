import { describe, expect, it } from 'vitest'
import type { Package } from '@/lib/models/package'
import { PACKAGE_STATUS, type PackageStatus } from '@/lib/status'
import { customerRouteStops, packageRouteStops } from './package-timeline'

const mk = (status: PackageStatus): Package =>
  ({
    id: 'p1',
    reference: 'RBX-1',
    receiver_email: 'r@x.com',
    notes: null,
    customer_notes: null,
    status,
    created_at: '2026-01-05T10:00:00Z',
  }) as Package

describe('packageRouteStops', () => {
  it('marks the draft stage current and the rest upcoming for a new package', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.DRAFT))
    expect(stops).toHaveLength(5)
    expect(stops[0].state).toBe('current')
    expect(stops[0].timestamp).toBeTruthy() // only the created stamp has a timestamp
    expect(stops[1].timestamp).toBeUndefined()
    expect(stops.slice(1).every((s) => s.state === 'upcoming')).toBe(true)
  })

  it('marks passed stages done and the active one current mid-journey', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.IN_TRANSIT))
    expect(stops[0].state).toBe('done')
    expect(stops[1].state).toBe('done')
    expect(stops[2].state).toBe('current')
    expect(stops[3].state).toBe('upcoming')
    expect(stops[4].state).toBe('upcoming')
  })

  it('marks all stages done once collected (no current)', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.COLLECTED))
    expect(stops.every((s) => s.state === 'done')).toBe(true)
  })

  it('treats delivered like a completed terminal state', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.DELIVERED))
    expect(stops.every((s) => s.state === 'done')).toBe(true)
  })

  it('appends a Returned stop for returned packages', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.RETURNED))
    expect(stops).toHaveLength(6)
    expect(stops[5]).toMatchObject({ label: 'Returned', state: 'current' })
  })
})

describe('customerRouteStops', () => {
  const cust = (status: PackageStatus) => ({ status, created_at: '2026-01-05T10:00:00Z' })

  it('words the stops for the customer, not the depot', () => {
    const stops = customerRouteStops(cust(PACKAGE_STATUS.IN_TRANSIT))
    // No depot jargon: the staff line says "Receiver notified" / "Picked up by driver".
    expect(stops.map((s) => s.label)).toEqual([
      'Order received',
      'Being prepared',
      'On the way',
      'Ready for collection',
      'Delivered',
    ])
  })

  it('tracks the same progression as the staff line', () => {
    const stops = customerRouteStops(cust(PACKAGE_STATUS.IN_TRANSIT))
    expect(stops[0].state).toBe('done')
    expect(stops[1].state).toBe('done')
    expect(stops[2].state).toBe('current')
    expect(stops[3].state).toBe('upcoming')
    expect(stops[0].timestamp).toBeTruthy()
    expect(stops[1].timestamp).toBeUndefined()
  })

  it('marks a new order current at the first stop', () => {
    const stops = customerRouteStops(cust(PACKAGE_STATUS.DRAFT))
    expect(stops[0].state).toBe('current')
    expect(stops.slice(1).every((s) => s.state === 'upcoming')).toBe(true)
  })

  it('names the terminal stop for how the parcel actually ended', () => {
    expect(customerRouteStops(cust(PACKAGE_STATUS.COLLECTED)).at(-1)?.label).toBe('Collected')
    expect(customerRouteStops(cust(PACKAGE_STATUS.DELIVERED)).at(-1)?.label).toBe('Delivered')
  })

  it('marks every stop done once the parcel lands, with no current node', () => {
    for (const s of [PACKAGE_STATUS.COLLECTED, PACKAGE_STATUS.DELIVERED]) {
      const stops = customerRouteStops(cust(s))
      expect(stops.every((x) => x.state === 'done')).toBe(true)
    }
  })

  it('appends a Returned stop worded for the customer', () => {
    const stops = customerRouteStops(cust(PACKAGE_STATUS.RETURNED))
    expect(stops).toHaveLength(6)
    expect(stops[5]).toMatchObject({ label: 'Returned', detail: 'Sent back to the depot', state: 'current' })
  })
})
