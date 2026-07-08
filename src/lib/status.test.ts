import { describe, expect, it } from 'vitest'
import {
  PACKAGE_STATUS,
  customerStatusMeta,
  displayStatusMeta,
  hasDeliveryPhoto,
  statusMeta,
} from './status'

describe('statusMeta', () => {
  it('returns operational label + tone for a known status', () => {
    expect(statusMeta(PACKAGE_STATUS.IN_TRANSIT)).toEqual({ label: 'In Transit', tone: 'transit' })
    expect(statusMeta(PACKAGE_STATUS.DELIVERED).tone).toBe('done')
    expect(statusMeta(PACKAGE_STATUS.RETURNED).tone).toBe('alert')
  })

  it('falls back to a neutral echo for unknown statuses', () => {
    expect(statusMeta('mystery')).toEqual({ label: 'mystery', tone: 'neutral' })
  })
})

describe('customerStatusMeta', () => {
  it('returns friendly labels for known statuses', () => {
    expect(customerStatusMeta(PACKAGE_STATUS.IN_TRANSIT).label).toBe('On the way')
    expect(customerStatusMeta(PACKAGE_STATUS.PENDING).label).toBe('Order received')
  })

  it('falls back to a safe generic label for unknown statuses', () => {
    expect(customerStatusMeta('weird')).toEqual({ label: 'Processing', tone: 'neutral' })
  })
})

describe('hasDeliveryPhoto', () => {
  it('detects the delivery-photo marker (case-insensitive), safe on null', () => {
    expect(hasDeliveryPhoto('Left at door\nDelivery Photo: https://x/y.jpg')).toBe(true)
    expect(hasDeliveryPhoto('just some notes')).toBe(false)
    expect(hasDeliveryPhoto(null)).toBe(false)
    expect(hasDeliveryPhoto(undefined)).toBe(false)
  })
})

describe('displayStatusMeta', () => {
  it('labels a completed order Delivered when it has a delivery photo, else Collected', () => {
    expect(displayStatusMeta({ status: PACKAGE_STATUS.COLLECTED, notes: 'delivery photo: http://x/a.jpg' })).toEqual({
      label: 'Delivered',
      tone: 'done',
    })
    expect(displayStatusMeta({ status: PACKAGE_STATUS.COLLECTED, notes: 'signed for' })).toEqual({
      label: 'Collected',
      tone: 'done',
    })
  })

  it('normalises a stray `delivered` status through the same photo rule', () => {
    expect(displayStatusMeta({ status: PACKAGE_STATUS.DELIVERED, notes: 'delivery photo: http://x/a.jpg' }).label).toBe('Delivered')
    expect(displayStatusMeta({ status: PACKAGE_STATUS.DELIVERED, notes: null }).label).toBe('Collected')
  })

  it('returns the plain meta for non-terminal statuses', () => {
    expect(displayStatusMeta({ status: PACKAGE_STATUS.IN_TRANSIT })).toEqual(statusMeta(PACKAGE_STATUS.IN_TRANSIT))
  })
})
