import { describe, expect, it } from 'vitest'
import {
  COUPA_AUDIT_ENTITY_TYPE,
  COUPA_INGESTED_ACTION,
  COUPA_INGEST_FAILED_ACTION,
  SYSTEM_ACTOR_ID,
  buildIngestFailedAuditRow,
  buildIngestedAuditRow,
} from './coupa-audit'
import type { CoupaPo } from './coupa-po'

const PO: CoupaPo = {
  poNumber: 'GG80700992',
  poDate: '2026-07-15',
  total: 4873.26,
  currency: 'ZAR',
  onBehalfOf: 'Ramadimetja Maria Mochaki',
  submittedBy: 'Thabo Nkosi',
  lines: [
    { code: '37869', name: 'VOUCHER:OVERTIME MEAL,TICKET', quantity: 49, uom: 'PKT' },
    { code: '37865', name: 'VOUCHER:OVERTIME MEAL ,TICKET', quantity: 14, uom: 'PKT' },
  ],
}

describe('buildIngestedAuditRow', () => {
  const row = buildIngestedAuditRow({
    purchaseOrderId: 'po-1',
    po: PO,
    receiverId: 'r1',
    matchedOn: 'On Behalf Of',
    emailSubject: 'Purchase Order #GG80700992',
  })

  it('attributes the write to the system, not a user', () => {
    // audit_logs.performed_by is NOT NULL and ingestion has no auth.uid().
    expect(row.performed_by).toBe(SYSTEM_ACTOR_ID)
  })

  it('points at the purchase order it created, so a PO history is one query', () => {
    expect(row.entity_type).toBe(COUPA_AUDIT_ENTITY_TYPE)
    expect(row.entity_id).toBe('po-1')
    expect(row.action).toBe(COUPA_INGESTED_ACTION)
  })

  it('records which name the customer was matched on, and both candidates', () => {
    // The point of the record: the day the two fields disagree, this says which
    // one the PO was filed under.
    expect(row.metadata).toMatchObject({
      matched_on: 'On Behalf Of',
      on_behalf_of: 'Ramadimetja Maria Mochaki',
      submitted_by: 'Thabo Nkosi',
      receiver_id: 'r1',
      po_number: 'GG80700992',
      lines_count: 2,
      source: 'coupa_email',
    })
  })

  it('leaves the optional provenance null rather than absent', () => {
    const bare = buildIngestedAuditRow({ purchaseOrderId: 'po-1', po: PO })
    expect(bare.metadata.matched_on).toBeNull()
    expect(bare.metadata.receiver_id).toBeNull()
    expect(bare.metadata.email_subject).toBeNull()
  })
})

describe('buildIngestFailedAuditRow', () => {
  it('carries no entity_id, because no purchase order exists to point at', () => {
    const row = buildIngestFailedAuditRow({ reason: 'unknown_customer', details: 'No active customer is named "X".', po: PO })
    expect(row.entity_id).toBeNull()
    expect(row.action).toBe(COUPA_INGEST_FAILED_ACTION)
    expect(row.performed_by).toBe(SYSTEM_ACTOR_ID)
  })

  it('records the reason the dashboard groups on', () => {
    const row = buildIngestFailedAuditRow({ reason: 'unknown_item_codes', unknownCodes: ['99999'], po: PO })
    expect(row.metadata).toMatchObject({ reason: 'unknown_item_codes', unknown_codes: ['99999'], po_number: 'GG80700992' })
  })

  it('still records a failure that happened before anything parsed', () => {
    const row = buildIngestFailedAuditRow({ reason: 'unreadable_email', details: 'No "PO ID" field found', po: null })
    expect(row.metadata).toMatchObject({ reason: 'unreadable_email', po_number: null, on_behalf_of: null, submitted_by: null })
  })

  it('normalizes an empty unknown-codes list to null rather than []', () => {
    const row = buildIngestFailedAuditRow({ reason: 'unexpected_error', unknownCodes: [] })
    expect(row.metadata.unknown_codes).toBeNull()
    expect(row.metadata.details).toBeNull()
  })

  it('truncates an unbounded third-party detail', () => {
    // audit_logs is append-only, so a runaway Postgres/parser message would be
    // a row nobody can trim back.
    const row = buildIngestFailedAuditRow({ reason: 'unexpected_error', details: 'x'.repeat(900) })
    const details = row.metadata.details as string
    expect(details).toHaveLength(503)
    expect(details.endsWith('...')).toBe(true)
  })

  it('never carries the email body', () => {
    // Support already receives it by email, it is unbounded, and audit_logs is
    // readable by every holder of orders.audit.view.
    const row = buildIngestFailedAuditRow({ reason: 'unreadable_email', details: 'nope', po: PO })
    expect(JSON.stringify(row.metadata)).not.toContain('VOUCHER')
  })
})
