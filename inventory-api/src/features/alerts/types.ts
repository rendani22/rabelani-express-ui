/**
 * Alerts Feature Types
 * Type definitions for inventory alert functionality
 */

import type { BaseEntity, AlertSeverity } from '../../core/types/index.ts';

// Alert entity
export interface Alert extends BaseEntity {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  itemId: string | null;
  locationId: string | null;
  threshold: number | null;
  currentValue: number | null;
  status: AlertStatus;
  acknowledgedBy: string | null;
  acknowledgedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  organizationId: string;
}

// Alert types
export type AlertType =
  | 'low_stock'
  | 'out_of_stock'
  | 'expiring_soon'
  | 'expired'
  | 'overstock'
  | 'reorder_point'
  | 'threshold_breach';

// Alert status
export type AlertStatus = 'active' | 'acknowledged' | 'resolved' | 'dismissed';

// Alert with related details
export interface AlertWithDetails extends Alert {
  item: {
    id: string;
    sku: string;
    name: string;
  } | null;
  location: {
    id: string;
    name: string;
    code: string;
  } | null;
}

// Threshold rule for automated alerts
export interface ThresholdRule extends BaseEntity {
  name: string;
  description: string | null;
  itemId: string | null;  // null = applies to all items
  category: string | null;  // null = applies to all categories
  locationId: string | null;  // null = applies to all locations
  thresholdType: ThresholdType;
  thresholdValue: number;
  severity: AlertSeverity;
  isActive: boolean;
  organizationId: string;
}

// Threshold types
export type ThresholdType =
  | 'min_quantity'
  | 'max_quantity'
  | 'expiry_days'
  | 'reorder_point';

// Input for creating a threshold rule
export interface CreateThresholdInput {
  name: string;
  description?: string;
  itemId?: string;
  category?: string;
  locationId?: string;
  thresholdType: ThresholdType;
  thresholdValue: number;
  severity: AlertSeverity;
}

// Input for updating alert status
export interface UpdateAlertInput {
  status: AlertStatus;
  notes?: string;
}

// Alert filters for queries
export interface AlertFilters {
  type?: AlertType;
  severity?: AlertSeverity;
  status?: AlertStatus;
  itemId?: string;
  locationId?: string;
  startDate?: Date;
  endDate?: Date;
}

// Alert summary by type
export interface AlertSummary {
  type: AlertType;
  severity: AlertSeverity;
  count: number;
}

