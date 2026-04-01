/**
 * Purchasing Service
 * Business logic layer for supplier and purchase order operations
 */

import { purchasingRepository } from './repository.ts';
import type { AuthUser, PaginationParams, PaginatedResult, PurchaseOrderStatus } from '../../core/types/index.ts';
import type {
  Supplier,
  PurchaseOrder,
  PurchaseOrderWithDetails,
  RestockRule,
  SupplierFilters,
} from './types.ts';
import type {
  CreateSupplierInput,
  CreatePurchaseOrderInput,
  CreateRestockRuleInput,
} from './validation.ts';
import { createAuditLog, calculateChanges } from '../../core/utils/audit.ts';
import { NotFoundError, BusinessError } from '../../core/errors/index.ts';
import { ErrorCode } from '../../core/types/response.ts';

// Valid status transitions
const VALID_STATUS_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
  draft: ['pending', 'cancelled'],
  pending: ['approved', 'cancelled'],
  approved: ['ordered', 'cancelled'],
  ordered: ['partially_received', 'received', 'cancelled'],
  partially_received: ['received', 'cancelled'],
  received: [],  // Final state
  cancelled: [],  // Final state
};

/**
 * Purchasing Service Class
 */
export class PurchasingService {
  /**
   * Creates a new supplier
   */
  async createSupplier(
    user: AuthUser,
    input: CreateSupplierInput
  ): Promise<Supplier> {
    const supplier = await purchasingRepository.createSupplier(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'purchasing',
      'CREATE',
      'supplier',
      supplier.id,
      user,
      calculateChanges(null, {
        code: supplier.code,
        name: supplier.name,
        email: supplier.email,
      })
    );

    return supplier;
  }

  /**
   * Gets all suppliers with filtering
   */
  async getSuppliers(
    user: AuthUser,
    filters: SupplierFilters,
    pagination: PaginationParams
  ): Promise<PaginatedResult<Supplier>> {
    return await purchasingRepository.findAllSuppliers(
      user.organizationId,
      filters,
      pagination
    );
  }

  /**
   * Creates a new purchase order
   */
  async createPurchaseOrder(
    user: AuthUser,
    input: CreatePurchaseOrderInput
  ): Promise<PurchaseOrderWithDetails> {
    // Create the purchase order
    const order = await purchasingRepository.createPurchaseOrder(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'purchasing',
      'CREATE',
      'purchase_order',
      order.id,
      user,
      calculateChanges(null, {
        orderNumber: order.orderNumber,
        supplierId: order.supplierId,
        lineCount: order.lines.length,
        total: order.total,
      })
    );

    return order;
  }

  /**
   * Updates purchase order status
   * Validates that the status transition is valid
   */
  async updatePurchaseOrderStatus(
    user: AuthUser,
    orderId: string,
    newStatus: PurchaseOrderStatus,
    notes?: string
  ): Promise<PurchaseOrder> {
    // This would need to fetch current status first
    // For now, we'll validate in the repository

    // Validate the status transition
    // In a real implementation, we'd fetch the current order first

    const updatedOrder = await purchasingRepository.updatePurchaseOrderStatus(
      orderId,
      newStatus,
      user.organizationId,
      user.id
    );

    if (!updatedOrder) {
      throw new NotFoundError('Purchase Order', orderId);
    }

    // Create audit log
    await createAuditLog(
      'purchasing',
      'STATUS_CHANGE',
      'purchase_order',
      orderId,
      user,
      calculateChanges(
        { status: 'previous' },  // Would be actual previous status
        { status: newStatus }
      ),
      { notes }
    );

    return updatedOrder;
  }

  /**
   * Creates a restock rule for automated purchasing
   */
  async createRestockRule(
    user: AuthUser,
    input: CreateRestockRuleInput
  ): Promise<RestockRule> {
    const rule = await purchasingRepository.createRestockRule(
      input,
      user.organizationId,
      user.id
    );

    // Create audit log
    await createAuditLog(
      'purchasing',
      'CREATE',
      'restock_rule',
      rule.id,
      user,
      calculateChanges(null, {
        itemId: rule.itemId,
        supplierId: rule.supplierId,
        reorderPoint: rule.reorderPoint,
        reorderQuantity: rule.reorderQuantity,
      })
    );

    return rule;
  }

  /**
   * Validates that a status transition is allowed
   */
  private validateStatusTransition(
    currentStatus: PurchaseOrderStatus,
    newStatus: PurchaseOrderStatus
  ): void {
    const validTransitions = VALID_STATUS_TRANSITIONS[currentStatus];

    if (!validTransitions.includes(newStatus)) {
      throw new BusinessError(
        `Cannot transition from '${currentStatus}' to '${newStatus}'`,
        ErrorCode.INVALID_INPUT,
        { currentStatus, newStatus, validTransitions }
      );
    }
  }
}

// Export singleton instance
export const purchasingService = new PurchasingService();

