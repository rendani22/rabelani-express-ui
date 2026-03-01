/**
 * Movements Routes
 * HTTP route handlers for stock movement endpoints
 */

import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import {
  createSuccessResponse,
  createPaginatedResponse,
  createCreatedResponse,
  parsePaginationParams,
} from '../../core/utils/response.ts';
import { movementsService } from './service.ts';
import {
  createMovementSchema,
  createTransferSchema,
  createAdjustmentSchema,
  movementHistoryQuerySchema,
} from './validation.ts';

/**
 * POST /movements
 * Creates a new stock movement
 */
async function createMovement(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createMovementSchema, ctx.body);
  const movement = await movementsService.createMovement(ctx.user, input);

  return createCreatedResponse(movement, ctx.requestId);
}

/**
 * POST /movements/transfer
 * Creates a transfer between locations (can include multiple items)
 */
async function createTransfer(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createTransferSchema, ctx.body);
  const result = await movementsService.createTransfer(ctx.user, input);

  return createCreatedResponse({
    message: `Transfer created successfully with ${result.movements.length} item(s)`,
    transferId: result.transferId,
    movements: result.movements,
  }, ctx.requestId);
}

/**
 * POST /movements/adjustment
 * Creates a stock adjustment (for corrections, cycle counts, etc.)
 */
async function createAdjustment(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createAdjustmentSchema, ctx.body);
  const movement = await movementsService.createAdjustment(ctx.user, input);

  return createCreatedResponse({
    message: 'Stock adjustment recorded successfully',
    movement,
  }, ctx.requestId);
}

/**
 * GET /movements/history
 * Retrieves movement history with filtering
 */
async function getMovementHistory(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const validatedQuery = validateSchema(movementHistoryQuerySchema, queryParams);

  const pagination = {
    page: validatedQuery.page,
    limit: validatedQuery.limit,
    sortBy: validatedQuery.sortBy,
    sortOrder: validatedQuery.sortOrder,
  };

  const filters = {
    itemId: validatedQuery.itemId,
    locationId: validatedQuery.locationId,
    type: validatedQuery.type,
    status: validatedQuery.status,
    startDate: validatedQuery.startDate,
    endDate: validatedQuery.endDate,
    referenceType: validatedQuery.referenceType,
    referenceId: validatedQuery.referenceId,
  };

  const result = await movementsService.getMovementHistory(
    ctx.user,
    filters,
    pagination
  );

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * Movements route definitions
 */
export const movementsRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/movements',
    handler: createMovement,
    permissions: ['movements:create'],
  },
  {
    method: 'POST',
    path: '/movements/transfer',
    handler: createTransfer,
    permissions: ['movements:create'],
  },
  {
    method: 'POST',
    path: '/movements/adjustment',
    handler: createAdjustment,
    permissions: ['movements:create'],
    roles: ['manager', 'admin'],  // Adjustments require manager or higher
  },
  {
    method: 'GET',
    path: '/movements/history',
    handler: getMovementHistory,
    permissions: ['movements:read'],
  },
];

