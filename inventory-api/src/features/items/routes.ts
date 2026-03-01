/**
 * Items Routes
 * HTTP route handlers for item management endpoints
 */

import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import {
  createSuccessResponse,
  createPaginatedResponse,
  createCreatedResponse,
  createNoContentResponse,
  parsePaginationParams,
} from '../../core/utils/response.ts';
import { itemsService } from './service.ts';
import {
  createItemSchema,
  updateItemSchema,
  getItemsQuerySchema,
  itemIdParamsSchema,
  createVariantSchema,
  createAttributeSchema,
} from './validation.ts';

/**
 * POST /items
 * Creates a new item in the catalog
 */
async function createItem(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createItemSchema, ctx.body);
  const item = await itemsService.createItem(ctx.user, input);

  return createCreatedResponse(item, ctx.requestId);
}

/**
 * GET /items
 * Retrieves all items with optional filtering
 */
async function getItems(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const validatedQuery = validateSchema(getItemsQuerySchema, queryParams);

  const pagination = {
    page: validatedQuery.page,
    limit: validatedQuery.limit,
    sortBy: validatedQuery.sortBy,
    sortOrder: validatedQuery.sortOrder,
  };

  const filters = {
    search: validatedQuery.search,
    category: validatedQuery.category,
    subcategory: validatedQuery.subcategory,
    isActive: validatedQuery.isActive,
    isSerialized: validatedQuery.isSerialized,
    isBatchTracked: validatedQuery.isBatchTracked,
    lowStock: validatedQuery.lowStock,
  };

  const result = await itemsService.getItems(ctx.user, filters, pagination);

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * GET /items/:id
 * Retrieves a single item by ID
 */
async function getItemById(ctx: RequestContext): Promise<Response> {
  const params = validateSchema(itemIdParamsSchema, ctx.params);
  const item = await itemsService.getItemById(ctx.user, params.id);

  return createSuccessResponse(item, 200, ctx.requestId);
}

/**
 * PATCH /items/:id
 * Updates an existing item
 */
async function updateItem(ctx: RequestContext): Promise<Response> {
  const params = validateSchema(itemIdParamsSchema, ctx.params);
  const input = validateSchema(updateItemSchema, ctx.body);

  const item = await itemsService.updateItem(ctx.user, params.id, input);

  return createSuccessResponse(item, 200, ctx.requestId);
}

/**
 * POST /items/:id/variants
 * Creates a variant for an existing item
 */
async function createItemVariant(ctx: RequestContext): Promise<Response> {
  const params = validateSchema(itemIdParamsSchema, ctx.params);
  const input = validateSchema(createVariantSchema, ctx.body);

  const variant = await itemsService.createVariant(ctx.user, params.id, input);

  return createCreatedResponse(variant, ctx.requestId);
}

/**
 * POST /attributes
 * Creates a new attribute definition
 */
async function createAttribute(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createAttributeSchema, ctx.body);
  const attribute = await itemsService.createAttribute(ctx.user, input);

  return createCreatedResponse(attribute, ctx.requestId);
}

/**
 * Items route definitions
 */
export const itemsRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/items',
    handler: createItem,
    permissions: ['items:create'],
  },
  {
    method: 'GET',
    path: '/items',
    handler: getItems,
    permissions: ['items:read'],
  },
  {
    method: 'GET',
    path: '/items/:id',
    handler: getItemById,
    permissions: ['items:read'],
  },
  {
    method: 'PATCH',
    path: '/items/:id',
    handler: updateItem,
    permissions: ['items:update'],
  },
  {
    method: 'POST',
    path: '/items/:id/variants',
    handler: createItemVariant,
    permissions: ['items:create'],
  },
  {
    method: 'POST',
    path: '/attributes',
    handler: createAttribute,
    permissions: ['items:create'],
  },
];

