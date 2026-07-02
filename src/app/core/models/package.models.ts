/**
 * Package models for Supabase Edge Function operations
 * @description Type definitions for package management operations
 */

// ============================================================================
// Enums & Constants
// ============================================================================

/** Package status values returned by the API */
export const PACKAGE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending',
  NOTIFIED: 'notified',
  IN_TRANSIT: 'in_transit',
  READY_FOR_COLLECTION: 'ready_for_collection',
  DELIVERED: 'delivered',
  COLLECTED: 'collected',
  RETURNED: 'returned',
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
  /**
   * Optional inventory item id this package item is sourced from. When
   * provided, the create-package edge function persists it on
   * `package_items.inventory_item_id` so the link is preserved for later
   * stock reconciliation (edits, deletions).
   */
  readonly inventory_item_id?: string | null;
}

/** PO allocation linked to one package item row in the create request */
export interface PurchaseOrderAllocationRequest {
  readonly purchase_order_item_id: string;
  readonly item_index: number;
  readonly quantity: number;
}

/** Request payload for creating a new package */
export interface CreatePackageRequest {
  readonly receiver_email: string;
  readonly notes?: string;
  /** Optional initial status for the package (e.g. 'draft') */
  readonly status?: PackageStatus;
  readonly items?: readonly PackageItemRequest[];
  readonly delivery_location_id?: string;
  readonly po_number?: string;
  readonly po_allocations?: readonly PurchaseOrderAllocationRequest[];
}

/** Proof-of-delivery party (receiver or witness) captured when marking collected */
export interface PodParty {
  readonly name: string;
  readonly employee_number: string;
  readonly phone: string;
  /** Signature image as a base64 PNG data URL */
  readonly signature_data_url: string;
}

/** Proof-of-delivery payload submitted when marking a package as collected */
export interface MarkCollectedPayload {
  readonly receiver: PodParty;
  readonly witness: PodParty;
  /** ISO timestamp of when collection was confirmed (client-side) */
  readonly collected_at: string;
  /**
   * Optional base64-encoded PDF of the rendered POD document. When supplied,
   * the `update-package` Edge Function attaches it to the "Package Completed"
   * email sent to the receiver. Must be the raw base64 string WITHOUT the
   * `data:application/pdf;base64,` prefix.
   */
  readonly pdf_base64?: string;
  /** Optional filename for the attached POD PDF (defaults to POD-<reference>.pdf) */
  readonly pdf_filename?: string;
  /** Optional status label to persist on the POD record (e.g. 'Delivered', 'Collected') */
  readonly completion_status?: 'Delivered' | 'Collected';
}

/** Quantity change for an existing package_items row (pending/notified packages only) */
export interface PackageItemUpdate {
  readonly id: string;
  readonly quantity: number;
}

/**
 * Items diff sent to update-package when editing the contents of a pending or
 * notified package. Linked inventory rows are reconciled server-side: returned to
 * stock when quantities decrease or items are deleted, decremented when
 * quantities increase. Insufficient stock causes the request to fail.
 */
export interface UpdatePackageItemsPayload {
  readonly updates?: readonly PackageItemUpdate[];
  readonly deletes?: readonly string[];
  /**
   * New package_items to insert on the existing package. Each carries a
   * description, quantity and optional `inventory_item_id`; linked inventory is
   * consumed server-side (negative stock allowed) with a movement row logged,
   * exactly like the create-package flow.
   */
  readonly creates?: readonly PackageItemRequest[];
}

/** Request payload for updating a package */
export interface UpdatePackageRequest {
  readonly package_id: string;
  readonly status?: PackageStatus;
  readonly notes?: string;
  readonly receiver_email?: string;
  /**
   * Optional driver user_id to assign to the package. Typically sent
   * when transitioning to `in_transit` so the package's `picked_up_by`
   * column is populated with the assigned driver's auth user id.
   */
  readonly driver_user_id?: string;
  /** Optional proof-of-delivery payload (sent when transitioning to `collected`) */
  readonly pod?: MarkCollectedPayload;
  /**
   * Optional items diff for editing pending/notified packages. Server validates
   * the package is still editable and reconciles linked inventory
   * stock atomically with the package_items mutations.
   */
  readonly items?: UpdatePackageItemsPayload;
}

