/**
 * Stock Repository
 * Database access layer for stock-related operations
 * All database queries are isolated here for maintainability
 */

import { db, type QueryResult } from '../../database/client.ts';
import {
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  executePaginatedQuery,
  generateId,
  objectToCamelCase,
  arrayToCamelCase,
  withOrganizationScope,
  withoutDeleted,
} from '../../database/queries.ts';
import type { PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  Stock,
  StockWithItem,
  SerializedStock,
  BatchStock,
  StockSummary,
  StockFilters,
  LocationStockSummary,
} from './types.ts';
import type {
  CreateSerializedStockInput,
  CreateBatchStockInput,
  UpdateExpiryInput,
} from './validation.ts';

/**
 * Stock Repository Class
 * Handles all database operations for stock management
 */
export class StockRepository {
  /**
   * Retrieves paginated stock records with optional filters
   */
  async findAll(
    organizationId: string,
    filters: StockFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<StockWithItem>> {
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    // Base query with joins for item and location details
    let whereClause = 's.organization_id = $1 AND s.deleted_at IS NULL';

    // Apply filters
    if (filters.itemId) {
      whereClause += ` AND s.item_id = $${paramIndex++}`;
      params.push(filters.itemId);
    }

    if (filters.locationId) {
      whereClause += ` AND s.location_id = $${paramIndex++}`;
      params.push(filters.locationId);
    }

    if (filters.status) {
      whereClause += ` AND s.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters.lowStock) {
      // Join with item to check against reorder point
      whereClause += ` AND s.available_quantity <= i.reorder_point`;
    }

    if (filters.expiringSoon && filters.expiringWithinDays) {
      whereClause += ` AND EXISTS (
        SELECT 1 FROM batch_stock bs
        WHERE bs.stock_id = s.id
        AND bs.expiry_date <= NOW() + INTERVAL '${filters.expiringWithinDays} days'
      )`;
    }

    const baseQuery = `
      SELECT
        s.*,
        i.sku as item_sku,
        i.name as item_name,
        i.category as item_category,
        l.name as location_name,
        l.code as location_code
      FROM stock s
      INNER JOIN items i ON s.item_id = i.id
      INNER JOIN locations l ON s.location_id = l.id
      WHERE ${whereClause}
      ORDER BY s.updated_at DESC
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM stock s
      INNER JOIN items i ON s.item_id = i.id
      WHERE ${whereClause}
    `;

    const result = await executePaginatedQuery<Record<string, unknown>>(
      baseQuery,
      countQuery,
      params,
      pagination
    );

    // Transform to StockWithItem structure
    return {
      data: result.data.map((row) => this.mapToStockWithItem(row)),
      pagination: result.pagination,
    };
  }

  /**
   * Finds stock record by item ID
   */
  async findByItemId(
    itemId: string,
    organizationId: string
  ): Promise<StockWithItem[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        s.*,
        i.sku as item_sku,
        i.name as item_name,
        i.category as item_category,
        l.name as location_name,
        l.code as location_code
      FROM stock s
      INNER JOIN items i ON s.item_id = i.id
      INNER JOIN locations l ON s.location_id = l.id
      WHERE s.item_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
      ORDER BY l.name`,
      [itemId, organizationId]
    );

    return result.rows.map((row) => this.mapToStockWithItem(row));
  }

  /**
   * Finds stock records by location ID
   */
  async findByLocationId(
    locationId: string,
    organizationId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResult<StockWithItem>> {
    const baseQuery = `
      SELECT
        s.*,
        i.sku as item_sku,
        i.name as item_name,
        i.category as item_category,
        l.name as location_name,
        l.code as location_code
      FROM stock s
      INNER JOIN items i ON s.item_id = i.id
      INNER JOIN locations l ON s.location_id = l.id
      WHERE s.location_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
      ORDER BY i.name
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM stock s
      WHERE s.location_id = $1 AND s.organization_id = $2 AND s.deleted_at IS NULL
    `;

    return await executePaginatedQuery<StockWithItem>(
      baseQuery,
      countQuery,
      [locationId, organizationId],
      pagination
    );
  }

  /**
   * Creates serialized stock entries (individual serial numbers)
   */
  async createSerializedStock(
    input: CreateSerializedStockInput,
    organizationId: string,
    userId: string
  ): Promise<SerializedStock[]> {
    const createdItems: SerializedStock[] = [];

    // Use transaction for atomicity
    await db.withTransaction(async (tx) => {
      // First, ensure stock record exists for this item/location
      const stockId = await this.ensureStockRecord(
        input.itemId,
        input.locationId,
        organizationId,
        userId,
        tx
      );

      // Create individual serial number records
      for (const serialNumber of input.serialNumbers) {
        const id = generateId();
        const result = await tx.query<Record<string, unknown>>(
          `INSERT INTO serialized_stock (
            id, stock_id, item_id, serial_number, status, location_id,
            received_date, expiry_date, warranty_expiry, metadata,
            created_at, created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), $11)
          RETURNING *`,
          [
            id,
            stockId,
            input.itemId,
            serialNumber,
            'available',
            input.locationId,
            input.receivedDate,
            input.expiryDate,
            input.warrantyExpiry,
            JSON.stringify(input.metadata),
            userId,
          ]
        );

        if (result.rows[0]) {
          createdItems.push(objectToCamelCase<SerializedStock>(result.rows[0]));
        }
      }

      // Update stock quantity
      await tx.query(
        `UPDATE stock SET
          quantity = quantity + $1,
          available_quantity = available_quantity + $1,
          updated_at = NOW(),
          updated_by = $2
        WHERE id = $3`,
        [input.serialNumbers.length, userId, stockId]
      );
    });

    return createdItems;
  }

  /**
   * Creates batch stock entry
   */
  async createBatchStock(
    input: CreateBatchStockInput,
    organizationId: string,
    userId: string
  ): Promise<BatchStock> {
    return await db.withTransaction(async (tx) => {
      // Ensure stock record exists
      const stockId = await this.ensureStockRecord(
        input.itemId,
        input.locationId,
        organizationId,
        userId,
        tx
      );

      const id = generateId();
      const result = await tx.query<Record<string, unknown>>(
        `INSERT INTO batch_stock (
          id, stock_id, item_id, batch_number, quantity, status,
          manufacturing_date, expiry_date, location_id, supplier_id,
          cost_per_unit, metadata, created_at, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13)
        RETURNING *`,
        [
          id,
          stockId,
          input.itemId,
          input.batchNumber,
          input.quantity,
          'available',
          input.manufacturingDate,
          input.expiryDate,
          input.locationId,
          input.supplierId,
          input.costPerUnit,
          JSON.stringify(input.metadata),
          userId,
        ]
      );

      // Update stock quantity
      await tx.query(
        `UPDATE stock SET
          quantity = quantity + $1,
          available_quantity = available_quantity + $1,
          updated_at = NOW(),
          updated_by = $2
        WHERE id = $3`,
        [input.quantity, userId, stockId]
      );

      return objectToCamelCase<BatchStock>(result.rows[0]!);
    });
  }

  /**
   * Updates expiry date for batch or serialized stock
   */
  async updateExpiry(
    input: UpdateExpiryInput,
    organizationId: string,
    userId: string
  ): Promise<{ updated: boolean; previousExpiry: Date | null }> {
    let previousExpiry: Date | null = null;

    await db.withTransaction(async (tx) => {
      if (input.batchNumber) {
        // Update batch stock expiry
        const current = await tx.query<{ expiry_date: Date | null }>(
          `SELECT expiry_date FROM batch_stock
           WHERE stock_id = $1 AND batch_number = $2`,
          [input.stockId, input.batchNumber]
        );
        previousExpiry = current.rows[0]?.expiry_date ?? null;

        await tx.query(
          `UPDATE batch_stock SET
            expiry_date = $1,
            updated_at = NOW()
          WHERE stock_id = $2 AND batch_number = $3`,
          [input.newExpiryDate, input.stockId, input.batchNumber]
        );
      } else if (input.serialNumber) {
        // Update serialized stock expiry
        const current = await tx.query<{ expiry_date: Date | null }>(
          `SELECT expiry_date FROM serialized_stock
           WHERE stock_id = $1 AND serial_number = $2`,
          [input.stockId, input.serialNumber]
        );
        previousExpiry = current.rows[0]?.expiry_date ?? null;

        await tx.query(
          `UPDATE serialized_stock SET
            expiry_date = $1
          WHERE stock_id = $2 AND serial_number = $3`,
          [input.newExpiryDate, input.stockId, input.serialNumber]
        );
      }
    });

    return { updated: true, previousExpiry };
  }

  /**
   * Gets stock summary aggregated by item
   */
  async getStockSummary(
    organizationId: string
  ): Promise<StockSummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        i.id as item_id,
        i.name as item_name,
        i.sku,
        COALESCE(SUM(s.quantity), 0) as total_quantity,
        COALESCE(SUM(s.reserved_quantity), 0) as total_reserved,
        COALESCE(SUM(s.available_quantity), 0) as total_available,
        COUNT(DISTINCT s.location_id) as location_count,
        CASE WHEN SUM(s.available_quantity) <= i.reorder_point THEN true ELSE false END as low_stock_alert,
        MAX(s.updated_at) as last_movement_date
      FROM items i
      LEFT JOIN stock s ON i.id = s.item_id AND s.deleted_at IS NULL
      WHERE i.organization_id = $1 AND i.deleted_at IS NULL
      GROUP BY i.id, i.name, i.sku, i.reorder_point
      ORDER BY i.name`,
      [organizationId]
    );

    return arrayToCamelCase<StockSummary>(result.rows);
  }

  /**
   * Gets location stock summary
   */
  async getLocationSummary(
    locationId: string,
    organizationId: string
  ): Promise<LocationStockSummary | null> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        l.id as location_id,
        l.name as location_name,
        l.code as location_code,
        COUNT(DISTINCT s.item_id) as item_count,
        COALESCE(SUM(s.quantity), 0) as total_quantity,
        COALESCE(SUM(s.quantity * i.unit_cost), 0) as total_value,
        COALESCE(l.capacity_used, 0) as capacity_used,
        MAX(s.updated_at) as last_activity_date
      FROM locations l
      LEFT JOIN stock s ON l.id = s.location_id AND s.deleted_at IS NULL
      LEFT JOIN items i ON s.item_id = i.id
      WHERE l.id = $1 AND l.organization_id = $2
      GROUP BY l.id, l.name, l.code, l.capacity_used`,
      [locationId, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return objectToCamelCase<LocationStockSummary>(result.rows[0]);
  }

  /**
   * Ensures a stock record exists for an item/location combination
   * Creates one if it doesn't exist
   */
  private async ensureStockRecord(
    itemId: string,
    locationId: string,
    organizationId: string,
    userId: string,
    tx: { query: typeof db.query }
  ): Promise<string> {
    // Check if stock record exists
    const existing = await tx.query<{ id: string }>(
      `SELECT id FROM stock
       WHERE item_id = $1 AND location_id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
      [itemId, locationId, organizationId]
    );

    if (existing.rows[0]) {
      return existing.rows[0].id;
    }

    // Create new stock record
    const id = generateId();
    await tx.query(
      `INSERT INTO stock (
        id, item_id, location_id, quantity, reserved_quantity, available_quantity,
        unit_of_measure, status, organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, 0, 0, 0, 'piece', 'available', $4, NOW(), $5, NOW(), $5)`,
      [id, itemId, locationId, organizationId, userId]
    );

    return id;
  }

  /**
   * Maps database row to StockWithItem structure
   */
  private mapToStockWithItem(row: Record<string, unknown>): StockWithItem {
    return {
      id: row.id as string,
      itemId: row.item_id as string,
      locationId: row.location_id as string,
      quantity: row.quantity as number,
      reservedQuantity: row.reserved_quantity as number,
      availableQuantity: row.available_quantity as number,
      unitOfMeasure: row.unit_of_measure as Stock['unitOfMeasure'],
      status: row.status as Stock['status'],
      lastCountDate: row.last_count_date as Date | null,
      organizationId: row.organization_id as string,
      createdAt: row.created_at as Date,
      createdBy: row.created_by as string,
      updatedAt: row.updated_at as Date,
      updatedBy: row.updated_by as string,
      item: {
        id: row.item_id as string,
        sku: row.item_sku as string,
        name: row.item_name as string,
        category: row.item_category as string,
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
export const stockRepository = new StockRepository();

