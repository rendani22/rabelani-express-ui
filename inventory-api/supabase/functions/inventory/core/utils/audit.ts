/**
 * Audit logging utility
 * Creates audit trail records for all mutations in the system
 */

import { db } from '../../database/supabase-client.ts';
import type { AuthUser, FeatureModule } from '../types/index.ts';

// Audit log action types
export type AuditAction =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'TRANSFER'
  | 'ADJUSTMENT'
  | 'STATUS_CHANGE';

// Audit log entry structure
export interface AuditLogEntry {
  id: string;
  module: FeatureModule;
  action: AuditAction;
  entityType: string;
  entityId: string;
  userId: string;
  userEmail: string;
  organizationId: string;
  changes: AuditChanges;
  metadata: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
}

// Structure for tracking field changes
export interface AuditChanges {
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  fields?: string[];  // List of changed field names
}

/**
 * Creates an audit log entry for a mutation
 * This should be called for all CREATE, UPDATE, DELETE operations
 */
export async function createAuditLog(
  module: FeatureModule,
  action: AuditAction,
  entityType: string,
  entityId: string,
  user: AuthUser,
  changes: AuditChanges,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    const entry: Omit<AuditLogEntry, 'id'> = {
      module,
      action,
      entityType,
      entityId,
      userId: user.id,
      userEmail: user.email,
      organizationId: user.organizationId,
      changes,
      metadata,
      timestamp: new Date(),
    };

    // Insert audit log into database
    await db.query(
      `INSERT INTO audit_logs (
        module, action, entity_type, entity_id,
        user_id, user_email, organization_id,
        changes, metadata, timestamp
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.module,
        entry.action,
        entry.entityType,
        entry.entityId,
        entry.userId,
        entry.userEmail,
        entry.organizationId,
        JSON.stringify(entry.changes),
        JSON.stringify(entry.metadata),
        entry.timestamp,
      ]
    );

    // Also log to console for debugging/monitoring
    console.log(
      `[AUDIT] ${entry.action} ${entry.entityType}:${entry.entityId} by ${entry.userEmail}`
    );
  } catch (error) {
    // Don't throw - audit logging failure shouldn't break the main operation
    // But we should log it for monitoring
    console.error('[AUDIT ERROR] Failed to create audit log:', error);
  }
}

/**
 * Calculates the difference between two objects
 * Returns only the fields that have changed
 */
export function calculateChanges(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>
): AuditChanges {
  if (!before) {
    // This is a CREATE operation - no before state
    return {
      after,
      fields: Object.keys(after),
    };
  }

  const changedFields: string[] = [];
  const beforeChanges: Record<string, unknown> = {};
  const afterChanges: Record<string, unknown> = {};

  // Find all keys from both objects
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const beforeVal = before[key];
    const afterVal = after[key];

    // Compare values (stringify for deep comparison)
    if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
      changedFields.push(key);
      beforeChanges[key] = beforeVal;
      afterChanges[key] = afterVal;
    }
  }

  return {
    before: beforeChanges,
    after: afterChanges,
    fields: changedFields,
  };
}

/**
 * Fetches audit history for a specific entity
 */
export async function getAuditHistory(
  entityType: string,
  entityId: string,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  const result = await db.query<AuditLogEntry>(
    `SELECT * FROM audit_logs
     WHERE entity_type = $1 AND entity_id = $2
     ORDER BY timestamp DESC
     LIMIT $3`,
    [entityType, entityId, limit]
  );

  return result.rows;
}

