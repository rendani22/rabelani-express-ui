/**
 * Stock Routes
 * HTTP route handlers for stock tracking endpoints
 * Routes validate input and delegate to service layer
 */

import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import {
  createSuccessResponse,
  createPaginatedResponse,
  createCreatedResponse,
  parsePaginationParams,
} from '../../core/utils/response.ts';
import { stockService } from './service.ts';
import {
  getStockQuerySchema,
  getStockByItemParamsSchema,
  getStockByLocationParamsSchema,
  createSerializedStockSchema,
  createBatchStockSchema,
  updateExpirySchema,
} from './validation.ts';

/**
 * GET /stock
 * Retrieves all stock records with optional filtering
 * Query params: page, limit, itemId, locationId, status, lowStock, expiringSoon
 */
async function getStock(ctx: RequestContext): Promise<Response> {
  // Parse and validate query parameters
  const queryParams = Object.fromEntries(ctx.query.entries());
  const validatedQuery = validateSchema(getStockQuerySchema, queryParams);

  // Extract pagination params
  const pagination = {
    page: validatedQuery.page,
    limit: validatedQuery.limit,
    sortBy: validatedQuery.sortBy,
    sortOrder: validatedQuery.sortOrder,
  };

  // Extract filters
  const filters = {
    itemId: validatedQuery.itemId,
    locationId: validatedQuery.locationId,
    status: validatedQuery.status,
    lowStock: validatedQuery.lowStock,
    expiringSoon: validatedQuery.expiringSoon,
    expiringWithinDays: validatedQuery.expiringWithinDays,
  };

  // Call service layer
  const result = await stockService.getAllStock(ctx.user, filters, pagination);

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * GET /stock/:itemId
 * Retrieves stock levels for a specific item across all locations
 */
async function getStockByItem(ctx: RequestContext): Promise<Response> {
  // Validate URL parameters
  const params = validateSchema(getStockByItemParamsSchema, ctx.params);

  // Get stock for the item
  const stock = await stockService.getStockByItem(ctx.user, params.itemId);

  return createSuccessResponse(stock, 200, ctx.requestId);
}

/**
 * GET /stock/location/:locationId
 * Retrieves all stock at a specific location
 */
async function getStockByLocation(ctx: RequestContext): Promise<Response> {
  // Validate URL parameters
  const params = validateSchema(getStockByLocationParamsSchema, ctx.params);

  // Parse pagination
  const pagination = parsePaginationParams(ctx.query);

  // Get stock at location
  const result = await stockService.getStockByLocation(
    ctx.user,
    params.locationId,
    pagination
  );

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * POST /stock/serial
 * Creates serialized stock entries with individual serial numbers
 * Used for items requiring serial number tracking (electronics, equipment, etc.)
 */
async function createSerializedStock(ctx: RequestContext): Promise<Response> {
  // Validate request body
  const input = validateSchema(createSerializedStockSchema, ctx.body);

  // Create serialized stock
  const createdStock = await stockService.createSerializedStock(ctx.user, input);

  return createCreatedResponse({
    message: `Successfully created ${createdStock.length} serialized stock entries`,
    items: createdStock,
  }, ctx.requestId);
}

/**
 * POST /stock/batch
 * Creates batch/lot tracked stock entry
 * Used for items tracked by batch number (food, pharmaceuticals, etc.)
 */
async function createBatchStock(ctx: RequestContext): Promise<Response> {
  // Validate request body
  const input = validateSchema(createBatchStockSchema, ctx.body);

  // Create batch stock
  const batchStock = await stockService.createBatchStock(ctx.user, input);

  return createCreatedResponse({
    message: 'Batch stock created successfully',
    batch: batchStock,
  }, ctx.requestId);
}

/**
 * PATCH /stock/expiry
 * Updates expiry date for stock items (batch or serialized)
 * Requires reason for audit trail
 */
async function updateStockExpiry(ctx: RequestContext): Promise<Response> {
  // Validate request body
  const input = validateSchema(updateExpirySchema, ctx.body);

  // Update expiry
  const result = await stockService.updateExpiry(ctx.user, input);

  return createSuccessResponse(result, 200, ctx.requestId);
}

/**
 * Stock route definitions
 * Exported for registration with the main router
 */
export const stockRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/stock',
    handler: getStock,
    permissions: ['stock:read'],
  },
  {
    method: 'GET',
    path: '/stock/:itemId',
    handler: getStockByItem,
    permissions: ['stock:read'],
  },
  {
    method: 'GET',
    path: '/stock/location/:locationId',
    handler: getStockByLocation,
    permissions: ['stock:read'],
  },
  {
    method: 'POST',
    path: '/stock/serial',
    handler: createSerializedStock,
    permissions: ['stock:create'],
  },
  {
    method: 'POST',
    path: '/stock/batch',
    handler: createBatchStock,
    permissions: ['stock:create'],
  },
  {
    method: 'PATCH',
    path: '/stock/expiry',
    handler: updateStockExpiry,
    permissions: ['stock:update'],
  },
];

