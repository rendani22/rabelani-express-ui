/**
 * Movements Validation Schemas
 * Zod schemas for validating movement-related requests
 */

import { z } from 'zod';
import {
  uuidSchema,
  positiveIntSchema,
  positiveDecimalSchema,
  movementTypeSchema,
  paginationSchema,
  dateRangeSchema,
} from '../../core/utils/validation.ts';

// Movement reference type enum
const movementReferenceTypeSchema = z.enum([
  'purchase_order',
  'sales_order',
  'return',
  'production_order',
  'adjustment',
  'count',
]);

// Movement status enum
const movementStatusSchema = z.enum(['pending', 'approved', 'completed', 'cancelled']);

// Adjustment reason enum
const adjustmentReasonSchema = z.enum([
  'cycle_count',
  'damaged',
  'expired',
  'lost',
  'found',
  'theft',
  'correction',
  'other',
]);

/**
 * Schema for creating a basic movement
 */
export const createMovementSchema = z.object({
  type: movementTypeSchema,
  itemId: uuidSchema,
  fromLocationId: uuidSchema.optional(),
  toLocationId: uuidSchema.optional(),
  quantity: positiveIntSchema,
  unitCost: positiveDecimalSchema.optional(),
  referenceType: movementReferenceTypeSchema.optional(),
  referenceId: uuidSchema.optional(),
  notes: z.string().max(1000).optional(),
  batchNumber: z.string().max(50).optional(),
  serialNumbers: z.array(z.string().max(100)).optional(),
}).refine(
  (data) => {
    // Validate location requirements based on movement type
    switch (data.type) {
      case 'receipt':
        return !!data.toLocationId;
      case 'sale':
      case 'write_off':
        return !!data.fromLocationId;
      case 'transfer':
        return !!data.fromLocationId && !!data.toLocationId;
      default:
        return true;
    }
  },
  { message: 'Invalid location configuration for movement type' }
);

export type CreateMovementInput = z.infer<typeof createMovementSchema>;

/**
 * Schema for transfer item
 */
const transferItemSchema = z.object({
  itemId: uuidSchema,
  quantity: positiveIntSchema,
  batchNumber: z.string().max(50).optional(),
  serialNumbers: z.array(z.string().max(100)).optional(),
});

/**
 * Schema for creating a transfer between locations
 */
export const createTransferSchema = z.object({
  items: z.array(transferItemSchema).min(1, 'At least one item is required'),
  fromLocationId: uuidSchema,
  toLocationId: uuidSchema,
  notes: z.string().max(1000).optional(),
}).refine(
  (data) => data.fromLocationId !== data.toLocationId,
  { message: 'Source and destination locations must be different' }
);

export type CreateTransferInput = z.infer<typeof createTransferSchema>;

/**
 * Schema for creating a stock adjustment
 */
export const createAdjustmentSchema = z.object({
  itemId: uuidSchema,
  locationId: uuidSchema,
  adjustmentType: z.enum(['increase', 'decrease', 'set']),
  quantity: z.number().int().nonnegative(),
  reason: adjustmentReasonSchema,
  notes: z.string()
    .min(10, 'Please provide a detailed reason (at least 10 characters)')
    .max(1000),
  batchNumber: z.string().max(50).optional(),
  serialNumbers: z.array(z.string().max(100)).optional(),
});

export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;

/**
 * Schema for movement history query
 */
export const movementHistoryQuerySchema = paginationSchema.extend({
  itemId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  type: movementTypeSchema.optional(),
  status: movementStatusSchema.optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  referenceType: movementReferenceTypeSchema.optional(),
  referenceId: uuidSchema.optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'Start date must be before or equal to end date' }
);

export type MovementHistoryQuery = z.infer<typeof movementHistoryQuerySchema>;

