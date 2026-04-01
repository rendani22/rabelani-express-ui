/**
 * Purchasing Feature Types
 * Type definitions for supplier and purchase order management
 */

import type { BaseEntity, PurchaseOrderStatus, SoftDeletable } from '../../core/types/index.ts';

// Supplier entity
export interface Supplier extends BaseEntity, SoftDeletable {
  code: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  address: SupplierAddress | null;
  paymentTerms: string | null;
  leadTimeDays: number;
  minimumOrderValue: number | null;
  rating: number | null;
  isActive: boolean;
  notes: string | null;
  organizationId: string;
}

export interface SupplierAddress {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

// Purchase order entity
export interface PurchaseOrder extends BaseEntity {
  orderNumber: string;
  supplierId: string;
  status: PurchaseOrderStatus;
  orderDate: Date;
  expectedDeliveryDate: Date | null;
  deliveredDate: Date | null;
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  notes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  organizationId: string;
}

// Purchase order with supplier details
export interface PurchaseOrderWithDetails extends PurchaseOrder {
  supplier: {
    id: string;
    code: string;
    name: string;
  };
  lines: PurchaseOrderLine[];
}

// Purchase order line item
export interface PurchaseOrderLine extends BaseEntity {
  purchaseOrderId: string;
  itemId: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  receivedQuantity: number;
  locationId: string | null;
  notes: string | null;
}

// Restock rule for automated purchasing
export interface RestockRule extends BaseEntity {
  itemId: string;
  supplierId: string;
  reorderPoint: number;
  reorderQuantity: number;
  minimumOrderQuantity: number;
  leadTimeDays: number;
  isActive: boolean;
  lastTriggeredAt: Date | null;
  organizationId: string;
}

// Input for creating a supplier
export interface CreateSupplierInput {
  code: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  address?: SupplierAddress;
  paymentTerms?: string;
  leadTimeDays?: number;
  minimumOrderValue?: number;
  notes?: string;
}

// Input for creating a purchase order
export interface CreatePurchaseOrderInput {
  supplierId: string;
  expectedDeliveryDate?: Date;
  lines: CreatePurchaseOrderLineInput[];
  notes?: string;
}

export interface CreatePurchaseOrderLineInput {
  itemId: string;
  quantity: number;
  unitCost: number;
  locationId?: string;
  notes?: string;
}

// Input for updating purchase order status
export interface UpdatePurchaseOrderStatusInput {
  status: PurchaseOrderStatus;
  notes?: string;
}

// Input for creating restock rule
export interface CreateRestockRuleInput {
  itemId: string;
  supplierId: string;
  reorderPoint: number;
  reorderQuantity: number;
  minimumOrderQuantity?: number;
  leadTimeDays?: number;
}

// Supplier filters
export interface SupplierFilters {
  search?: string;
  isActive?: boolean;
}

// Purchase order filters
export interface PurchaseOrderFilters {
  supplierId?: string;
  status?: PurchaseOrderStatus;
  startDate?: Date;
  endDate?: Date;
}