/** Filters for loading packages */
export interface PackageFilters {
  readonly status?: PackageStatus | string;
  readonly search?: string;
  readonly limit?: number;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  /** 1-based page number. When provided alongside `pageSize`, results are paginated server-side. */
  readonly page?: number;
  /** Page size for server-side pagination. */
  readonly pageSize?: number;
}

// ============================================================================
// Response Types
// ============================================================================

/** Package item returned from the API */
export interface PackageItem {
  readonly id: string;
  readonly quantity: number;
  readonly description: string;
  /**
   * The inventory item this row was sourced from, if any. `null` for
   * free-text items that were never linked to inventory. Required for
   * the edit-pending flow to know whether to reconcile stock.
   */
  readonly inventory_item_id?: string | null;
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
  readonly po_number?: string | null;
  /** auth.users.id of the driver currently assigned to this package, if any */
  readonly picked_up_by?: string | null;
  /**
   * ISO timestamp the package was soft-deleted. `null` for live orders.
   * Soft-deleted rows are hidden from the standard order list and most
   * dashboard queries; only the privileged "order deleter" account can see
   * them via the dedicated "Deleted orders" view.
   */
  readonly deleted_at?: string | null;
  /** auth.users.id of the account that soft-deleted the package, if any */
  readonly deleted_by?: string | null;
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
  /**
   * Optional warning surfaced when the package status update succeeded but
   * a side-effect (e.g. persisting the POD row, sending an email) failed.
   * The package row is still authoritative.
   */
  readonly pod_warning?: string;
}

/** Successful response from driver-pickup/receive-at-collection endpoints */
export interface PackageActionSuccessResponse {
  readonly package: Package;
  readonly email_sent: boolean;
  readonly email_error: string | null;
}

/**
 * Proof-of-Delivery record persisted in the `pods` table.
 * Captured by the mark-collected modal and rendered by the POD document.
 */
export interface PodRecord {
  readonly id: string;
  readonly package_id: string;
  readonly pod_reference: string | null;
  readonly is_locked: boolean | null;
  readonly locked_at: string | null;

  // Receiver
  readonly receiver_name: string | null;
  readonly receiver_employee_number: string | null;
  readonly receiver_phone: string | null;
  /** Base64 PNG data URL */
  readonly receiver_signature: string | null;

  // Witness
  readonly witness_name: string | null;
  readonly witness_employee_number: string | null;
  readonly witness_phone: string | null;
  /** Base64 PNG data URL */
  readonly witness_signature: string | null;

