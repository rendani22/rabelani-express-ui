/**
 * Stock Validation Schemas
 * Zod schemas for validating stock-related requests
 */

import { z } from 'zod';
import {
  uuidSchema,
  positiveIntSchema,
  nonNegativeIntSchema,
  positiveDecimalSchema,
  dateStringSchema,
  stockStatusSchema,
  paginationSchema,
} from '../../core/utils/validation.ts';

/**
 * Schema for GET /stock query parameters
 */
export const getStockQuerySchema = paginationSchema.extend({
  itemId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  status: stockStatusSchema.optional(),
  lowStock: z.coerce.boolean().optional(),
  expiringSoon: z.coerce.boolean().optional(),
  expiringWithinDays: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

export type GetStockQuery = z.infer<typeof getStockQuerySchema>;

/**
 * Schema for GET /stock/:itemId params
 */
export const getStockByItemParamsSchema = z.object({
  itemId: uuidSchema,
});

export type GetStockByItemParams = z.infer<typeof getStockByItemParamsSchema>;

/**
 * Schema for GET /stock/location/:locationId params
 */
export const getStockByLocationParamsSchema = z.object({
  locationId: uuidSchema,
});

export type GetStockByLocationParams = z.infer<typeof getStockByLocationParamsSchema>;

/**
 * Schema for POST /stock/serial - Create serialized stock
 * Used for items that need individual serial number tracking
 */
export const createSerializedStockSchema = z.object({
  itemId: uuidSchema,
  locationId: uuidSchema,
  serialNumbers: z.array(z.string().min(1).max(100))
    .min(1, 'At least one serial number is required')
    .max(1000, 'Maximum 1000 serial numbers per request'),
  receivedDate: z.coerce.date().optional().default(() => new Date()),
  expiryDate: z.coerce.date().nullable().optional(),
  warrantyExpiry: z.coerce.date().nullable().optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export type CreateSerializedStockInput = z.infer<typeof createSerializedStockSchema>;

/**
 * Schema for POST /stock/batch - Create batch stock
 * Used for items tracked by batch/lot number
 */
export const createBatchStockSchema = z.object({
  itemId: uuidSchema,
  locationId: uuidSchema,
  batchNumber: z.string()
    .min(1, 'Batch number is required')
    .max(50, 'Batch number must be 50 characters or less'),
  quantity: positiveIntSchema,
  manufacturingDate: z.coerce.date().nullable().optional(),
  expiryDate: z.coerce.date().nullable().optional(),
  supplierId: uuidSchema.nullable().optional(),
  costPerUnit: positiveDecimalSchema,
  metadata: z.record(z.unknown()).optional().default({}),
}).refine(
  (data) => {
    // If both dates are provided, manufacturing must be before expiry
    if (data.manufacturingDate && data.expiryDate) {
      return data.manufacturingDate < data.expiryDate;
    }
    return true;
  },
  { message: 'Manufacturing date must be before expiry date' }
);

export type CreateBatchStockInput = z.infer<typeof createBatchStockSchema>;

/**
 * Schema for PATCH /stock/expiry - Update expiry dates
 * Used to correct or update expiry information
 */
export const updateExpirySchema = z.object({
  stockId: uuidSchema,
  batchNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  newExpiryDate: z.coerce.date(),
  reason: z.string()
    .min(10, 'Please provide a detailed reason (at least 10 characters)')
    .max(500, 'Reason must be 500 characters or less'),
}).refine(
  (data) => data.batchNumber || data.serialNumber || (!data.batchNumber && !data.serialNumber),
  { message: 'Provide either batchNumber or serialNumber, or neither for bulk stock' }
);

export type UpdateExpiryInput = z.infer<typeof updateExpirySchema>;

/**
 * Schema for location query parameters
 */
export const locationStockQuerySchema = paginationSchema.extend({
  includeEmpty: z.coerce.boolean().optional().default(false),
});

export type LocationStockQuery = z.infer<typeof locationStockQuerySchema>;

