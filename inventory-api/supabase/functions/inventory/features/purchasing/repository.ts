/**
 * Purchasing Repository
 * Database access layer for supplier and purchase order operations
 */

import { db } from '../../database/supabase-client.ts';
import {
  executePaginatedQuery,
  generateId,
  objectToCamelCase,
  objectToSnakeCase,
  arrayToCamelCase,
} from '../../database/queries.ts';
import type { PaginationParams, PaginatedResult, PurchaseOrderStatus } from '../../core/types/index.ts';
import type {
  Supplier,
  PurchaseOrder,
  PurchaseOrderWithDetails,
  PurchaseOrderLine,
  RestockRule,
  SupplierFilters,
  PurchaseOrderFilters,
} from './types.ts';
import type {
  CreateSupplierInput,
  CreatePurchaseOrderInput,
  CreateRestockRuleInput,
} from './validation.ts';

/**
 * Purchasing Repository Class
 */
export class PurchasingRepository {
  /**
   * Creates a new supplier
   */
  async createSupplier(
    input: CreateSupplierInput,
    organizationId: string,
    userId: string
  ): Promise<Supplier> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO suppliers (
        id, code, name, contact_name, email, phone, address,
        payment_terms, lead_time_days, minimum_order_value, notes,
        is_active, organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $14, $15)
      RETURNING *`,
      [
        id,
        input.code,
        input.name,
        input.contactName ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.address ? JSON.stringify(input.address) : null,
        input.paymentTerms ?? null,
        input.leadTimeDays ?? 7,
        input.minimumOrderValue ?? null,
        input.notes ?? null,
        true,
        organizationId,
        now,
        userId,
      ]
    );

    return this.mapToSupplier(result.rows[0]!);
  }

  /**
   * Finds all suppliers with filtering
   */
  async findAllSuppliers(
    organizationId: string,
    filters: SupplierFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Supplier>> {
    const params: unknown[] = [organizationId];
    let paramIndex = 2;

    let whereClause = 'organization_id = $1 AND deleted_at IS NULL';

    if (filters.search) {
      whereClause += ` AND (name ILIKE $${paramIndex} OR code ILIKE $${paramIndex})`;
      params.push(`%${filters.search}%`);
      paramIndex++;
    }

    if (filters.isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex++}`;
      params.push(filters.isActive);
    }

    const baseQuery = `
      SELECT * FROM suppliers
      WHERE ${whereClause}
      ORDER BY name ASC
    `;

    const countQuery = `
      SELECT COUNT(*) as count FROM suppliers WHERE ${whereClause}
    `;

    const result = await executePaginatedQuery<Record<string, unknown>>(
      baseQuery,
      countQuery,
      params,
      pagination
    );

    return {
      data: result.data.map((row) => this.mapToSupplier(row)),
      pagination: result.pagination,
    };
  }

  /**
   * Creates a purchase order with lines
   */
  async createPurchaseOrder(
    input: CreatePurchaseOrderInput,
    organizationId: string,
    userId: string
  ): Promise<PurchaseOrderWithDetails> {
    return await db.withTransaction(async (tx) => {
      const id = generateId();
      const now = new Date();
      const orderNumber = await this.generateOrderNumber(organizationId);

      // Calculate totals
      const subtotal = input.lines.reduce(
        (sum, line) => sum + line.quantity * line.unitCost,
        0
      );

      // Create purchase order
      const poResult = await tx.query<Record<string, unknown>>(
        `INSERT INTO purchase_orders (
          id, order_number, supplier_id, status, order_date, expected_delivery_date,
          subtotal, tax, shipping, total, currency, notes,
          organization_id, created_at, created_by, updated_at, updated_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $14, $15)
        RETURNING *`,
        [
          id,
          orderNumber,
          input.supplierId,
          'draft',
          now,
          input.expectedDeliveryDate ?? null,
          subtotal,
          0,  // Tax - would be calculated based on rules
          0,  // Shipping
          subtotal,
          'USD',
          input.notes ?? null,
          organizationId,
          now,
          userId,
        ]
      );

      // Create line items
      const lines: PurchaseOrderLine[] = [];
      for (const lineInput of input.lines) {
        const lineId = generateId();
        const lineResult = await tx.query<Record<string, unknown>>(
          `INSERT INTO purchase_order_lines (
            id, purchase_order_id, item_id, quantity, unit_cost, total_cost,
            received_quantity, location_id, notes,
            created_at, created_by, updated_at, updated_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11)
          RETURNING *`,
          [
            lineId,
            id,
            lineInput.itemId,
            lineInput.quantity,
            lineInput.unitCost,
            lineInput.quantity * lineInput.unitCost,
            0,
            lineInput.locationId ?? null,
            lineInput.notes ?? null,
            now,
            userId,
          ]
        );
        lines.push(objectToCamelCase<PurchaseOrderLine>(lineResult.rows[0]!));
      }

      // Get supplier details
      const supplierResult = await tx.query<Record<string, unknown>>(
        `SELECT id, code, name FROM suppliers WHERE id = $1`,
        [input.supplierId]
      );

      const po = objectToCamelCase<PurchaseOrder>(poResult.rows[0]!);

      return {
        ...po,
        supplier: {
          id: supplierResult.rows[0]!.id as string,
          code: supplierResult.rows[0]!.code as string,
          name: supplierResult.rows[0]!.name as string,
        },
        lines,
      };
    });
  }

  /**
   * Updates purchase order status
   */
  async updatePurchaseOrderStatus(
    orderId: string,
    status: PurchaseOrderStatus,
    organizationId: string,
    userId: string
  ): Promise<PurchaseOrder | null> {
    const updateFields: Record<string, unknown> = {
      status,
      updated_at: new Date(),
      updated_by: userId,
    };

    if (status === 'approved') {
      updateFields.approved_by = userId;
      updateFields.approved_at = new Date();
    }

    if (status === 'received') {
      updateFields.delivered_date = new Date();
    }

    const setClauses = Object.keys(updateFields)
      .map((key, index) => `${key} = $${index + 3}`)
      .join(', ');

    const result = await db.query<Record<string, unknown>>(
      `UPDATE purchase_orders SET ${setClauses}
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [orderId, organizationId, ...Object.values(updateFields)]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return objectToCamelCase<PurchaseOrder>(result.rows[0]);
  }

  /**
   * Creates a restock rule
   */
  async createRestockRule(
    input: CreateRestockRuleInput,
    organizationId: string,
    userId: string
  ): Promise<RestockRule> {
    const id = generateId();
    const now = new Date();

    const result = await db.query<Record<string, unknown>>(
      `INSERT INTO restock_rules (
        id, item_id, supplier_id, reorder_point, reorder_quantity,
        minimum_order_quantity, lead_time_days, is_active,
        organization_id, created_at, created_by, updated_at, updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $10, $11)
      RETURNING *`,
      [
        id,
        input.itemId,
        input.supplierId,
        input.reorderPoint,
        input.reorderQuantity,
        input.minimumOrderQuantity ?? 1,
        input.leadTimeDays ?? null,
        true,
        organizationId,
        now,
        userId,
      ]
    );

    return objectToCamelCase<RestockRule>(result.rows[0]!);
  }

  /**
   * Generates a unique order number
   */
  private async generateOrderNumber(organizationId: string): Promise<string> {
    const result = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM purchase_orders WHERE organization_id = $1`,
      [organizationId]
    );
    const count = parseInt(result.rows[0]?.count || '0', 10) + 1;
    const year = new Date().getFullYear();
    return `PO-${year}-${count.toString().padStart(6, '0')}`;
  }

  /**
   * Maps database row to Supplier
   */
  private mapToSupplier(row: Record<string, unknown>): Supplier {
    const supplier = objectToCamelCase<Supplier>(row);
    if (typeof row.address === 'string') {
      supplier.address = JSON.parse(row.address);
    }
    return supplier;
  }
}

// Export singleton instance
export const purchasingRepository = new PurchasingRepository();

