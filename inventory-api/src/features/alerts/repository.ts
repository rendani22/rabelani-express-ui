/**
 * Alerts Repository
 * Database access layer for alert operations
 */

import { db } from '../../database/client.ts';
import {
  executePaginatedQuery,
  generateId,
  objectToCamelCase,
  arrayToCamelCase,
} from '../../database/queries.ts';
import type { PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  Alert,
  AlertWithDetails,
  ThresholdRule,
  AlertFilters,
  AlertSummary,
  AlertStatus,
} from './types.ts';
import type { CreateThresholdInput, UpdateAlertInput } from './validation.ts';

/**
 * Alerts Repository Class
 */
export class AlertsRepository {
  /**
   * Finds all alerts with filtering
   */
  async findAll(
    organizationId: string,
    filters: AlertFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<AlertWithDetails>> {
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    let whereClause = 'a.organization_id = $1';

    if (filters.type) {
      whereClause += ` AND a.type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters.severity) {
      whereClause += ` AND a.severity = $${paramIndex++}`;
      params.push(filters.severity);
    }

    if (filters.status) {
      whereClause += ` AND a.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.itemId) {
      whereClause += ` AND a.item_id = $${paramIndex++}`;
      params.push(filters.itemId);
    }

    if (filters.locationId) {
      whereClause += ` AND a.location_id = $${paramIndex++}`;
      params.push(filters.locationId);
    }

    if (filters.startDate) {
      whereClause += ` AND a.created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ` AND a.created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    const baseQuery = `
      SELECT
        a.*,
        i.sku as item_sku,
        i.name as item_name,
        l.name as location_name,
        l.code as location_code
      FROM alerts a
      LEFT JOIN items i ON a.item_id = i.id
      LEFT JOIN locations l ON a.location_id = l.id
      WHERE ${whereClause}
      ORDER BY
        CASE a.severity
          WHEN 'critical' THEN 1
          WHEN 'high' THEN 2
          WHEN 'medium' THEN 3
          ELSE 4
        END,
        a.created_at DESC
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM alerts a
      WHERE ${whereClause}
    `;

    const result = await executePaginatedQuery<Record<string, unknown>>(
      baseQuery,
      countQuery,
      params,
      pagination
    );

    return {
      data: result.data.map((row) => this.mapToAlertWithDetails(row)),
      pagination: result.pagination,
    };
  }

  /**
   * Creates a threshold rule
   */
  async createThreshold(
    input: CreateThresholdInput,
    organizationId: string,
    userId: string
  ): Promise<ThresholdRule> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO threshold_rules (
        id, name, description, item_id, category, location_id,
        threshold_type, threshold_value, severity, is_active,
        organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $12, $13)
      RETURNING *`,
      [
        id,
        input.name,
        input.description ?? null,
        input.itemId ?? null,
        input.category ?? null,
        input.locationId ?? null,
        input.thresholdType,
        input.thresholdValue,
        input.severity,
        true,
        organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<ThresholdRule>(result.rows[0]!);
  }

  /**
   * Updates an alert
   */
  async update(
    alertId: string,
    input: UpdateAlertInput,
    organizationId: string,
    userId: string
  ): Promise<Alert | null> {
    const updateFields: Record<string, unknown> = {
      status: input.status,
      updated_at: new Date(),
      updated_by: userId,
    };

    if (input.status === 'acknowledged') {
      updateFields.acknowledged_by = userId;
      updateFields.acknowledged_at = new Date();
    }

    if (input.status === 'resolved' || input.status === 'dismissed') {
      updateFields.resolved_by = userId;
      updateFields.resolved_at = new Date();
    }

    const setClauses = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 3}`)
      .join(', ');

    const result = await db.query<Record<string, unknown>>(
      `UPDATE alerts SET ${setClauses}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [alertId, organizationId, ...Object.values(updateFields)]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return objectToCamelCase<Alert>(result.rows[0]);
  }

  /**
   * Gets alert summary by type and severity
   */
  async getSummary(organizationId: string): Promise<AlertSummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT type, severity, COUNT(*) as count
       FROM alerts
       WHERE organization_id = $1 AND status = 'active'
       GROUP BY type, severity
       ORDER BY
         CASE severity
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END`,
      [organizationId]
    );

    return arrayToCamelCase<AlertSummary>(result.rows);
  }

  /**
   * Creates an alert from a threshold breach
   */
  async createFromThreshold(
    rule: ThresholdRule,
    itemId: string,
    locationId: string | null,
    currentValue: number,
    userId: string
  ): Promise<Alert> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO alerts (
        id, type, severity, title, message, item_id, location_id,
        threshold, current_value, status, organization_id,
        created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $12, $13)
      RETURNING *`,
      [
        id,
        'threshold_breach',
        rule.severity,
        `${rule.name} threshold breached`,
        `${rule.thresholdType} threshold of ${rule.thresholdValue} breached. Current value: ${currentValue}`,
        itemId,
        locationId,
        rule.thresholdValue,
        currentValue,
        'active',
        rule.organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<Alert>(result.rows[0]!);
  }

  /**
   * Maps database row to AlertWithDetails
   */
  private mapToAlertWithDetails(row: Record<string, unknown>): AlertWithDetails {
    const alert = objectToCamelCase<Alert>(row);

    return {
      ...alert,
      item: row.item_id ? {
        id: row.item_id as string,
        sku: row.item_sku as string,
        name: row.item_name as string,
      } : null,
      location: row.location_id ? {
        id: row.location_id as string,
        name: row.location_name as string,
        code: row.location_code as string,
      } : null,
    };
  }
}

// Export singleton instance
export const alertsRepository = new AlertsRepository();

