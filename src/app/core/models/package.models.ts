/**
 * Package models for Supabase Edge Function: create-package
 * @description Type definitions for package management operations
 */

// ============================================================================
// Enums & Constants
// ============================================================================

/** Package status values returned by the API */
export const PACKAGE_STATUS = {
  PENDING: 'pending',
  NOTIFIED: 'notified',
  IN_TRANSIT: 'in_transit',
  DELIVERED: 'delivered',
  COLLECTED: 'collected',
} as const;

export type PackageStatus = (typeof PACKAGE_STATUS)[keyof typeof PACKAGE_STATUS];

// ============================================================================
// Request Types
// ============================================================================

/** Package item included in a create request */
export interface PackageItemRequest {
  readonly quantity: number;
  readonly description: string;
}

/** Request payload for creating a new package */
export interface CreatePackageRequest {
  readonly receiver_email: string;
  readonly notes?: string;
  readonly items?: readonly PackageItemRequest[];
  readonly delivery_location_id?: string;
  readonly po_number?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/** Package item returned from the API */
export interface PackageItem {
  readonly id: string;
  readonly quantity: number;
  readonly description: string;
}

/** Package entity returned from the API */
export interface Package {
  readonly id: string;
  readonly reference: string;
  readonly receiver_email: string;
  readonly notes: string | null;
  readonly status: PackageStatus;
  readonly created_at: string;
  readonly items: readonly PackageItem[];
}

/** Successful response from create-package endpoint */
export interface CreatePackageSuccessResponse {
  readonly package: Package;
  readonly email_sent: boolean;
  readonly email_error: string | null;
}

/** Error response from create-package endpoint */
export interface CreatePackageErrorResponse {
  readonly error: string;
  readonly details?: string;
}

/** Union type for all possible API responses */
export type CreatePackageApiResponse =
  | CreatePackageSuccessResponse
  | CreatePackageErrorResponse;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if response is a success response
 * @param response - The API response to check
 * @returns True if the response contains a package
 */
export function isCreatePackageSuccess(
  response: CreatePackageApiResponse
): response is CreatePackageSuccessResponse {
  return 'package' in response && response.package !== undefined;
}

/**
 * Type guard to check if response is an error response
 * @param response - The API response to check
 * @returns True if the response contains an error
 */
export function isCreatePackageError(
  response: CreatePackageApiResponse
): response is CreatePackageErrorResponse {
  return 'error' in response;
}

// ============================================================================
// Form Types (for reactive forms)
// ============================================================================

/** Shape of package item form group */
export interface PackageItemFormValue {
  quantity: number;
  description: string;
}

/** Shape of create package form */
export interface CreatePackageFormValue {
  receiverEmail: string;
  notes: string;
  poNumber: string;
  deliveryLocationId: string;
  items: PackageItemFormValue[];
}

// ============================================================================
// Service Response Types
// ============================================================================

/** Result type for package service operations */
export type PackageServiceResult<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: string };

/** Specific result type for create package operation */
export type CreatePackageResult = PackageServiceResult<CreatePackageSuccessResponse>;

