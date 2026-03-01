/**
 * Items Repository
 * Database access layer for item management operations
 */

import { db } from '../../database/client.ts';
import {
  buildInsertQuery,
  buildUpdateQuery,
  executePaginatedQuery,
  generateId,
  objectToCamelCase,
  objectToSnakeCase,
  arrayToCamelCase,
} from '../../database/queries.ts';
import type { PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  Item,
  ItemWithStock,
  ItemVariant,
  ItemAttribute,
  ItemFilters,
  CategorySummary,
} from './types.ts';
import type {
  CreateItemInput,
  UpdateItemInput,
  CreateVariantInput,
  CreateAttributeInput,
} from './validation.ts';

/**
 * Items Repository Class
 * Handles all database operations for item management
 */
export class ItemsRepository {
  /**
   * Creates a new item
   */
  async create(
    input: CreateItemInput,
    organizationId: string,
    userId: string
  ): Promise<Item> {
    const id = generateId();
    const now = new Date();

    const data = {
      id,
      ...objectToSnakeCase(input),
      dimensions: input.dimensions ? JSON.stringify(input.dimensions) : null,
      metadata: JSON.stringify(input.metadata || {}),
      is_active: true,
      organization_id: organizationId,
      created_at: now,
      created_by: userId,
      updated_at: now,
      updated_by: userId,
      deleted_at: null,
      deleted_by: null,
    };

    const { sql, params } = buildInsertQuery('items', data);
    const result = await db.query<Record<string, unknown>>(sql, params);

    return this.mapToItem(result.rows[0]!);
  }

