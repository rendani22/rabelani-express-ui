/**
 * Usage Routes
 * HTTP route handlers for usage tracking endpoints
 */

import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import {
  createSuccessResponse,
  createPaginatedResponse,
  createCreatedResponse,
} from '../../core/utils/response.ts';
import { usageService } from './service.ts';
import {
  recordUsageSchema,
  usageHistoryQuerySchema,
} from './validation.ts';

/**
 * POST /usage
 * Records usage of inventory items
 */
async function recordUsage(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(recordUsageSchema, ctx.body);
  const usageRecord = await usageService.recordUsage(ctx.user, input);

  return createCreatedResponse({
    message: 'Usage recorded successfully',
    usage: usageRecord,
  }, ctx.requestId);
}

/**
 * GET /usage/history
 * Retrieves usage history with filtering
 */
async function getUsageHistory(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const validatedQuery = validateSchema(usageHistoryQuerySchema, queryParams);

  const pagination = {
    page: validatedQuery.page,
    limit: validatedQuery.limit,
    sortBy: validatedQuery.sortBy,
    sortOrder: validatedQuery.sortOrder,
  };

  const filters = {
    itemId: validatedQuery.itemId,
    locationId: validatedQuery.locationId,
    usageType: validatedQuery.usageType,
    referenceType: validatedQuery.referenceType,
    referenceId: validatedQuery.referenceId,
    usedBy: validatedQuery.usedBy,
    startDate: validatedQuery.startDate,
    endDate: validatedQuery.endDate,
  };

  const result = await usageService.getUsageHistory(ctx.user, filters, pagination);

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * Usage route definitions
 */
export const usageRoutes: RouteDefinition[] = [
  {
    method: 'POST',
    path: '/usage',
    handler: recordUsage,
    permissions: ['usage:create'],
  },
  {
    method: 'GET',
    path: '/usage/history',
    handler: getUsageHistory,
    permissions: ['usage:read'],
  },
];

