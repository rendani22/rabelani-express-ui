import { statusMeta } from '@/lib/status'
import type { AuditLogEntry } from '@/lib/api/packages'

/** Human-readable labels for known package audit-action codes. */
const ACTION_LABELS: Record<string, string> = {
  PACKAGE_CREATED: 'Package created',
  PACKAGE_UPDATED: 'Package updated',
  PACKAGE_ITEMS_UPDATED_NOTIFICATION: 'Items updated — receiver notified',
  PACKAGE_PREPARED_NOTIFICATION: 'Preparation email sent',
  PACKAGE_READY_NOTIFICATION: 'Ready-for-collection email sent',
  PACKAGE_COMPLETED_NOTIFICATION: 'Completion email sent',
  PACKAGE_UPDATE_DENIED: 'Update denied',
}

/** Label for an audit action code; humanises unknown codes (FOO_BAR → "Foo bar"). */
export function formatAuditAction(action: string): string {
  if (ACTION_LABELS[action]) return ACTION_LABELS[action]
  const words = action.toLowerCase().replace(/_/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Short "previous → new" status summary from an audit row's metadata, when both
 * are present and differ. Returns null otherwise.
 */
export function auditStatusChange(entry: AuditLogEntry): string | null {
  const meta = entry.metadata
  if (!meta) return null
  const prev = meta['previous_status']
  const next = meta['new_status']
  if (typeof prev === 'string' && typeof next === 'string' && prev !== next) {
    return `${statusMeta(prev).label} → ${statusMeta(next).label}`
  }
  return null
}
