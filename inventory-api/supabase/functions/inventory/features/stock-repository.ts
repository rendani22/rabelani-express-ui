/**
 * Stock Repository - Supabase Version
 * Uses Supabase client and RPC functions for database operations
 */

import { db } from '../database/supabase-client.ts';
import type { PaginationParams, PaginatedResult } from '../core/types/index.ts';
import type {
  Stock,
  StockWithItem,
  SerializedStock,
  BatchStock,
  StockFilters,
} from './types.ts';
import type {
  CreateSerializedStockInput,
  CreateBatchStockInput,
  UpdateExpiryInput,
} from './validation.ts';

/**
 * Stock Repository - Supabase Implementation
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
    const client = db.getClient();
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    // Build the query with filters
    let query = client
      .from('stock')
      .select(`
        *,
        items!inner (id, sku, name, category),
        locations!inner (id, name, code)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .is('deleted_at', null);

    // Apply filters
    if (filters.itemId) {
      query = query.eq('item_id', filters.itemId);
    }
    if (filters.locationId) {
      query = query.eq('location_id', filters.locationId);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    // Apply pagination
    query = query
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      throw new Error(`Failed to fetch stock: ${error.message}`);
    }

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: (data || []).map(this.mapToStockWithItem),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Finds stock record by item ID
   */
  async findByItemId(
    itemId: string,
    organizationId: string
  ): Promise<StockWithItem[]> {
    const client = db.getClient();

    const { data, error } = await client
      .from('stock')
      .select(`
        *,
        items!inner (id, sku, name, category),
        locations!inner (id, name, code)
      `)
      .eq('item_id', itemId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('locations(name)');

    if (error) {
      throw new Error(`Failed to fetch stock by item: ${error.message}`);
    }

    return (data || []).map(this.mapToStockWithItem);
  }

  /**
   * Finds stock records by location ID
   */
  async findByLocationId(
    locationId: string,
    organizationId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResult<StockWithItem>> {
    const client = db.getClient();
    const { page, limit } = pagination;
    const offset = (page - 1) * limit;

    const { data, count, error } = await client
      .from('stock')
      .select(`
        *,
        items!inner (id, sku, name, category),
        locations!inner (id, name, code)
      `, { count: 'exact' })
      .eq('location_id', locationId)
      .eq('organization_id', organizationId)
      .is('deleted_at', null)
      .order('items(name)')
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to fetch stock by location: ${error.message}`);
    }

    const totalItems = count || 0;
    const totalPages = Math.ceil(totalItems / limit);

    return {
      data: (data || []).map(this.mapToStockWithItem),
      pagination: {
        page,
        limit,
        totalItems,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Creates serialized stock entries using RPC function
   */
  async createSerializedStock(
    input: CreateSerializedStockInput,
    organizationId: string,
    userId: string
  ): Promise<SerializedStock[]> {
    // Use RPC function for atomic operation
    const result = await db.rpc<{
      success: boolean;
      stockId: string;
      itemsCreated: number;
      items: Array<{ id: string; serialNumber: string; status: string }>;
    }>('create_serialized_stock', {
      p_item_id: input.itemId,
      p_location_id: input.locationId,
      p_serial_numbers: input.serialNumbers,
      p_received_date: input.receivedDate?.toISOString().split('T')[0] || new Date().toISOString().split('T')[0],
      p_expiry_date: input.expiryDate?.toISOString().split('T')[0] || null,
      p_warranty_expiry: input.warrantyExpiry?.toISOString().split('T')[0] || null,
      p_metadata: input.metadata || {},
      p_organization_id: organizationId,
      p_user_id: userId,
    });

    if (!result.success) {
      throw new Error('Failed to create serialized stock');
    }

    // Return the created items
    return result.items.map((item) => ({
      id: item.id,
      stockId: result.stockId,
      itemId: input.itemId,
      serialNumber: item.serialNumber,
      status: item.status as SerializedStock['status'],
      locationId: input.locationId,
      receivedDate: input.receivedDate || new Date(),
      expiryDate: input.expiryDate || null,
      warrantyExpiry: input.warrantyExpiry || null,
      metadata: input.metadata || {},
      createdAt: new Date(),
      createdBy: userId,
    }));
  }

  /**
   * Creates batch stock entry using RPC function
   */
  async createBatchStock(
    input: CreateBatchStockInput,
    organizationId: string,
    userId: string
  ): Promise<BatchStock> {
    const result = await db.rpc<{
      success: boolean;
      stockId: string;
      batchId: string;
      quantity: number;
    }>('create_batch_stock', {
      p_item_id: input.itemId,
      p_location_id: input.locationId,
      p_batch_number: input.batchNumber,
      p_quantity: input.quantity,
      p_manufacturing_date: input.manufacturingDate?.toISOString().split('T')[0] || null,
      p_expiry_date: input.expiryDate?.toISOString().split('T')[0] || null,
      p_supplier_id: input.supplierId || null,
      p_cost_per_unit: input.costPerUnit,
      p_metadata: input.metadata || {},
      p_organization_id: organizationId,
      p_user_id: userId,
    });

    if (!result.success) {
      throw new Error('Failed to create batch stock');
    }

    return {
      id: result.batchId,
      stockId: result.stockId,
      itemId: input.itemId,
      batchNumber: input.batchNumber,
      quantity: input.quantity,
      manufacturingDate: input.manufacturingDate || null,
      expiryDate: input.expiryDate || null,
      status: 'available',
      locationId: input.locationId,
      supplierId: input.supplierId || null,
      costPerUnit: input.costPerUnit,
      metadata: input.metadata || {},
      createdAt: new Date(),
      createdBy: userId,
    };
  }

  /**
   * Updates expiry date for batch or serialized stock
   */
  async updateExpiry(
    input: UpdateExpiryInput,
    organizationId: string,
    userId: string
  ): Promise<{ updated: boolean; previousExpiry: Date | null }> {
    const client = db.getClient();
    let previousExpiry: Date | null = null;

    if (input.batchNumber) {
      // Get current expiry
      const { data: current } = await client
        .from('batch_stock')
        .select('expiry_date')
        .eq('stock_id', input.stockId)
        .eq('batch_number', input.batchNumber)
        .single();

      previousExpiry = current?.expiry_date ? new Date(current.expiry_date) : null;

      // Update
      const { error } = await client
        .from('batch_stock')
        .update({ expiry_date: input.newExpiryDate.toISOString() })
        .eq('stock_id', input.stockId)
        .eq('batch_number', input.batchNumber);

      if (error) {
        throw new Error(`Failed to update expiry: ${error.message}`);
      }
    } else if (input.serialNumber) {
      // Get current expiry
      const { data: current } = await client
        .from('serialized_stock')
        .select('expiry_date')
        .eq('stock_id', input.stockId)
        .eq('serial_number', input.serialNumber)
        .single();

      previousExpiry = current?.expiry_date ? new Date(current.expiry_date) : null;

      // Update
      const { error } = await client
        .from('serialized_stock')
        .update({ expiry_date: input.newExpiryDate.toISOString() })
        .eq('stock_id', input.stockId)
        .eq('serial_number', input.serialNumber);

      if (error) {
        throw new Error(`Failed to update expiry: ${error.message}`);
      }
    }

    return { updated: true, previousExpiry };
  }

  /**
   * Maps Supabase row to StockWithItem
   */
  private mapToStockWithItem(row: Record<string, unknown>): StockWithItem {
    const items = row.items as Record<string, unknown>;
    const locations = row.locations as Record<string, unknown>;

    return {
      id: row.id as string,
      itemId: row.item_id as string,
      locationId: row.location_id as string,
      quantity: row.quantity as number,
      reservedQuantity: row.reserved_quantity as number,
      availableQuantity: row.available_quantity as number,
      unitOfMeasure: row.unit_of_measure as Stock['unitOfMeasure'],
      status: row.status as Stock['status'],
      lastCountDate: row.last_count_date ? new Date(row.last_count_date as string) : null,
      organizationId: row.organization_id as string,
      createdAt: new Date(row.created_at as string),
      createdBy: row.created_by as string,
      updatedAt: new Date(row.updated_at as string),
      updatedBy: row.updated_by as string,
      item: {
        id: items.id as string,
        sku: items.sku as string,
        name: items.name as string,
        category: items.category as string,
      },
      location: {
        id: locations.id as string,
        name: locations.name as string,
        code: locations.code as string,
      },
    };
  }
}

// Export singleton instance
export const stockRepository = new StockRepository();

