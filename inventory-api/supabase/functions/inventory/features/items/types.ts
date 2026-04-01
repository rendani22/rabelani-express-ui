/**
 * Items Feature Types
 * Type definitions for item management functionality
 */

import type { BaseEntity, UnitOfMeasure, SoftDeletable } from '../../core/types/index.ts';

// Item entity - represents a product/material in inventory
export interface Item extends BaseEntity, SoftDeletable {
  sku: string;
  name: string;
  description: string | null;
  category: string;
  subcategory: string | null;
  unitOfMeasure: UnitOfMeasure;
  unitCost: number;
  unitPrice: number | null;
  reorderPoint: number;
  reorderQuantity: number;
  leadTimeDays: number;
  isActive: boolean;
  isSerialized: boolean;
  isBatchTracked: boolean;
  barcode: string | null;
  imageUrl: string | null;
  weight: number | null;
  dimensions: ItemDimensions | null;
  organizationId: string;
  metadata: Record<string, unknown>;
}

// Item dimensions for storage/shipping calculations
export interface ItemDimensions {
  length: number;
  width: number;
  height: number;
  unit: 'cm' | 'inch';
}

// Item variant - variations of a base item (size, color, etc.)
export interface ItemVariant extends BaseEntity {
  itemId: string;
  sku: string;
  name: string;
  attributes: VariantAttribute[];
  unitCost: number;
  unitPrice: number | null;
  barcode: string | null;
  isActive: boolean;
}

// Variant attribute (e.g., size: "Large", color: "Red")
export interface VariantAttribute {
  attributeId: string;
  attributeName: string;
  value: string;
}

// Item attribute definition (e.g., "Color", "Size")
export interface ItemAttribute extends BaseEntity {
  name: string;
  code: string;
  dataType: 'string' | 'number' | 'boolean' | 'date';
  values: string[] | null;  // Predefined values for select-type attributes
  isRequired: boolean;
  organizationId: string;
}

// Input for creating a new item
export interface CreateItemInput {
  sku: string;
  name: string;
  description?: string;
  category: string;
  subcategory?: string;
  unitOfMeasure: UnitOfMeasure;
  unitCost: number;
  unitPrice?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  leadTimeDays?: number;
  isSerialized?: boolean;
  isBatchTracked?: boolean;
  barcode?: string;
  imageUrl?: string;
  weight?: number;
  dimensions?: ItemDimensions;
  metadata?: Record<string, unknown>;
}

// Input for updating an item
export interface UpdateItemInput {
  name?: string;
  description?: string;
  category?: string;
  subcategory?: string;
  unitOfMeasure?: UnitOfMeasure;
  unitCost?: number;
  unitPrice?: number;
  reorderPoint?: number;
  reorderQuantity?: number;
  leadTimeDays?: number;
  isSerialized?: boolean;
  isBatchTracked?: boolean;
  barcode?: string;
  imageUrl?: string;
  weight?: number;
  dimensions?: ItemDimensions;
  isActive?: boolean;
  metadata?: Record<string, unknown>;
}

// Input for creating item variant
export interface CreateVariantInput {
  sku: string;
  name: string;
  attributes: { attributeId: string; value: string }[];
  unitCost: number;
  unitPrice?: number;
  barcode?: string;
}

// Input for creating attribute
export interface CreateAttributeInput {
  name: string;
  code: string;
  dataType: 'string' | 'number' | 'boolean' | 'date';
  values?: string[];
  isRequired?: boolean;
}

// Item with stock summary
export interface ItemWithStock extends Item {
  totalStock: number;
  availableStock: number;
  reservedStock: number;
  locationCount: number;
}

// Item filters for queries
export interface ItemFilters {
  search?: string;
  category?: string;
  subcategory?: string;
  isActive?: boolean;
  isSerialized?: boolean;
  isBatchTracked?: boolean;
  lowStock?: boolean;
}

// Item category summary
export interface CategorySummary {
  category: string;
  itemCount: number;
  totalValue: number;
}

