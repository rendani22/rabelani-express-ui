/**
 * Movements Feature Types
 * Type definitions for stock movement functionality
 */

import type { BaseEntity, MovementType, StockStatus } from '../../core/types/index.ts';

// Stock movement record
export interface Movement extends BaseEntity {
  type: MovementType;
  itemId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  quantity: number;
  unitCost: number;
  totalValue: number;
  referenceType: MovementReferenceType | null;
  referenceId: string | null;
  notes: string | null;
  status: MovementStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  completedAt: Date | null;
  organizationId: string;
}

// Movement reference types
export type MovementReferenceType =
  | 'purchase_order'
  | 'sales_order'
  | 'return'
  | 'production_order'
  | 'adjustment'
  | 'count';

// Movement status
export type MovementStatus = 'pending' | 'approved' | 'completed' | 'cancelled';

// Movement with related details
export interface MovementWithDetails extends Movement {
  item: {
    id: string;
    sku: string;
    name: string;
  };
  fromLocation: {
    id: string;
    name: string;
    code: string;
  } | null;
  toLocation: {
    id: string;
    name: string;
    code: string;
  } | null;
}

// Movement line item (for multi-item movements)
export interface MovementLine {
  id: string;
  movementId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  batchNumber: string | null;
  serialNumbers: string[] | null;
  notes: string | null;
}

// Input for creating a basic movement
export interface CreateMovementInput {
  type: MovementType;
  itemId: string;
  fromLocationId?: string;
  toLocationId?: string;
  quantity: number;
  unitCost?: number;
  referenceType?: MovementReferenceType;
  referenceId?: string;
  notes?: string;
  batchNumber?: string;
  serialNumbers?: string[];
}

// Input for transfer between locations
export interface CreateTransferInput {
  items: TransferItem[];
  fromLocationId: string;
  toLocationId: string;
  notes?: string;
}

export interface TransferItem {
  itemId: string;
  quantity: number;
  batchNumber?: string;
  serialNumbers?: string[];
}

// Input for stock adjustment
export interface CreateAdjustmentInput {
  itemId: string;
  locationId: string;
  adjustmentType: 'increase' | 'decrease' | 'set';
  quantity: number;
  reason: AdjustmentReason;
  notes: string;
  batchNumber?: string;
  serialNumbers?: string[];
}

// Predefined adjustment reasons
export type AdjustmentReason =
  | 'cycle_count'
  | 'damaged'
  | 'expired'
  | 'lost'
  | 'found'
  | 'theft'
  | 'correction'
  | 'other';

// Movement history filters
export interface MovementHistoryFilters {
  itemId?: string;
  locationId?: string;
  type?: MovementType;
  status?: MovementStatus;
  startDate?: Date;
  endDate?: Date;
  referenceType?: MovementReferenceType;
  referenceId?: string;
}

// Movement summary for reporting
export interface MovementSummary {
  type: MovementType;
  count: number;
  totalQuantity: number;
  totalValue: number;
}

