/**
 * Items Validation Schemas
 * Zod schemas for validating item-related requests
 */

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import {
  uuidSchema,
  positiveDecimalSchema,
  nonNegativeIntSchema,
  skuSchema,
  unitOfMeasureSchema,
  paginationSchema,
} from '../../core/utils/validation.ts';

// Dimensions schema for items with physical dimensions
const dimensionsSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  unit: z.enum(['cm', 'inch']),
});

/**
 * Schema for creating a new item
 */
export const createItemSchema = z.object({
  sku: skuSchema,
  name: z.string()
    .min(1, 'Name is required')
    .max(200, 'Name must be 200 characters or less'),
  description: z.string().max(2000).optional(),
  category: z.string()
    .min(1, 'Category is required')
    .max(100),
  subcategory: z.string().max(100).optional(),
  unitOfMeasure: unitOfMeasureSchema,
  unitCost: positiveDecimalSchema,
  unitPrice: positiveDecimalSchema.optional(),
  reorderPoint: nonNegativeIntSchema.default(0),
  reorderQuantity: nonNegativeIntSchema.default(0),
  leadTimeDays: nonNegativeIntSchema.default(0),
  isSerialized: z.boolean().default(false),
  isBatchTracked: z.boolean().default(false),
  barcode: z.string().max(100).optional(),
  imageUrl: z.string().url().optional(),
  weight: z.number().positive().optional(),
  dimensions: dimensionsSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type CreateItemInput = z.infer<typeof createItemSchema>;

/**
 * Schema for updating an item
 * All fields are optional except validation rules still apply
 */
export const updateItemSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().min(1).max(100).optional(),
  subcategory: z.string().max(100).nullable().optional(),
  unitOfMeasure: unitOfMeasureSchema.optional(),
  unitCost: positiveDecimalSchema.optional(),
  unitPrice: positiveDecimalSchema.nullable().optional(),
  reorderPoint: nonNegativeIntSchema.optional(),
  reorderQuantity: nonNegativeIntSchema.optional(),
  leadTimeDays: nonNegativeIntSchema.optional(),
  isSerialized: z.boolean().optional(),
  isBatchTracked: z.boolean().optional(),
  barcode: z.string().max(100).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  weight: z.number().positive().nullable().optional(),
  dimensions: dimensionsSchema.nullable().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export type UpdateItemInput = z.infer<typeof updateItemSchema>;

/**
 * Schema for item query parameters
 */
export const getItemsQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  category: z.string().optional(),
  subcategory: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
  isSerialized: z.coerce.boolean().optional(),
  isBatchTracked: z.coerce.boolean().optional(),
  lowStock: z.coerce.boolean().optional(),
});

export type GetItemsQuery = z.infer<typeof getItemsQuerySchema>;

/**
 * Schema for item ID parameter
 */
export const itemIdParamsSchema = z.object({
  id: uuidSchema,
});

/**
 * Schema for creating item variant
 */
export const createVariantSchema = z.object({
  sku: skuSchema,
  name: z.string().min(1).max(200),
  attributes: z.array(z.object({
    attributeId: uuidSchema,
    value: z.string().min(1).max(200),
  })).min(1, 'At least one attribute is required'),
  unitCost: positiveDecimalSchema,
  unitPrice: positiveDecimalSchema.optional(),
  barcode: z.string().max(100).optional(),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;

/**
 * Schema for creating attribute
 */
export const createAttributeSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string()
    .min(1)
    .max(50)
    .regex(/^[a-z][a-z0-9_]*$/, 'Code must start with a letter and contain only lowercase letters, numbers, and underscores'),
  dataType: z.enum(['string', 'number', 'boolean', 'date']),
  values: z.array(z.string()).optional(),
  isRequired: z.boolean().default(false),
});

export type CreateAttributeInput = z.infer<typeof createAttributeSchema>;

