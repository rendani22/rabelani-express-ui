/**
 * Movements Service
 * Business logic layer for stock movement operations
 */

import { movementsRepository } from './repository.ts';
import { stockRepository } from '../stock/repository.ts';
import type { AuthUser, PaginationParams, PaginatedResult } from '../../core/types/index.ts';
import type {
  Movement,
  MovementWithDetails,
  MovementHistoryFilters,
} from './types.ts';
import type {
  CreateMovementInput,
  CreateTransferInput,
  CreateAdjustmentInput,
} from './validation.ts';
import { createAuditLog, calculateChanges } from '../../core/utils/audit.ts';
import { NotFoundError, BusinessError, InsufficientStockError } from '../../core/errors/index.ts';
import { ErrorCode } from '../../core/types/response.ts';
import { db } from '../../database/client.ts';

/**
 * Movements Service Class
 */
export class MovementsService {
  /**
   * Creates a new stock movement
   * Validates stock availability for outbound movements
   */
  async createMovement(
    user: AuthUser,
    input: CreateMovementInput
  ): Promise<Movement> {
    // For outbound movements, verify stock availability
    if (input.fromLocationId) {
      await this.validateStockAvailability(
        input.itemId,
        input.fromLocationId,
        input.quantity,
        user.organizationId
      );
    }

    // Create the movement record
    const movement = await movementsRepository.create(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'movements',
      'CREATE',
      'movement',
      movement.id,
      user,
      calculateChanges(null, {
        type: movement.type,
        itemId: movement.itemId,
        quantity: movement.quantity,
        fromLocationId: movement.fromLocationId,
        toLocationId: movement.toLocationId,
      })
    );

    return movement;
  }

  /**
   * Creates a transfer between locations
   * Handles multiple items in a single transfer
   */
  async createTransfer(
    user: AuthUser,
    input: CreateTransferInput
  ): Promise<{ transferId: string; movements: Movement[] }> {
    // Validate stock availability for all items
    for (const item of input.items) {
      await this.validateStockAvailability(
        item.itemId,
        input.fromLocationId,
        item.quantity,
        user.organizationId
      );
    }

    // Create the transfer movements
    const movements = await movementsRepository.createTransfer(
      input,
      user.organizationId,
      user.id
    );

    // Generate a transfer ID to group the movements
    const transferId = crypto.randomUUID();

    // Create audit log for the transfer
    await createAuditLog(
      'movements',
      'TRANSFER',
      'transfer',
      transferId,
      user,
      calculateChanges(null, {
        fromLocationId: input.fromLocationId,
        toLocationId: input.toLocationId,
        itemCount: input.items.length,
        totalQuantity: input.items.reduce((sum, i) => sum + i.quantity, 0),
      }),
      { movementIds: movements.map((m) => m.id) }
    );

    return { transferId, movements };
  }

  /**
   * Creates a stock adjustment
   * Used for inventory corrections, cycle counts, etc.
   */
  async createAdjustment(
    user: AuthUser,
    input: CreateAdjustmentInput
  ): Promise<Movement> {
    // Get current stock level
    const currentStock = await this.getStockQuantity(
      input.itemId,
      input.locationId,
      user.organizationId
    );

    // Validate the adjustment
    if (input.adjustmentType === 'decrease' && currentStock < input.quantity) {
      throw new InsufficientStockError(input.itemId, input.quantity, currentStock);
    }

    if (input.adjustmentType === 'set' && input.quantity < 0) {
      throw new BusinessError(
        'Cannot set stock to a negative value',
        ErrorCode.INVALID_INPUT
      );
    }

    // Create the adjustment
    const movement = await movementsRepository.createAdjustment(
      input,
      currentStock,
      user.organizationId,
      user.id
    );

    // Apply the adjustment to stock
    await this.applyStockChange(
      input.itemId,
      input.locationId,
      input.adjustmentType === 'set'
        ? input.quantity - currentStock
        : (input.adjustmentType === 'increase' ? input.quantity : -input.quantity),
      user.id
    );

    // Create audit log
    await createAuditLog(
      'movements',
      'ADJUSTMENT',
      'stock',
      movement.id,
      user,
      calculateChanges(
        { quantity: currentStock },
        { quantity: input.adjustmentType === 'set' ? input.quantity : currentStock + (input.adjustmentType === 'increase' ? input.quantity : -input.quantity) }
      ),
      { reason: input.reason, notes: input.notes }
    );

    return movement;
  }

  /**
   * Gets movement history with filtering
   */
  async getMovementHistory(
    user: AuthUser,
    filters: MovementHistoryFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<MovementWithDetails>> {
    return await movementsRepository.findHistory(
      user.organizationId,
      filters,
      pagination
    );
  }

  /**
   * Validates that sufficient stock is available
   */
  private async validateStockAvailability(
    itemId: string,
    locationId: string,
    requiredQuantity: number,
    organizationId: string
  ): Promise<void> {
    const availableQuantity = await this.getStockQuantity(
      itemId,
      locationId,
      organizationId
    );

    if (availableQuantity < requiredQuantity) {
      throw new InsufficientStockError(itemId, requiredQuantity, availableQuantity);
    }
  }

  /**
   * Gets current stock quantity for an item at a location
   */
  private async getStockQuantity(
    itemId: string,
    locationId: string,
    organizationId: string
  ): Promise<number> {
    const result = await db.query<{ available_quantity: number }>(
      `SELECT available_quantity FROM stock
       WHERE item_id = $1 AND location_id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
      [itemId, locationId, organizationId]
    );

    return result.rows[0]?.available_quantity ?? 0;
  }

  /**
   * Applies stock quantity change
   */
  private async applyStockChange(
    itemId: string,
    locationId: string,
    quantityChange: number,
    userId: string
  ): Promise<void> {
    await db.query(
      `UPDATE stock SET
        quantity = quantity + $1,
        available_quantity = available_quantity + $1,
        updated_at = NOW(),
        updated_by = $2
       WHERE item_id = $3 AND location_id = $4`,
      [quantityChange, userId, itemId, locationId]
    );
  }
}

// Export singleton instance
export const movementsService = new MovementsService();

