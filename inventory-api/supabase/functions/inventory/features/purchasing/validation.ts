/**
 * Purchasing Validation Schemas
 */

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import {
  uuidSchema,
  positiveIntSchema,
  positiveDecimalSchema,
  nonNegativeIntSchema,
  emailSchema,
  purchaseOrderStatusSchema,
  paginationSchema,
} from '../../core/utils/validation.ts';

// Address schema
const addressSchema = z.object({
  street: z.string().min(1).max(200),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
  country: z.string().min(2).max(100),
});

/**
 * Schema for creating a supplier
 */
export const createSupplierSchema = z.object({
  code: z.string()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9-]+$/, 'Code must contain only uppercase letters, numbers, and dashes'),
  name: z.string().min(1).max(200),
  contactName: z.string().max(100).optional(),
  email: emailSchema.optional(),
  phone: z.string().max(30).optional(),
  address: addressSchema.optional(),
  paymentTerms: z.string().max(100).optional(),
  leadTimeDays: nonNegativeIntSchema.default(7),
  minimumOrderValue: positiveDecimalSchema.optional(),
  notes: z.string().max(1000).optional(),
});

export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;

/**
 * Schema for supplier query parameters
 */
export const getSuppliersQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  isActive: z.coerce.boolean().optional(),
});

export type GetSuppliersQuery = z.infer<typeof getSuppliersQuerySchema>;

/**
 * Schema for purchase order line
 */
const purchaseOrderLineSchema = z.object({
  itemId: uuidSchema,
  quantity: positiveIntSchema,
  unitCost: positiveDecimalSchema,
  locationId: uuidSchema.optional(),
  notes: z.string().max(500).optional(),
});

/**
 * Schema for creating a purchase order
 */
export const createPurchaseOrderSchema = z.object({
  supplierId: uuidSchema,
  expectedDeliveryDate: z.coerce.date().optional(),
  lines: z.array(purchaseOrderLineSchema)
    .min(1, 'At least one line item is required'),
  notes: z.string().max(1000).optional(),
});

export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

/**
 * Schema for purchase order ID parameter
 */
export const purchaseOrderIdParamsSchema = z.object({
  id: uuidSchema,
});

/**
 * Schema for updating purchase order status
 */
export const updatePurchaseOrderStatusSchema = z.object({
  status: purchaseOrderStatusSchema,
  notes: z.string().max(500).optional(),
});

export type UpdatePurchaseOrderStatusInput = z.infer<typeof updatePurchaseOrderStatusSchema>;

/**
 * Schema for creating restock rule
 */
export const createRestockRuleSchema = z.object({
  itemId: uuidSchema,
  supplierId: uuidSchema,
  reorderPoint: positiveIntSchema,
  reorderQuantity: positiveIntSchema,
  minimumOrderQuantity: positiveIntSchema.default(1),
  leadTimeDays: nonNegativeIntSchema.optional(),
});

export type CreateRestockRuleInput = z.infer<typeof createRestockRuleSchema>;

