/**
 * Package models for Supabase Edge Function operations
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
  READY_FOR_COLLECTION: 'ready_for_collection',
  DELIVERED: 'delivered',
  COLLECTED: 'collected',
} as const;

export type PackageStatus = (typeof PACKAGE_STATUS)[keyof typeof PACKAGE_STATUS];

/** Edge function endpoint names */
export const EDGE_FUNCTIONS = {
  CREATE_PACKAGE: 'create-package',
  UPDATE_PACKAGE: 'update-package',
  DRIVER_PICKUP: 'driver-pickup',
  RECEIVE_AT_COLLECTION: 'receive-at-collection',
} as const;

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

/** Request payload for updating a package */
export interface UpdatePackageRequest {
  readonly package_id: string;
  readonly status?: PackageStatus;
  readonly notes?: string;
  readonly receiver_email?: string;
}

/** Filters for loading packages */
export interface PackageFilters {
  readonly status?: PackageStatus | string;
  readonly search?: string;
  readonly limit?: number;
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
  readonly created_by?: string;
  readonly updated_at?: string;
  readonly items?: readonly PackageItem[];
}

/** Successful response from create-package endpoint */
export interface CreatePackageSuccessResponse {
  readonly package: Package;
  readonly email_sent: boolean;
  readonly email_error: string | null;
}

/** Error response from API endpoints */
export interface ApiErrorResponse {
  readonly error: string;
  readonly details?: string;
}

/** Successful response from update-package endpoint */
export interface UpdatePackageSuccessResponse {
  readonly package: Package;
}

/** Successful response from driver-pickup/receive-at-collection endpoints */
export interface PackageActionSuccessResponse {
  readonly package: Package;
  readonly email_sent: boolean;
  readonly email_error: string | null;
}

/** Package lock status information */
export interface PackageLockStatus {
  readonly isLocked: boolean;
  readonly lockedAt: string | null;
  readonly podReference: string | null;
  readonly pdfUrl: string | null;
}

/** Union type for create package API responses */
export type CreatePackageApiResponse =
  | CreatePackageSuccessResponse
  | ApiErrorResponse;

/** Union type for update package API responses */
export type UpdatePackageApiResponse =
  | UpdatePackageSuccessResponse
  | ApiErrorResponse;

/** Union type for package action API responses */
export type PackageActionApiResponse =
  | PackageActionSuccessResponse
  | ApiErrorResponse;

// Backward compatibility alias
export type CreatePackageErrorResponse = ApiErrorResponse;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if response is a success response with package
 */
export function isCreatePackageSuccess(
  response: CreatePackageApiResponse
): response is CreatePackageSuccessResponse {
  return 'package' in response && response.package !== undefined;
}

/**
 * Type guard to check if response is an error response
 */
export function isCreatePackageError(
  response: CreatePackageApiResponse
): response is ApiErrorResponse {
  return 'error' in response;
}

/**
 * Type guard to check if update response is successful
 */
export function isUpdatePackageSuccess(
  response: UpdatePackageApiResponse
): response is UpdatePackageSuccessResponse {
  return 'package' in response && response.package !== undefined;
}

/**
 * Type guard to check if package action response is successful
 */
export function isPackageActionSuccess(
  response: PackageActionApiResponse
): response is PackageActionSuccessResponse {
  return 'package' in response && response.package !== undefined;
}

/**
 * Type guard to check if response is an API error
 */
export function isApiError(
  response: unknown
): response is ApiErrorResponse {
  return (
    typeof response === 'object' &&
    response !== null &&
    'error' in response
  );
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

/** Result type for update package operation */
export type UpdatePackageResult = PackageServiceResult<UpdatePackageSuccessResponse> & {
  readonly isLocked?: boolean;
};

/** Result type for package action operations (pickup, receive) */
export type PackageActionResult = PackageServiceResult<PackageActionSuccessResponse>;

/** Result type for single package fetch */
export type GetPackageResult = PackageServiceResult<Package>;

/** Result type for package list fetch */
export type GetPackagesResult = PackageServiceResult<readonly Package[]>;
