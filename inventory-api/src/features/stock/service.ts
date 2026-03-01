/**
 * Stock Service
 * Business logic layer for stock tracking functionality
 * Services do not access request objects - they work with validated data only
 */

import { stockRepository } from './repository.ts';
import type { AuthUser, PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
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
import { createAuditLog, calculateChanges } from '../../core/utils/audit.ts';
import { NotFoundError, BusinessError } from '../../core/errors/index.ts';
import { ErrorCode } from '../../core/types/response.ts';

/**
 * Stock Service Class
 * Contains all business logic for stock operations
 */
export class StockService {
  /**
   * Retrieves all stock records with filtering and pagination
   * Filters results to user's organization automatically
   */
  async getAllStock(
    user: AuthUser,
    filters: StockFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<StockWithItem>> {
    // Business rule: Users can only see stock within their organization
    return await stockRepository.findAll(
      user.organizationId,
      filters,
      pagination
    );
  }

  /**
   * Retrieves stock levels for a specific item across all locations
   */
  async getStockByItem(
    user: AuthUser,
    itemId: string
  ): Promise<StockWithItem[]> {
    const stock = await stockRepository.findByItemId(itemId, user.organizationId);

    // Validate that we found the item (even with zero stock)
    if (stock.length === 0) {
      // Check if the item exists but has no stock
      throw new NotFoundError('Stock', itemId);
    }

    return stock;
  }

  /**
   * Retrieves all stock at a specific location
   */
  async getStockByLocation(
    user: AuthUser,
    locationId: string,
    pagination: PaginationParams
  ): Promise<PaginatedResult<StockWithItem>> {
    // First verify the location exists and belongs to user's org
    const locationSummary = await stockRepository.getLocationSummary(
      locationId,
      user.organizationId
    );

    if (!locationSummary) {
      throw new NotFoundError('Location', locationId);
    }

    return await stockRepository.findByLocationId(
      locationId,
      user.organizationId,
      pagination
    );
  }

  /**
   * Creates serialized stock entries with individual serial numbers
   * Used for high-value items or items requiring warranty tracking
   */
  async createSerializedStock(
    user: AuthUser,
    input: CreateSerializedStockInput
  ): Promise<SerializedStock[]> {
    // Business rule: Check for duplicate serial numbers within the item
    // (This would be handled by unique constraint in DB, but we can provide better error)

    // Create the serialized stock records
    const createdStock = await stockRepository.createSerializedStock(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log for this mutation
    await createAuditLog(
      'stock',
      'CREATE',
      'serialized_stock',
      createdStock[0]?.id ?? 'batch',
      user,
      calculateChanges(null, {
        itemId: input.itemId,
        locationId: input.locationId,
        serialNumberCount: input.serialNumbers.length,
      }),
      { serialNumbers: input.serialNumbers }
    );

    return createdStock;
  }

  /**
   * Creates batch stock entry for lot-tracked items
   * Used for items with batch numbers, expiry dates, etc.
   */
  async createBatchStock(
    user: AuthUser,
    input: CreateBatchStockInput
  ): Promise<BatchStock> {
    // Business rule: Validate expiry date is in the future if provided
    if (input.expiryDate && input.expiryDate < new Date()) {
      throw new BusinessError(
        'Cannot create batch stock with an expiry date in the past',
        ErrorCode.INVALID_INPUT,
        { expiryDate: input.expiryDate }
      );
    }

    // Create the batch stock record
    const batchStock = await stockRepository.createBatchStock(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'stock',
      'CREATE',
      'batch_stock',
      batchStock.id,
      user,
      calculateChanges(null, {
        itemId: input.itemId,
        locationId: input.locationId,
        batchNumber: input.batchNumber,
        quantity: input.quantity,
        expiryDate: input.expiryDate,
      })
    );

    return batchStock;
  }

  /**
   * Updates expiry date for stock items
   * Creates audit trail for compliance/tracking
   */
  async updateExpiry(
    user: AuthUser,
    input: UpdateExpiryInput
  ): Promise<{ success: boolean; message: string }> {
    // Business rule: New expiry date should be in the future
    if (input.newExpiryDate < new Date()) {
      throw new BusinessError(
        'New expiry date must be in the future',
        ErrorCode.INVALID_INPUT,
        { newExpiryDate: input.newExpiryDate }
      );
    }

    const result = await stockRepository.updateExpiry(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log with before/after values
    await createAuditLog(
      'stock',
      'UPDATE',
      input.batchNumber ? 'batch_stock' : input.serialNumber ? 'serialized_stock' : 'stock',
      input.stockId,
      user,
      calculateChanges(
        { expiryDate: result.previousExpiry },
        { expiryDate: input.newExpiryDate }
      ),
      { reason: input.reason }
    );

    return {
      success: true,
      message: `Expiry date updated successfully. Previous: ${result.previousExpiry?.toISOString() ?? 'not set'}`,
    };
  }

  /**
   * Gets summary of stock levels across all items
   * Useful for dashboards and reporting
   */
  async getStockSummary(user: AuthUser): Promise<StockSummary[]> {
    return await stockRepository.getStockSummary(user.organizationId);
  }

  /**
   * Gets summary for a specific location
   */
  async getLocationSummary(
    user: AuthUser,
    locationId: string
  ): Promise<LocationStockSummary> {
    const summary = await stockRepository.getLocationSummary(
      locationId,
      user.organizationId
    );

    if (!summary) {
      throw new NotFoundError('Location', locationId);
    }

    return summary;
  }
}

// Export singleton instance
export const stockService = new StockService();

