/**
 * Usage Feature Types
 * Type definitions for inventory usage tracking
 */

import type { BaseEntity } from '../../core/types/index.ts';

// Usage record entity
export interface UsageRecord extends BaseEntity {
  itemId: string;
  locationId: string;
  quantity: number;
  usageType: UsageType;
  referenceType: UsageReferenceType | null;
  referenceId: string | null;
  usedBy: string | null;
  usedAt: Date;
  notes: string | null;
  cost: number;
  organizationId: string;
}

// Usage types
export type UsageType =
  | 'consumption'
  | 'production'
  | 'maintenance'
  | 'sample'
  | 'testing'
  | 'waste'
  | 'other';

// Reference types for usage tracking
export type UsageReferenceType =
  | 'work_order'
  | 'project'
  | 'department'
  | 'customer'
  | 'asset';

// Usage record with item details
export interface UsageWithDetails extends UsageRecord {
  item: {
    id: string;
    sku: string;
    name: string;
  };
  location: {
    id: string;
    name: string;
    code: string;
  };
}

// Input for recording usage
export interface RecordUsageInput {
  itemId: string;
  locationId: string;
  quantity: number;
  usageType: UsageType;
  referenceType?: UsageReferenceType;
  referenceId?: string;
  usedBy?: string;
  usedAt?: Date;
  notes?: string;
}

// Usage history filters
export interface UsageHistoryFilters {
  itemId?: string;
  locationId?: string;
  usageType?: UsageType;
  referenceType?: UsageReferenceType;
  referenceId?: string;
  usedBy?: string;
  startDate?: Date;
  endDate?: Date;
}

// Usage summary by type
export interface UsageTypeSummary {
  usageType: UsageType;
  count: number;
  totalQuantity: number;
  totalCost: number;
}

// Usage summary by item
export interface ItemUsageSummary {
  itemId: string;
  sku: string;
  name: string;
  totalUsed: number;
  totalCost: number;
  averageDaily: number;
}

// Usage summary by reference
export interface ReferenceUsageSummary {
  referenceType: UsageReferenceType;
  referenceId: string;
  itemCount: number;
  totalQuantity: number;
  totalCost: number;
}

// Daily usage trend
export interface DailyUsageTrend {
  date: string;
  quantity: number;
  cost: number;
  recordCount: number;
}

