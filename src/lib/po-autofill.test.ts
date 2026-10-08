import { describe, expect, it } from 'vitest'
import { matchDeliveryLocation, resolvePoAutofill } from './po-autofill'

const MAIN_STORE = { id: 'l1', name: 'DA01-Main Store', address: 'Farm Enkelbult, Lephalale' }
const WORKSHOP = { id: 'l2', name: 'Workshop', address: null }
const LEPHALALE = { id: 'l3', name: 'Lephalale Depot' }

describe('matchDeliveryLocation', () => {
  it('matches a location named exactly like the ship-to, ignoring case and punctuation', () => {
    expect(matchDeliveryLocation('da01 main store', null, [WORKSHOP, MAIN_STORE])).toBe('l1')
  })

  it('prefers the exact name over a looser containment match', () => {
    const mainOnly = { id: 'l9', name: 'Main Store' }
    expect(matchDeliveryLocation('DA01-Main Store', null, [mainOnly, MAIN_STORE])).toBe('l1')
  })

  it('matches when the location omits the site code', () => {
    expect(matchDeliveryLocation('DA01-Main Store', null, [{ id: 'l9', name: 'Main Store' }, WORKSHOP])).toBe('l9')
  })

  it('matches when the location carries more words than the ship-to', () => {
    expect(matchDeliveryLocation('Main Store', null, [MAIN_STORE, WORKSHOP])).toBe('l1')
  })

  it('does not match part of a word', () => {
    expect(matchDeliveryLocation('Storeroom', null, [{ id: 'l9', name: 'Store' }])).toBeNull()
  })

  it('falls back to a location named in the ship-to address', () => {
    expect(matchDeliveryLocation('Gate 3', 'Lephalale Depot, Limpopo', [WORKSHOP, LEPHALALE])).toBe('l3')
  })

  it('selects nothing when a rule matches several locations', () => {
    const a = { id: 'a', name: 'Main Store' }
    const b = { id: 'b', name: 'DA01' }
    expect(matchDeliveryLocation('DA01-Main Store', null, [a, b])).toBeNull()
  })

  it('selects nothing when nothing matches', () => {
    expect(matchDeliveryLocation('Plant 7', 'Somewhere', [WORKSHOP, LEPHALALE])).toBeNull()
    expect(matchDeliveryLocation('Plant 7', null, [WORKSHOP])).toBeNull()
  })

  it('selects nothing without a ship-to, and ignores unnamed locations', () => {
    expect(matchDeliveryLocation(null, 'Lephalale Depot', [LEPHALALE])).toBeNull()
    expect(matchDeliveryLocation(' - ', null, [LEPHALALE])).toBeNull()
    expect(matchDeliveryLocation('Workshop', null, [{ id: 'x', name: '--' }, WORKSHOP])).toBe('l2')
  })
})

describe('resolvePoAutofill', () => {
  const receivers = [
    { id: 'r1', email: 'maria@example.com' },
    { id: 'r2', email: 'thabo@example.com' },
  ]

  it("selects the PO's customer and matched location", () => {
    expect(
      resolvePoAutofill({ receiverId: 'r2', shipToName: 'DA01-Main Store', shipToAddress: null }, receivers, [MAIN_STORE]),
    ).toEqual({ receiverEmail: 'thabo@example.com', locationId: 'l1' })
  })

  it('leaves the receiver empty when the PO has none, or names an inactive one', () => {
    expect(resolvePoAutofill({ receiverId: null, shipToName: null, shipToAddress: null }, receivers, [])).toEqual({
      receiverEmail: null,
      locationId: null,
    })
    expect(resolvePoAutofill({ receiverId: 'gone', shipToName: null, shipToAddress: null }, receivers, []).receiverEmail).toBeNull()
  })
})