  /**
   * Finds all items with filtering and pagination
   */
  async findAll(
    organizationId: string,
    filters: ItemFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<ItemWithStock>> {
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    // Build WHERE clause
    let whereClause = 'i.organization_id = $1 AND i.deleted_at IS NULL';

    if (filters.search) {
      whereClause += ` AND (i.name ILIKE $${paramIndex} OR i.sku ILIKE $${paramIndex} OR i.description ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.category) {
      whereClause += ` AND i.category = $${paramIndex++}`;
      params.push(filters.category);
    }

    if (filters.subcategory) {
      whereClause += ` AND i.subcategory = $${paramIndex++}`;
      params.push(filters.subcategory);
    }

    if (filters.isActive !== undefined) {
      whereClause += ` AND i.is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    if (filters.isSerialized !== undefined) {
      whereClause += ` AND i.is_serialized = $${paramIndex++}`;
      params.push(filters.isSerialized);
    }

    if (filters.isBatchTracked !== undefined) {
      whereClause += ` AND i.is_batch_tracked = $${paramIndex++}`;
      params.push(filters.isBatchTracked);
    }

    if (filters.lowStock) {
      whereClause += ` AND COALESCE(stock_agg.available_stock, 0) <= i.reorder_point`;
    }

    const baseQuery = `
      SELECT
        i.*,
        COALESCE(stock_agg.total_stock, 0) as total_stock,
        COALESCE(stock_agg.available_stock, 0) as available_stock,
        COALESCE(stock_agg.reserved_stock, 0) as reserved_stock,
        COALESCE(stock_agg.location_count, 0) as location_count
      FROM items i
      LEFT JOIN (
        SELECT
          item_id,
          SUM(quantity) as total_stock,
          SUM(available_quantity) as available_stock,
          SUM(reserved_quantity) as reserved_stock,
          COUNT(DISTINCT location_id) as location_count
        FROM stock
        WHERE deleted_at IS NULL
        GROUP BY item_id
      ) stock_agg ON i.id = stock_agg.item_id
      WHERE ${whereClause}
      ORDER BY i.name ASC
    `;

    const countQuery = `
      SELECT COUNT(*) as count FROM items i WHERE ${whereClause}
    `;

    const result = await executePaginatedQuery<Record<string, unknown>>(
      baseQuery,
      countQuery,
      params,
      pagination
    );

    return {
      data: result.data.map((row) => this.mapToItemWithStock(row)),
      pagination: result.pagination,
    };
  }

  /**
   * Finds an item by ID
   */
  async findById(
    id: string,
    organizationId: string
  ): Promise<Item | null> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT * FROM items
       WHERE id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [id, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToItem(result.rows[0]);
  }

  /**
   * Finds an item by SKU
   */
  async findBySku(
    sku: string,
    organizationId: string
  ): Promise<Item | null> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT * FROM items
       WHERE sku = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [sku, organizationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapToItem(result.rows[0]);
  }

  /**
   * Updates an item
   */
  async update(
    id: string,
    input: UpdateItemInput,
    organizationId: string,
    userId: string
  ): Promise<Item | null> {
    // Get current item first
    const current = await this.findById(id, organizationId);
    if (!current) {
      return null;
    }

    const updateData: Record<string, unknown> = {
      ...objectToSnakeCase(input),
      updated_at: new Date(),
      updated_by: userId,
    };

    // Handle special fields
    if (input.dimensions !== undefined) {
      updateData.dimensions = input.dimensions ? JSON.stringify(input.dimensions) : null;
    }
    if (input.metadata !== undefined) {
      updateData.metadata = JSON.stringify(input.metadata);
    }

    const { sql, params } = buildUpdateQuery('items', id, updateData);
    const result = await db.query<Record<string, unknown>>(sql, params);

    return this.mapToItem(result.rows[0]!);
  }

  /**
   * Soft deletes an item
   */
  async delete(
    id: string,
    organizationId: string,
    userId: string
  ): Promise<boolean> {
    const result = await db.query(
      `UPDATE items
       SET deleted_at = NOW(), deleted_by = $1
       WHERE id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
      [userId, id, organizationId]
    );

    return result.rowCount > 0;
  }

  /**
   * Creates an item variant
   */
  async createVariant(
    itemId: string,
    input: CreateVariantInput,
    userId: string
  ): Promise<ItemVariant> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO item_variants (
        id, item_id, sku, name, attributes, unit_cost, unit_price,
        barcode, is_active, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11)
      RETURNING *`,
      [
        id,
        itemId,
        input.sku,
        input.name,
        JSON.stringify(input.attributes),
        input.unitCost,
        input.unitPrice ?? null,
        input.barcode ?? null,
        true,
        now,
        userId,
      ]
    );

    return objectToCamelCase<ItemVariant>(result.rows[0]!);
  }

  /**
   * Finds variants for an item
   */
  async findVariantsByItemId(itemId: string): Promise<ItemVariant[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT * FROM item_variants WHERE item_id = $1 ORDER BY name`,
      [itemId]
    );

    return arrayToCamelCase<ItemVariant>(result.rows);
  }

  /**
   * Creates an attribute definition
   */
  async createAttribute(
    input: CreateAttributeInput,
    organizationId: string,
    userId: string
  ): Promise<ItemAttribute> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO item_attributes (
        id, name, code, data_type, values, is_required,
        organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $9)
      RETURNING *`,
      [
        id,
        input.name,
        input.code,
        input.dataType,
        input.values ? JSON.stringify(input.values) : null,
        input.isRequired ?? false,
        organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<ItemAttribute>(result.rows[0]!);
  }

  /**
   * Gets category summary
   */
  async getCategorySummary(organizationId: string): Promise<CategorySummary[]> {
    const result = await db.query<Record<string, unknown>>(
      `SELECT
        category,
        COUNT(*) as item_count,
        COALESCE(SUM(unit_cost), 0) as total_value
      FROM items
      WHERE organization_id = $1 AND deleted_at IS NULL
      GROUP BY category
      ORDER BY category`,
      [organizationId]
    );

    return arrayToCamelCase<CategorySummary>(result.rows);
  }

  /**
   * Maps database row to Item entity
   */
  private mapToItem(row: Record<string, unknown>): Item {
    const item = objectToCamelCase<Item>(row);

    // Parse JSON fields
    if (typeof row.dimensions === 'string') {
      item.dimensions = JSON.parse(row.dimensions);
    }
    if (typeof row.metadata === 'string') {
      item.metadata = JSON.parse(row.metadata);
    }

    return item;
  }

  /**
   * Maps database row to ItemWithStock entity
   */
  private mapToItemWithStock(row: Record<string, unknown>): ItemWithStock {
    const item = this.mapToItem(row);

    return {
      ...item,
      totalStock: Number(row.total_stock) || 0,
      availableStock: Number(row.available_stock) || 0,
      reservedStock: Number(row.reserved_stock) || 0,
      locationCount: Number(row.location_count) || 0,
    };
  }
}

// Export singleton instance
export const itemsRepository = new ItemsRepository();