  // Completion metadata
  readonly completed_at: string | null;
  readonly completed_by: string | null;
  readonly staff_name?: string | null;
  readonly completion_status?: 'Delivered' | 'Collected' | null;
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
  inventoryItemId?: string;
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

/** PO item balance payload used by PO lookup in create-order flows */
export interface PurchaseOrderItemBalanceSummary {
  readonly purchaseOrderItemId: string;
  readonly purchaseOrderId: string;
  readonly inventoryItemId: string;
  readonly orderedQuantity: number;
  readonly allocatedQuantity: number;
  readonly remainingQuantity: number;
}

/** Lookup response payload for PO number searches */
export interface PurchaseOrderLookupData {
  readonly poNumber: string;
  readonly items: readonly PurchaseOrderItemBalanceSummary[];
}

/** Effective balance for a PO line when combining allocation data with existing order usage */
export interface PurchaseOrderLineBalance {
  readonly allocatedQuantity: number;
  readonly remainingQuantity: number;
}

/**
 * Computes the effective allocated/remaining quantities for a PO line.
 * Uses the larger of:
 * - DB allocation totals (purchase_order_item_allocations)
 * - Existing order usage for the same inventory item
 *
 * This keeps PO lookup accurate for historical orders that may not have
 * allocation rows but already consumed PO quantities.
 */
export function computePurchaseOrderLineBalance(
  orderedQuantity: number,
  allocatedQuantity: number,
  consumedQuantity: number
): PurchaseOrderLineBalance {
  const ordered = Math.max(0, Number(orderedQuantity) || 0);
  const allocated = Math.max(0, Number(allocatedQuantity) || 0);
  const consumed = Math.max(0, Number(consumedQuantity) || 0);
  const effectiveAllocated = Math.min(ordered, Math.max(allocated, consumed));

  return {
    allocatedQuantity: effectiveAllocated,
    remainingQuantity: Math.max(0, ordered - effectiveAllocated),
  };
}

/** Result type for PO lookup by number */
export type GetPurchaseOrderByNumberResult = PackageServiceResult<PurchaseOrderLookupData>;

// ============================================================================
// Status Workflow Helpers
// ============================================================================

/**
 * Canonical forward order of package statuses.
 * Used to enforce the process rules when admins/collections manually
 * change a package's status.
 */
export const PACKAGE_STATUS_FLOW: readonly PackageStatus[] = [
  PACKAGE_STATUS.DRAFT,
  PACKAGE_STATUS.PENDING,
  PACKAGE_STATUS.NOTIFIED,
  PACKAGE_STATUS.IN_TRANSIT,
  PACKAGE_STATUS.READY_FOR_COLLECTION,
  PACKAGE_STATUS.COLLECTED,
] as const;

/**
 * Returns the list of statuses an admin/collection user is allowed to
 * manually set given the package's current status.
 *
 * Rules:
 * - Forward-only transitions (no going backwards in the flow)…
 * - …with one exception: `ready_for_collection` may be moved back to
 *   `notified` (e.g. to re-notify the receiver).
 * - `collected` is excluded — it requires the proof-of-delivery modal flow.
 * - Final states (`collected`, `delivered`, `returned`) return an empty list.
 */
export function getAllowedManualStatusTransitions(
  currentStatus: PackageStatus
): readonly PackageStatus[] {
  // Final states cannot be changed.
  if (
    currentStatus === PACKAGE_STATUS.COLLECTED ||
    currentStatus === PACKAGE_STATUS.DELIVERED ||
    currentStatus === PACKAGE_STATUS.RETURNED
  ) {
    return [];
  }

  // Special case: allow ready_for_collection → notified (re-notify flow).
  if (currentStatus === PACKAGE_STATUS.READY_FOR_COLLECTION) {
    return [PACKAGE_STATUS.NOTIFIED];
  }

  // Allow draft to move forward to pending
  if (currentStatus === PACKAGE_STATUS.DRAFT) {
    // Option: allow admins to move a Draft directly to Notified (skip Pending)
    // so the receiver can be notified immediately from the UI.
    return [PACKAGE_STATUS.PENDING, PACKAGE_STATUS.NOTIFIED];
  }

  const currentIndex = PACKAGE_STATUS_FLOW.indexOf(currentStatus);
  if (currentIndex === -1) {
    return [];
  }

  // Take statuses strictly after the current one, excluding COLLECTED.
  return PACKAGE_STATUS_FLOW
    .slice(currentIndex + 1)
    .filter((s) => s !== PACKAGE_STATUS.COLLECTED);
}

/**
 * Returns true when a package is still in a state where its contents
 * (item quantities / removals) may be edited from the UI. Currently
 * limited to the `pending` and `notified` statuses.
 */
export function isPackageEditable(pkg: Pick<Package, 'status'>): boolean {
  return (
    pkg.status === PACKAGE_STATUS.PENDING ||
    pkg.status === PACKAGE_STATUS.NOTIFIED ||
    pkg.status === PACKAGE_STATUS.DRAFT
  );
}
