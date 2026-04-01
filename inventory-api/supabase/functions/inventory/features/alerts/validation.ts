/**
 * Alerts Validation Schemas
 */

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import {
  uuidSchema,
  positiveIntSchema,
  alertSeveritySchema,
  paginationSchema,
} from '../../core/utils/validation.ts';

// Alert type enum
const alertTypeSchema = z.enum([
  'low_stock',
  'out_of_stock',
  'expiring_soon',
  'expired',
  'overstock',
  'reorder_point',
  'threshold_breach',
]);

// Alert status enum
const alertStatusSchema = z.enum(['active', 'acknowledged', 'resolved', 'dismissed']);

// Threshold type enum
const thresholdTypeSchema = z.enum([
  'min_quantity',
  'max_quantity',
  'expiry_days',
  'reorder_point',
]);

/**
 * Schema for alert query parameters
 */
export const getAlertsQuerySchema = paginationSchema.extend({
  type: alertTypeSchema.optional(),
  severity: alertSeveritySchema.optional(),
  status: alertStatusSchema.optional(),
  itemId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
});

export type GetAlertsQuery = z.infer<typeof getAlertsQuerySchema>;

/**
 * Schema for creating a threshold rule
 */
export const createThresholdSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  itemId: uuidSchema.optional(),
  category: z.string().max(100).optional(),
  locationId: uuidSchema.optional(),
  thresholdType: thresholdTypeSchema,
  thresholdValue: positiveIntSchema,
  severity: alertSeveritySchema,
});

export type CreateThresholdInput = z.infer<typeof createThresholdSchema>;

/**
 * Schema for alert ID parameter
 */
export const alertIdParamsSchema = z.object({
  id: uuidSchema,
});

/**
 * Schema for updating alert status
 */
export const updateAlertSchema = z.object({
  status: alertStatusSchema,
  notes: z.string().max(500).optional(),
});

export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;

