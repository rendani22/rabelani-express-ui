import { describe, expect, it } from 'vitest'
import { ORDER_EXPORT_COLUMNS, ordersToCsv, toOrderExportRow } from './orders-export'
import type { Package } from '@/lib/models/package'

const basePkg: Package = {
  id: 'p1',
  reference: 'RB-001',
  receiver_email: 'Jane.Doe@example.com',
  notes: 'Left at reception\ndelivery photo: https://cdn.example.com/a.jpg',
  customer_notes: 'Call on arrival',
  status: 'notified',
  created_at: '2026-07-01T08:00:00.000Z',
  updated_at: '2026-07-02T09:30:00.000Z',
  po_number: 'PO-42',
  reschedule_requested: true,
  items: [
    { id: 'i1', quantity: 2, description: 'Widget' },
    { id: 'i2', quantity: 1, description: 'Gadget' },
  ],
}

describe('toOrderExportRow', () => {
  it('flattens a package, resolving the name from the map and stripping photo URLs from notes', () => {
    const row = toOrderExportRow(basePkg, { 'jane.doe@example.com': 'Jane Doe' })
    expect(row).toEqual({
      reference: 'RB-001',
      po_number: 'PO-42',
      status: 'notified',
      status_label: 'Notified',
      receiver_name: 'Jane Doe',
      receiver_email: 'Jane.Doe@example.com',
      item_count: 2,
      items: '2× Widget; 1× Gadget',
      reschedule_requested: 'yes',
      notes: 'Left at reception',
      customer_notes: 'Call on arrival',
      created_at: '2026-07-01T08:00:00.000Z',
      updated_at: '2026-07-02T09:30:00.000Z',
    })
  })

  it('derives the display label for a delivered order (collected + delivery photo)', () => {
    const row = toOrderExportRow({ ...basePkg, status: 'collected' }, {})
    expect(row.status_label).toBe('Delivered')
  })

  it('falls back to a name from the email and blanks optional fields when absent', () => {
    const row = toOrderExportRow(
      {
        id: 'p2',
        reference: 'RB-002',
        receiver_email: 'sam.smith@example.com',
        notes: null,
        customer_notes: null,
        status: 'pending',
        created_at: '2026-07-03T00:00:00.000Z',
      },
      {},
    )
    expect(row.receiver_name).toBe('Sam Smith')
    expect(row.po_number).toBe('')
    expect(row.item_count).toBe(0)
    expect(row.items).toBe('')
    expect(row.reschedule_requested).toBe('no')
    expect(row.notes).toBe('')
    expect(row.customer_notes).toBe('')
    expect(row.updated_at).toBe('')
  })

  it('handles a missing receiver email', () => {
    const row = toOrderExportRow(
      { ...basePkg, receiver_email: undefined as unknown as string },
      {},
    )
    expect(row.receiver_email).toBe('')
    expect(row.receiver_name).toBe('')
  })
})

describe('ordersToCsv', () => {
  it('emits a header row plus one row per package', () => {
    const csv = ordersToCsv([basePkg], { 'jane.doe@example.com': 'Jane Doe' })
    const lines = csv.trimEnd().split('\r\n')
    expect(lines[0]).toBe(ORDER_EXPORT_COLUMNS.join(','))
    expect(lines).toHaveLength(2)
    // Items are joined with a semicolon (no comma), so the cell stays unquoted.
    expect(lines[1]).toContain('2× Widget; 1× Gadget')
  })

  it('emits header only for an empty set', () => {
    expect(ordersToCsv([], {})).toBe(`${ORDER_EXPORT_COLUMNS.join(',')}\r\n`)
  })
})
