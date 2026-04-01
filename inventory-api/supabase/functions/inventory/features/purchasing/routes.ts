/**
 * Purchasing Routes
 * HTTP route handlers for supplier and purchase order endpoints
 */

import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import {
  createSuccessResponse,
  createPaginatedResponse,
  createCreatedResponse,
  parsePaginationParams,
} from '../../core/utils/response.ts';
import { purchasingService } from './service.ts';
import {
  createSupplierSchema,
  getSuppliersQuerySchema,
  createPurchaseOrderSchema,
  purchaseOrderIdParamsSchema,
  updatePurchaseOrderStatusSchema,
  createRestockRuleSchema,
} from './validation.ts';

/**
 * POST /suppliers
 * Creates a new supplier
 */
async function createSupplier(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createSupplierSchema, ctx.body);
  const supplier = await purchasingService.createSupplier(ctx.user, input);

  return createCreatedResponse(supplier, ctx.requestId);
}

/**
 * GET /suppliers
 * Retrieves all suppliers with optional filtering
 */
async function getSuppliers(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const validatedQuery = validateSchema(getSuppliersQuerySchema, queryParams);

  const pagination = {
    page: validatedQuery.page,
    limit: validatedQuery.limit,
    sortBy: validatedQuery.sortBy,
    sortOrder: validatedQuery.sortOrder,
  };

  const filters = {
    search: validatedQuery.search,
    isActive: validatedQuery.isActive,
  };

  const result = await purchasingService.getSuppliers(ctx.user, filters, pagination);

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * POST /purchase-orders
 * Creates a new purchase order
 */
async function createPurchaseOrder(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createPurchaseOrderSchema, ctx.body);
  const order = await purchasingService.createPurchaseOrder(ctx.user, input);

  return createCreatedResponse({
    message: `Purchase order ${order.orderNumber} created successfully`,
    order,
  }, ctx.requestId);
}

/**
 * PATCH /purchase-orders/:id/status
 * Updates a purchase order's status
 */
async function updatePurchaseOrderStatus(ctx: RequestContext): Promise<Response> {
  const params = validateSchema(purchaseOrderIdParamsSchema, ctx.params);
  const input = validateSchema(updatePurchaseOrderStatusSchema, ctx.body);

  const order = await purchasingService.updatePurchaseOrderStatus(
    ctx.user,
    params.id,
    input.status,
    input.notes
  );

  return createSuccessResponse({
    message: `Purchase order status updated to '${input.status}'`,
    order,
  }, 200, ctx.requestId);
}

/**
 * POST /restock-rules
 * Creates a new restock rule for automated purchasing
 */
async function createRestockRule(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createRestockRuleSchema, ctx.body);
  const rule = await purchasingService.createRestockRule(ctx.user, input);

  return createCreatedResponse({
    message: 'Restock rule created successfully',
    rule,
  }, ctx.requestId);
}

/**
 * Purchasing route definitions
 */
export const purchasingRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/suppliers',
    handler: createSupplier,
    permissions: ['suppliers:create'],
  },
  {
    method: 'GET',
    path: '/suppliers',
    handler: getSuppliers,
    permissions: ['suppliers:read'],
  },
  {
    method: 'POST',
    path: '/purchase-orders',
    handler: createPurchaseOrder,
    permissions: ['purchasing:create'],
  },
  {
    method: 'PATCH',
    path: '/purchase-orders/:id/status',
    handler: updatePurchaseOrderStatus,
    permissions: ['purchasing:update'],
  },
  {
    method: 'POST',
    path: '/restock-rules',
    handler: createRestockRule,
    permissions: ['purchasing:create'],
    roles: ['manager', 'admin'],
  },
];

