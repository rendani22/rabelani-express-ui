/**
 * Core type definitions for the Inventory Management API
 * Contains common types used across all features
 */

// User roles for authorization
export type UserRole = 'admin' | 'manager' | 'operator' | 'viewer';

// Authenticated user object available in request context
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  permissions: string[];
}

// Pagination parameters for list endpoints
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Paginated response wrapper
export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

// Date range filter for queries
export interface DateRangeFilter {
  startDate?: Date;
  endDate?: Date;
}

// Common audit fields for database records
export interface AuditFields {
  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

// Soft delete support
export interface SoftDeletable {
  deletedAt: Date | null;
  deletedBy: string | null;
}

// Base entity with ID and audit fields
export interface BaseEntity extends AuditFields {
  id: string;
}

// Unit of measurement types
export type UnitOfMeasure =
  | 'piece'
  | 'kg'
  | 'g'
  | 'liter'
  | 'ml'
  | 'meter'
  | 'cm'
  | 'box'
  | 'pallet'
  | 'carton';

// Stock status types
export type StockStatus =
  | 'available'
  | 'reserved'
  | 'in_transit'
  | 'damaged'
  | 'expired'
  | 'quarantine';

// Movement types for stock tracking
export type MovementType =
  | 'receipt'
  | 'transfer'
  | 'adjustment'
  | 'sale'
  | 'return'
  | 'write_off'
  | 'production';

// Alert severity levels
export type AlertSeverity = 'low' | 'medium' | 'high' | 'critical';

// Purchase order status
export type PurchaseOrderStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'ordered'
  | 'partially_received'
  | 'received'
  | 'cancelled';

// Generic ID type for database records
export type EntityId = string;

// HTTP methods supported
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Feature module names for logging
export type FeatureModule =
  | 'stock'
  | 'items'
  | 'movements'
  | 'alerts'
  | 'reports'
  | 'purchasing'
  | 'usage';

