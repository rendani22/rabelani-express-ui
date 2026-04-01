/**
 * Validation utilities using Zod
 * Provides reusable validation helpers and schemas
 */

import { z, ZodError, ZodSchema } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Re-export z for use in validation schemas
export { z };
import { ValidationError } from '../errors/index.ts';

/**
 * Validates data against a Zod schema
 * Throws ValidationError with detailed field-level errors if validation fails
 */
export function validateSchema<T>(schema: ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof ZodError) {
      const validationErrors = error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      throw new ValidationError('Validation failed', validationErrors);
    }
    throw error;
  }
}

/**
 * Safely validates data without throwing - returns result object
 */
export function safeValidate<T>(
  schema: ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, errors: result.error };
}

// ============================================================
// Reusable Validation Schemas
// ============================================================

/**
 * UUID validation - strict format check
 */
export const uuidSchema = z.string().uuid('Invalid UUID format');

/**
 * Positive integer validation
 */
export const positiveIntSchema = z.number().int().positive('Must be a positive integer');

/**
 * Non-negative integer validation (allows zero)
 */
export const nonNegativeIntSchema = z.number().int().nonnegative('Must be zero or positive');

/**
 * Positive decimal validation with precision
 */
export const positiveDecimalSchema = z.number().positive('Must be a positive number');

/**
 * Date string validation (ISO 8601)
 */
export const dateStringSchema = z.string().datetime('Invalid date format. Use ISO 8601');

/**
 * Optional date string that transforms to Date object
 */
export const optionalDateSchema = z
  .string()
  .datetime()
  .optional()
  .transform((val) => (val ? new Date(val) : undefined));

/**
 * SKU validation - alphanumeric with dashes, max 50 chars
 */
export const skuSchema = z
  .string()
  .min(1, 'SKU is required')
  .max(50, 'SKU must be 50 characters or less')
  .regex(/^[A-Za-z0-9-]+$/, 'SKU can only contain letters, numbers, and dashes');

/**
 * Email validation with normalization
 */
export const emailSchema = z
  .string()
  .email('Invalid email format')
  .transform((val) => val.toLowerCase().trim());

/**
 * Pagination query params schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Date range filter schema
 */
export const dateRangeSchema = z.object({
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

/**
 * Common ID parameter schema for route params
 */
export const idParamSchema = z.object({
  id: uuidSchema,
});

/**
 * Unit of measure enum schema
 */
export const unitOfMeasureSchema = z.enum([
  'piece',
  'kg',
  'g',
  'liter',
  'ml',
  'meter',
  'cm',
  'box',
  'pallet',
  'carton',
]);

/**
 * Stock status enum schema
 */
export const stockStatusSchema = z.enum([
  'available',
  'reserved',
  'in_transit',
  'damaged',
  'expired',
  'quarantine',
]);

/**
 * Movement type enum schema
 */
export const movementTypeSchema = z.enum([
  'receipt',
  'transfer',
  'adjustment',
  'sale',
  'return',
  'write_off',
  'production',
]);

/**
 * Alert severity enum schema
 */
export const alertSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);

/**
 * Purchase order status enum schema
 */
export const purchaseOrderStatusSchema = z.enum([
  'draft',
  'pending',
  'approved',
  'ordered',
  'partially_received',
  'received',
  'cancelled',
]);

