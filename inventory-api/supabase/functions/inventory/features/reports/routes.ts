/**
 * Reports Routes
 * HTTP route handlers for report endpoints
 */

import { z } from 'zod';
import type { RequestContext, RouteDefinition } from '../../core/types/request.ts';
import { validateSchema } from '../../core/utils/validation.ts';
import { createSuccessResponse } from '../../core/utils/response.ts';
import { reportsService } from './service.ts';

// Validation schemas for report queries
const valuationReportQuerySchema = z.object({
  asOfDate: z.coerce.date().optional(),
  includeZeroStock: z.coerce.boolean().optional().default(false),
  categories: z.string().transform((s) => s.split(',')).optional(),
  locations: z.string().transform((s) => s.split(',')).optional(),
});

const movementReportQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  itemIds: z.string().transform((s) => s.split(',')).optional(),
  locationIds: z.string().transform((s) => s.split(',')).optional(),
  movementTypes: z.string().transform((s) => s.split(',')).optional(),
});

const turnoverReportQuerySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  categories: z.string().transform((s) => s.split(',')).optional(),
  minTurnoverRate: z.coerce.number().optional(),
  maxTurnoverRate: z.coerce.number().optional(),
});

/**
 * GET /reports/valuation
 * Generates inventory valuation report
 */
async function getValuationReport(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const params = validateSchema(valuationReportQuerySchema, queryParams);

  const report = await reportsService.generateValuationReport(ctx.user, params);

  return createSuccessResponse(report, 200, ctx.requestId);
}

/**
 * GET /reports/movement
 * Generates movement report for a date range
 */
async function getMovementReport(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const params = validateSchema(movementReportQuerySchema, queryParams);

  const report = await reportsService.generateMovementReport(ctx.user, params);

  return createSuccessResponse(report, 200, ctx.requestId);
}

/**
 * GET /reports/turnover
 * Generates inventory turnover report
 */
async function getTurnoverReport(ctx: RequestContext): Promise<Response> {
  const queryParams = Object.fromEntries(ctx.query.entries());
  const params = validateSchema(turnoverReportQuerySchema, queryParams);

  const report = await reportsService.generateTurnoverReport(ctx.user, params);

  return createSuccessResponse(report, 200, ctx.requestId);
}

/**
 * Reports route definitions
 */
export const reportsRoutes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/reports/valuation',
    handler: getValuationReport,
    permissions: ['reports:read'],
  },
  {
    method: 'GET',
    path: '/reports/movement',
    handler: getMovementReport,
    permissions: ['reports:read'],
  },
  {
    method: 'GET',
    path: '/reports/turnover',
    handler: getTurnoverReport,
    permissions: ['reports:read'],
  },
];

