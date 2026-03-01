/**
 * Movements Repository
 * Database access layer for stock movement operations
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
  Movement,
  MovementWithDetails,
  MovementLine,
  MovementHistoryFilters,
  MovementSummary,
  MovementStatus,
} from './types.ts';
import type {
  CreateMovementInput,
  CreateTransferInput,
  CreateAdjustmentInput,
} from './validation.ts';

/**
 * Movements Repository Class
 */
export class MovementsRepository {
  /**
   * Creates a new movement record
   */
  async create(
    input: CreateMovementInput,
    organizationId: string,
    userId: string
  ): Promise<Movement> {
    const id = generateId();
    const now = new Date();

    // Calculate total value
    const totalValue = (input.unitCost ?? 0) * input.quantity;

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO movements (
        id, type, item_id, from_location_id, to_location_id,
        quantity, unit_cost, total_value, reference_type, reference_id,
        notes, status, organization_id,
        created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $14, $15)
      RETURNING *`,
      [
        id,
        input.type,
        input.itemId,
        input.fromLocationId ?? null,
        input.toLocationId ?? null,
        input.quantity,
        input.unitCost ?? 0,
        totalValue,
        input.referenceType ?? null,
        input.referenceId ?? null,
        input.notes ?? null,
        'pending',
        organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<Movement>(result.rows[0]!);
  }

  /**
   * Creates a transfer with multiple items
   */
  async createTransfer(
    input: CreateTransferInput,
    organizationId: string,
    userId: string
  ): Promise<Movement[]> {
    const movements: Movement[] = [];

    await db.withTransaction(async (tx) => {
      for (const item of input.items) {
        const id = generateId();
        const now = new Date();

        const result = await tx.query<Record<string, unknown>>(
          `INSERT INTO movements (
            id, type, item_id, from_location_id, to_location_id,
            quantity, unit_cost, total_value, notes, status,
            organization_id, created_at, created_by, updated_at, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $12, $13)
          RETURNING *`,
          [
            id,
            'transfer',
            item.itemId,
            input.fromLocationId,
            input.toLocationId,
            item.quantity,
            0,  // Unit cost retrieved from stock
            0,
            input.notes ?? null,
            'pending',
            organizationId,
            now,
            userId,
          ]
        );

        movements.push(objectToCamelCase<Movement>(result.rows[0]!));
      }
    });

    return movements;
  }

  /**
   * Creates an adjustment movement
   */
  async createAdjustment(
    input: CreateAdjustmentInput,
    currentQuantity: number,
    organizationId: string,
    userId: string
  ): Promise<Movement> {
    const id = generateId();
    const now = new Date();

    // Calculate the actual quantity change
    let adjustmentQuantity: number;
    let movementType: string;

    switch (input.adjustmentType) {
      case 'increase':
        adjustmentQuantity = input.quantity;
        movementType = 'adjustment';
        break;
      case 'decrease':
        adjustmentQuantity = -input.quantity;
        movementType = 'adjustment';
        break;
      case 'set':
        adjustmentQuantity = input.quantity - currentQuantity;
        movementType = 'adjustment';
        break;
    }

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO movements (
        id, type, item_id, from_location_id, to_location_id,
        quantity, unit_cost, total_value, reference_type, notes,
        status, organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $13, $14)
      RETURNING *`,
      [
        id,
        movementType,
        input.itemId,
        adjustmentQuantity < 0 ? input.locationId : null,
        adjustmentQuantity > 0 ? input.locationId : null,
        Math.abs(adjustmentQuantity),
        0,
        0,
        'adjustment',
        `${input.reason}: ${input.notes}`,
        'completed',  // Adjustments are immediately completed
        organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<Movement>(result.rows[0]!);
  }

  /**
   * Gets movement history with filters
   */
  async findHistory(
    organizationId: string,
    filters: MovementHistoryFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<MovementWithDetails>> {
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    let whereClause = 'm.organization_id = $1';

    if (filters.itemId) {
      whereClause += ` AND m.item_id = $${paramIndex++}`;
      params.push(filters.itemId);
    }

    if (filters.locationId) {
      whereClause += ` AND (m.from_location_id = $${paramIndex} OR m.to_location_id = $${paramIndex})`;
      params.push(filters.locationId);
      paramIndex++;
    }

    if (filters.type) {
      whereClause += ` AND m.type = $${paramIndex++}`;
      params.push(filters.type);
    }

    if (filters.status) {
      whereClause += ` AND m.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.startDate) {
      whereClause += ` AND m.created_at >= $${paramIndex++}`;
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClause += ` AND m.created_at <= $${paramIndex++}`;
      params.push(filters.endDate);
    }

    if (filters.referenceType) {
      whereClause += ` AND m.reference_type = $${paramIndex++}`;
      params.push(filters.referenceType);
    }

    if (filters.referenceId) {
      whereClause += ` AND m.reference_id = $${paramIndex++}`;
      params.push(filters.referenceId);
    }

    const baseQuery = `
      SELECT
        m.*,
        i.sku as item_sku,
        i.name as item_name,
        fl.name as from_location_name,
        fl.code as from_location_code,
        tl.name as to_location_name,
        tl.code as to_location_code
      FROM movements m
      INNER JOIN items i ON m.item_id = i.id
      LEFT JOIN locations fl ON m.from_location_id = fl.id
      LEFT JOIN locations tl ON m.to_location_id = tl.id
      WHERE ${whereClause}
      ORDER BY m.created_at DESC
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM movements m
      WHERE ${whereClause}
    `;

    const result = await executePaginatedQuery<Record<string, unknown>>(
      baseQuery,
      countQuery,
      params,
      pagination
    );

    return {
      data: result.data.map((row) => this.mapToMovementWithDetails(row)),
      pagination: result.pagination,
    };
  }

  /**
   * Updates movement status
   */
  async updateStatus(
    movementId: string,
    status: MovementStatus,
    userId: string
  ): Promise<Movement | null> {
    const updateFields: Record<string, unknown> = {
      status,
      updated_at: new Date(),
      updated_by: userId,
    };

    if (status === 'approved') {
      updateFields.approved_by = userId;
      updateFields.approved_at = new Date();
    }

    if (status === 'completed') {
      updateFields.completed_at = new Date();
    }

    const setClauses = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const result = await db.query<Record<string, unknown>>(
      `UPDATE movements SET ${setClauses} WHERE id = $1 RETURNING *`,
      [movementId, ...Object.values(updateFields)]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return objectToCamelCase<Movement>(result.rows[0]);
  }

  /**
   * Gets movement summary by type
   */
  async getSummary(
    organizationId: string,
    startDate: Date,
    endDate: Date
  ): Promise<MovementSummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        type,
        COUNT(*) as count,
        SUM(quantity) as total_quantity,
        SUM(total_value) as total_value
      FROM movements
      WHERE organization_id = $1
        AND created_at >= $2
        AND created_at <= $3
        AND status != 'cancelled'
      GROUP BY type
      ORDER BY count DESC`,
      [organizationId, startDate, endDate]
    );

    return arrayToCamelCase<MovementSummary>(result.rows);
  }

  /**
   * Maps database row to MovementWithDetails
   */
  private mapToMovementWithDetails(row: Record<string, unknown>): MovementWithDetails {
    const movement = objectToCamelCase<Movement>(row);

    return {
      ...movement,
      item: {
        id: row.item_id as string,
        sku: row.item_sku as string,
        name: row.item_name as string,
      },
      fromLocation: row.from_location_id ? {
        id: row.from_location_id as string,
        name: row.from_location_name as string,
        code: row.from_location_code as string,
      } : null,
      toLocation: row.to_location_id ? {
        id: row.to_location_id as string,
        name: row.to_location_name as string,
        code: row.to_location_code as string,
      } : null,
    };
  }
}

// Export singleton instance
export const movementsRepository = new MovementsRepository();

