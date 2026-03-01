/**
 * Usage Validation Schemas
 */

import { z } from 'zod';
import {
  uuidSchema,
  positiveIntSchema,
  paginationSchema,
} from '../../core/utils/validation.ts';

// Usage type enum
const usageTypeSchema = z.enum([
  'consumption',
  'production',
  'maintenance',
  'sample',
  'testing',
  'waste',
  'other',
]);

// Reference type enum
const usageReferenceTypeSchema = z.enum([
  'work_order',
  'project',
  'department',
  'customer',
  'asset',
]);

/**
 * Schema for recording usage
 */
export const recordUsageSchema = z.object({
  itemId: uuidSchema,
  locationId: uuidSchema,
  quantity: positiveIntSchema,
  usageType: usageTypeSchema,
  referenceType: usageReferenceTypeSchema.optional(),
  referenceId: z.string().max(100).optional(),
  usedBy: z.string().max(100).optional(),
  usedAt: z.coerce.date().optional().default(() => new Date()),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => {
    // If referenceType is provided, referenceId should also be provided
    if (data.referenceType && !data.referenceId) {
      return false;
    }
    return true;
  },
  { message: 'referenceId is required when referenceType is provided' }
);

export type RecordUsageInput = z.infer<typeof recordUsageSchema>;

/**
 * Schema for usage history query
 */
export const usageHistoryQuerySchema = paginationSchema.extend({
  itemId: uuidSchema.optional(),
  locationId: uuidSchema.optional(),
  usageType: usageTypeSchema.optional(),
  referenceType: usageReferenceTypeSchema.optional(),
  referenceId: z.string().optional(),
  usedBy: z.string().optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return data.startDate <= data.endDate;
    }
    return true;
  },
  { message: 'Start date must be before or equal to end date' }
);

export type UsageHistoryQuery = z.infer<typeof usageHistoryQuerySchema>;

