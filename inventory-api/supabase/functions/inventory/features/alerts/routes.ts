/**
 * Alerts Routes
 * HTTP route handlers for alert endpoints
 */

import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import {
  createSuccessResponse,
  createPaginatedResponse,
  createCreatedResponse,
} from '../../core/utils/response.ts';
import { alertsService } from './service.ts';
import {
  getAlertsQuerySchema,
  createThresholdSchema,
  alertIdParamsSchema,
  updateAlertSchema,
} from './validation.ts';

/**
 * GET /alerts
 * Retrieves all alerts with optional filtering
 */
async function getAlerts(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const validatedQuery = validateSchema(getAlertsQuerySchema, queryParams);

  const pagination = {
    page: validatedQuery.page,
    limit: validatedQuery.limit,
    sortBy: validatedQuery.sortBy,
    sortOrder: validatedQuery.sortOrder,
  };

  const filters = {
    type: validatedQuery.type,
    severity: validatedQuery.severity,
    status: validatedQuery.status,
    itemId: validatedQuery.itemId,
    locationId: validatedQuery.locationId,
    startDate: validatedQuery.startDate,
    endDate: validatedQuery.endDate,
  };

  const result = await alertsService.getAlerts(ctx.user, filters, pagination);

  return createPaginatedResponse(result, ctx.requestId);
}

/**
 * POST /alerts/threshold
 * Creates a new threshold rule for automated alerts
 */
async function createThreshold(ctx: RequestContext): Promise<Response> {
  const input = validateSchema(createThresholdSchema, ctx.body);
  const rule = await alertsService.createThreshold(ctx.user, input);

  return createCreatedResponse({
    message: 'Threshold rule created successfully',
    rule,
  }, ctx.requestId);
}

/**
 * PATCH /alerts/:id
 * Updates an alert's status (acknowledge, resolve, dismiss)
 */
async function updateAlert(ctx: RequestContext): Promise<Response> {
  const params = validateSchema(alertIdParamsSchema, ctx.params);
  const input = validateSchema(updateAlertSchema, ctx.body);

  const alert = await alertsService.updateAlert(ctx.user, params.id, input);

  return createSuccessResponse({
    message: `Alert ${input.status}`,
    alert,
  }, 200, ctx.requestId);
}

/**
 * Alerts route definitions
 */
export const alertsRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/alerts',
    handler: getAlerts,
    permissions: ['alerts:read'],
  },
  {
    method: 'POST',
    path: '/alerts/threshold',
    handler: createThreshold,
    permissions: ['alerts:create'],
  },
  {
    method: 'PATCH',
    path: '/alerts/:id',
    handler: updateAlert,
    permissions: ['alerts:update'],
  },
];

