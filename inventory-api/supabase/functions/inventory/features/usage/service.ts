/**
 * Usage Service
 * Business logic layer for usage tracking operations
 */

import { usageRepository } from './repository.ts';
import type { AuthUser, PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  UsageRecord,
  UsageWithDetails,
  UsageHistoryFilters,
  UsageTypeSummary,
  ItemUsageSummary,
} from './types.ts';
import type { RecordUsageInput } from './validation.ts';
import { createAuditLog, calculateChanges } from '../../core/utils/audit.ts';
import { InsufficientStockError } from '../../core/errors/index.ts';
import { db } from '../../database/client.ts';

/**
 * Usage Service Class
 */
export class UsageService {
  /**
   * Records usage of inventory items
   * This decrements stock and creates a usage record
   */
  async recordUsage(
    user: AuthUser,
    input: RecordUsageInput
  ): Promise<UsageRecord> {
    // Get item cost for the usage record
    const itemCost = await this.getItemCost(input.itemId);
    const totalCost = itemCost * input.quantity;

    // Validate stock availability
    await this.validateStockAvailability(
      input.itemId,
      input.locationId,
      input.quantity,
      user.organizationId
    );

    // Create usage record and decrement stock
    await db.withTransaction(async (tx) => {
      // Decrement stock
      await tx.query(
        `UPDATE stock SET
          quantity = quantity - $1,
          available_quantity = available_quantity - $1,
          updated_at = NOW(),
          updated_by = $2
        WHERE item_id = $3 AND location_id = $4`,
        [input.quantity, user.id, input.itemId, input.locationId]
      );
    });

    // Create usage record
    const usageRecord = await usageRepository.create(
      input,
      totalCost,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'usage',
      'CREATE',
      'usage_record',
      usageRecord.id,
      user,
      calculateChanges(null, {
        itemId: input.itemId,
        locationId: input.locationId,
        quantity: input.quantity,
        usageType: input.usageType,
        cost: totalCost,
      }),
      { referenceType: input.referenceType, referenceId: input.referenceId }
    );

    return usageRecord;
  }

  /**
   * Gets usage history with filtering
   */
  async getUsageHistory(
    user: AuthUser,
    filters: UsageHistoryFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<UsageWithDetails>> {
    return await usageRepository.findHistory(
      user.organizationId,
      filters,
      pagination
    );
  }

  /**
   * Gets usage summary by type
   */
  async getUsageSummaryByType(
    user: AuthUser,
    startDate?: Date,
    endDate?: Date
  ): Promise<UsageTypeSummary[]> {
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    return await usageRepository.getSummaryByType(
      user.organizationId,
      start,
      end
    );
  }

  /**
   * Gets top items by usage
   */
  async getTopItemsByUsage(
    user: AuthUser,
    startDate?: Date,
    endDate?: Date,
    limit: number = 20
  ): Promise<ItemUsageSummary[]> {
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

    return await usageRepository.getSummaryByItem(
      user.organizationId,
      start,
      end,
      limit
    );
  }

  /**
   * Gets item unit cost
   */
  private async getItemCost(itemId: string): Promise<number> {
    const result = await db.query<{ unit_cost: number }>(
      `SELECT unit_cost FROM items WHERE id = $1`,
      [itemId]
    );
    return result.rows[0]?.unit_cost ?? 0;
  }

  /**
   * Validates stock availability
   */
  private async validateStockAvailability(
    itemId: string,
    locationId: string,
    requiredQuantity: number,
    organizationId: string
  ): Promise<void> {
    const result = await db.query<{ available_quantity: number }>(
      `SELECT available_quantity FROM stock
       WHERE item_id = $1 AND location_id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
      [itemId, locationId, organizationId]
    );

    const available = result.rows[0]?.available_quantity ?? 0;

    if (available < requiredQuantity) {
      throw new InsufficientStockError(itemId, requiredQuantity, available);
    }
  }
}

// Export singleton instance
export const usageService = new UsageService();

