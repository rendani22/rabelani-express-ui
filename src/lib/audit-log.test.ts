import { describe, expect, it } from 'vitest'
import type { AuditLogEntry } from '@/lib/api/packages'
import { auditStatusChange, formatAuditAction } from './audit-log'

const entry = (metadata: Record<string, unknown> | null): AuditLogEntry =>
  ({ id: '1', action: 'PACKAGE_UPDATED', metadata, performed_by: null, created_at: '' }) as unknown as AuditLogEntry

describe('formatAuditAction', () => {
  it('maps known action codes to friendly labels', () => {
    expect(formatAuditAction('PACKAGE_CREATED')).toBe('Package created')
    expect(formatAuditAction('PACKAGE_READY_NOTIFICATION')).toBe('Ready-for-collection email sent')
  })

  it('humanises unknown codes (FOO_BAR → "Foo bar")', () => {
    expect(formatAuditAction('SOME_NEW_EVENT')).toBe('Some new event')
  })
})

describe('auditStatusChange', () => {
  it('returns null when metadata is missing', () => {
    expect(auditStatusChange(entry(null))).toBeNull()
  })

  it('returns null when statuses are absent or unchanged', () => {
    expect(auditStatusChange(entry({}))).toBeNull()
    expect(auditStatusChange(entry({ previous_status: 'pending', new_status: 'pending' }))).toBeNull()
    expect(auditStatusChange(entry({ previous_status: 42, new_status: 'notified' }))).toBeNull()
  })

  it('summarises a real status change with friendly labels', () => {
    expect(
      auditStatusChange(entry({ previous_status: 'pending', new_status: 'in_transit' })),
    ).toBe('Pending → In Transit')
  })
})
