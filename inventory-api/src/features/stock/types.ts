/**
 * Stock Feature Types
 * Type definitions for stock tracking functionality
 */

import type { BaseEntity, StockStatus, UnitOfMeasure } from '../../core/types/index.ts';

// Stock record representing inventory at a specific location
export interface Stock extends BaseEntity {
  itemId: string;
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;  // Computed: quantity - reservedQuantity
  unitOfMeasure: UnitOfMeasure;
  status: StockStatus;
  lastCountDate: Date | null;
  organizationId: string;
}

// Stock with item details included
export interface StockWithItem extends Stock {
  item: {
    id: string;
    sku: string;
    name: string;
    category: string;
  };
  location: {
    id: string;
    name: string;
    code: string;
  };
}

// Serial number tracked stock item
export interface SerializedStock {
  id: string;
  stockId: string;
  itemId: string;
  serialNumber: string;
  status: StockStatus;
  locationId: string;
  receivedDate: Date;
  expiryDate: Date | null;
  warrantyExpiry: Date | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
}

// Batch/lot tracked stock
export interface BatchStock {
  id: string;
  stockId: string;
  itemId: string;
  batchNumber: string;
  quantity: number;
  manufacturingDate: Date | null;
  expiryDate: Date | null;
  status: StockStatus;
  locationId: string;
  supplierId: string | null;
  costPerUnit: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
  createdBy: string;
}

// Stock level summary for an item across all locations
export interface StockSummary {
  itemId: string;
  itemName: string;
  sku: string;
  totalQuantity: number;
  totalReserved: number;
  totalAvailable: number;
  locationCount: number;
  lowStockAlert: boolean;
  lastMovementDate: Date | null;
}

// Input for creating serialized stock
export interface CreateSerializedStockInput {
  itemId: string;
  locationId: string;
  serialNumbers: string[];
  receivedDate?: Date;
  expiryDate?: Date | null;
  warrantyExpiry?: Date | null;
  metadata?: Record<string, unknown>;
}

// Input for creating batch stock
export interface CreateBatchStockInput {
  itemId: string;
  locationId: string;
  batchNumber: string;
  quantity: number;
  manufacturingDate?: Date | null;
  expiryDate?: Date | null;
  supplierId?: string | null;
  costPerUnit: number;
  metadata?: Record<string, unknown>;
}

// Input for updating expiry dates
export interface UpdateExpiryInput {
  stockId: string;
  batchNumber?: string;
  serialNumber?: string;
  newExpiryDate: Date;
  reason: string;
}

// Stock query filters
export interface StockFilters {
  itemId?: string;
  locationId?: string;
  status?: StockStatus;
  lowStock?: boolean;
  expiringSoon?: boolean;
  expiringWithinDays?: number;
}

// Location stock summary
export interface LocationStockSummary {
  locationId: string;
  locationName: string;
  locationCode: string;
  itemCount: number;
  totalQuantity: number;
  totalValue: number;
  capacityUsed: number;
  lastActivityDate: Date | null;
}

