/**
 * Usage Repository
 * Database access layer for usage tracking operations
 */

import { db } from '../../database/supabase-client.ts';
import {
  executePaginatedQuery,
  generateId,
  objectToCamelCase,
  arrayToCamelCase,
} from '../../database/queries.ts';
import type { PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  UsageRecord,
  UsageWithDetails,
  UsageHistoryFilters,
  UsageTypeSummary,
  ItemUsageSummary,
  DailyUsageTrend,
} from './types.ts';
import type { RecordUsageInput } from './validation.ts';

/**
 * Usage Repository Class
 */
export class UsageRepository {
  /**
   * Records a usage entry
   */
  async create(
    input: RecordUsageInput,
    cost: number,
    organizationId: string,
    userId: string
  ): Promise<UsageRecord> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO usage_records (
        id, item_id, location_id, quantity, usage_type,
        reference_type, reference_id, used_by, used_at, notes, cost,
        organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $13, $14)
      RETURNING *`,
      [
        id,
        input.itemId,
        input.locationId,
        input.quantity,
        input.usageType,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.usedBy ?? null,
        input.usedAt ?? now,
        input.notes ?? null,
        cost,
        organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<UsageRecord>(result.rows[0]!);
  }

  /**
   * Finds usage history with filters
   */
  async findHistory(
    organizationId: string,
    filters: UsageHistoryFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<UsageWithDetails>> {
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    let whereClause = 'u.organization_id = $1';

    if (filters.itemId) {
      whereClause += ` AND u.item_id = $${paramIndex++}`;
      params.push(filters.itemId);
    }

    if (filters.locationId) {
      whereClause += ` AND u.location_id = $${paramIndex++}`;
      params.push(filters.locationId);
    }

    if (filters.usageType) {
      whereClause += ` AND u.usage_type = $${paramIndex++}`;
      params.push(filters.usageType);
    }

    if (filters.referenceType) {
      whereClause += ` AND u.reference_type = $${paramIndex++}`;
      params.push(filters.referenceType);
    }

    if (filters.referenceId) {
      whereClause += ` AND u.reference_id = $${paramIndex++}`;
      params.push(filters.referenceId);
    }

    if (filters.usedBy) {
      whereClause += ` AND u.used_by ILIKE $${paramIndex++}`;
      params.push(`%${filters.usedBy}%`);
    }

    if (filters.startDate) {
      whereClause += ` AND u.used_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ` AND u.used_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    const baseQuery = `
      SELECT
        u.*,
        i.sku as item_sku,
        i.name as item_name,
        l.name as location_name,
        l.code as location_code
      FROM usage_records u
      INNER JOIN items i ON u.item_id = i.id
      INNER JOIN locations l ON u.location_id = l.id
      WHERE ${whereClause}
      ORDER BY u.used_at DESC
    `;

    const countQuery = `
      SELECT COUNT(*) as count FROM usage_records u WHERE ${whereClause}
    `;

    const result = await executePaginatedQuery<Record<string, unknown>>(
      baseQuery,
      countQuery,
      params,
      pagination
    );

    return {
      data: result.data.map((row) => this.mapToUsageWithDetails(row)),
      pagination: result.pagination,
    };
  }

  /**
   * Gets usage summary by type
   */
  async getSummaryByType(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<UsageTypeSummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        usage_type,
        COUNT(*) as count,
        COALESCE(SUM(quantity), 0) as total_quantity,
        COALESCE(SUM(cost), 0) as total_cost
      FROM usage_records
      WHERE organization_id = $1
        AND used_at >= $2
        AND used_at <= $3
      GROUP BY usage_type
      ORDER BY total_quantity DESC`,
      [organizationId, startDate, endDate]
    );

    return arrayToCamelCase<UsageTypeSummary>(result.rows);
  }

  /**
   * Gets usage summary by item
   */
  async getSummaryByItem(
    organizationId: string,
    startDate: Date,
    endDate: Date,
    limit: number = 20
  ): Promise<ItemUsageSummary[]> {
    const daysInPeriod = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) || 1;

    const result = await db.query<Record<string, unknown>>(
      `SELECT
        u.item_id,
        i.sku,
        i.name,
        COALESCE(SUM(u.quantity), 0) as total_used,
        COALESCE(SUM(u.cost), 0) as total_cost
      FROM usage_records u
      INNER JOIN items i ON u.item_id = i.id
      WHERE u.organization_id = $1
        AND u.used_at >= $2
        AND u.used_at <= $3
      GROUP BY u.item_id, i.sku, i.name
      ORDER BY total_used DESC
      LIMIT $4`,
      [organizationId, startDate, endDate, limit]
    );

    return result.rows.map((row) => ({
      itemId: row.item_id as string,
      sku: row.sku as string,
      name: row.name as string,
      totalUsed: Number(row.total_used),
      totalCost: Number(row.total_cost),
      averageDaily: Number(row.total_used) / daysInPeriod,
    }));
  }

  /**
   * Gets daily usage trends
   */
  async getDailyTrends(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DailyUsageTrend[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        DATE(used_at) as date,
        COALESCE(SUM(quantity), 0) as quantity,
        COALESCE(SUM(cost), 0) as cost,
        COUNT(*) as record_count
      FROM usage_records
      WHERE organization_id = $1
        AND used_at >= $2
        AND used_at <= $3
      GROUP BY DATE(used_at)
      ORDER BY date ASC`,
      [organizationId, startDate, endDate]
    );

    return result.rows.map((row) => ({
      date: (row.date as Date).toISOString().split('T')[0],
      quantity: Number(row.quantity),
      cost: Number(row.cost),
      recordCount: Number(row.record_count),
    }));
  }

  /**
   * Maps database row to UsageWithDetails
   */
  private mapToUsageWithDetails(row: Record<string, unknown>): UsageWithDetails {
    const usage = objectToCamelCase<UsageRecord>(row);

    return {
      ...usage,
      item: {
        id: row.item_id as string,
        sku: row.item_sku as string,
        name: row.item_name as string,
      },
      location: {
        id: row.location_id as string,
        name: row.location_name as string,
        code: row.location_code as string,
      },
    };
  }
}

// Export singleton instance
export const usageRepository = new UsageRepository();

