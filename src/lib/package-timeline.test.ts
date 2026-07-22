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
    expect(stops[5].timestamp).toBeUndefined() // no history loaded
  })
})

describe('packageRouteStops timestamps', () => {
  const at = (status: string, changed_at: string) => ({ status, changed_at })

  it('stamps every reached stop from the recorded transitions', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.READY_FOR_COLLECTION), [
      at(PACKAGE_STATUS.NOTIFIED, '2026-01-06T08:00:00Z'),
      at(PACKAGE_STATUS.IN_TRANSIT, '2026-01-07T09:30:00Z'),
      at(PACKAGE_STATUS.READY_FOR_COLLECTION, '2026-01-07T15:45:00Z'),
    ])
    expect(stops.map((s) => !!s.timestamp)).toEqual([true, true, true, true, false])
  })

  it('never stamps an upcoming stop, even with a stray history row', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.DRAFT), [
      at(PACKAGE_STATUS.IN_TRANSIT, '2026-01-07T09:30:00Z'),
    ])
    expect(stops[2].state).toBe('upcoming')
    expect(stops[2].timestamp).toBeUndefined()
  })

  it('keeps the first arrival when a status is entered twice', () => {
    const first = packageRouteStops(mk(PACKAGE_STATUS.IN_TRANSIT), [
      at(PACKAGE_STATUS.IN_TRANSIT, '2026-01-07T09:30:00Z'),
    ])[2].timestamp
    const bounced = packageRouteStops(mk(PACKAGE_STATUS.IN_TRANSIT), [
      at(PACKAGE_STATUS.IN_TRANSIT, '2026-01-07T09:30:00Z'),
      at(PACKAGE_STATUS.READY_FOR_COLLECTION, '2026-01-07T15:45:00Z'),
      at(PACKAGE_STATUS.IN_TRANSIT, '2026-01-08T07:00:00Z'),
    ])[2].timestamp
    expect(bounced).toBe(first)
  })

  it('falls back to created_at for the creation stop when history has no draft row', () => {
    const [created] = packageRouteStops(mk(PACKAGE_STATUS.NOTIFIED), [
      at(PACKAGE_STATUS.NOTIFIED, '2026-01-06T08:00:00Z'),
    ])
    expect(created.timestamp).toBe(packageRouteStops(mk(PACKAGE_STATUS.DRAFT))[0].timestamp)
  })

  it('prefers a recorded draft transition over created_at', () => {
    const [created] = packageRouteStops(mk(PACKAGE_STATUS.DRAFT), [
      at(PACKAGE_STATUS.DRAFT, '2026-02-09T06:15:00Z'),
    ])
    expect(created.timestamp).not.toBe(packageRouteStops(mk(PACKAGE_STATUS.DRAFT))[0].timestamp)
  })

  it('stamps the terminal stop from a collected transition', () => {
    const collected = packageRouteStops(mk(PACKAGE_STATUS.COLLECTED), [
      at(PACKAGE_STATUS.COLLECTED, '2026-01-09T11:00:00Z'),
    ]).at(-1)
    expect(collected?.timestamp).toBeTruthy()
  })

  it('stamps the terminal stop from a delivered transition too', () => {
    const collected = packageRouteStops(mk(PACKAGE_STATUS.DELIVERED), [
      at(PACKAGE_STATUS.DELIVERED, '2026-01-09T11:00:00Z'),
    ]).at(-1)
    expect(collected?.timestamp).toBeTruthy()
  })

  it('stamps the Returned stop when the return was recorded', () => {
    const stops = packageRouteStops(mk(PACKAGE_STATUS.RETURNED), [
      at(PACKAGE_STATUS.RETURNED, '2026-01-10T12:00:00Z'),
    ])
    expect(stops[5].timestamp).toBeTruthy()
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

  it('stamps reached stops from history, same as the staff line', () => {
    const stops = customerRouteStops(cust(PACKAGE_STATUS.IN_TRANSIT), [
      { status: PACKAGE_STATUS.NOTIFIED, changed_at: '2026-01-06T08:00:00Z' },
      { status: PACKAGE_STATUS.IN_TRANSIT, changed_at: '2026-01-07T09:30:00Z' },
    ])
    expect(stops.map((s) => !!s.timestamp)).toEqual([true, true, true, false, false])
  })

  it('stamps the customer Returned stop from history', () => {
    const stops = customerRouteStops(cust(PACKAGE_STATUS.RETURNED), [
      { status: PACKAGE_STATUS.RETURNED, changed_at: '2026-01-10T12:00:00Z' },
    ])
    expect(stops[5].timestamp).toBeTruthy()
  })
})
