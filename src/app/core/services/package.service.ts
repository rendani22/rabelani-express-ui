import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import { StaffService } from './staff.service';
import { InventoryService } from './inventory.service';
import { environment } from '../../../environments/environment';
import {
  Package,
  PackageFilters,
  PackageLockStatus,
  PodRecord,
  CreatePackageRequest,
  UpdatePackageRequest,
  CreatePackageApiResponse,
  UpdatePackageApiResponse,
  PackageActionApiResponse,
  CreatePackageResult,
  UpdatePackageResult,
  PackageActionResult,
  GetPackageResult,
  GetPackagesResult,
  CreatePackageSuccessResponse,
  UpdatePackageSuccessResponse,
  PackageActionSuccessResponse,
  isCreatePackageSuccess,
  isCreatePackageError,
  isUpdatePackageSuccess,
  isPackageActionSuccess,
  isApiError,
  EDGE_FUNCTIONS,
} from '../models/package.models';

/**
 * PackageService handles package CRUD operations via Supabase Edge Functions.
 *
 * Key features:
 * - Create packages (warehouse/admin only)
 * - List and filter packages
 * - Update package status
 * - Driver pickup and collection point receipt
 * - Package lock status management
 *
 * Uses Angular signals for reactive state management.
 */
@Injectable({
  providedIn: 'root',
})
export class PackageService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly staffService = inject(StaffService);
  private readonly inventoryService = inject(InventoryService);
  private readonly baseUrl = environment.supabase.functionsUrl;
  private readonly apiKey = environment.supabase.anonKey;

  // ============================================================================
  // State Signals
  // ============================================================================

  /** List of loaded packages */
  private readonly _packages = signal<readonly Package[]>([]);
  readonly packages = this._packages.asReadonly();

  /**
   * Total number of packages matching the most recent `loadPackages` query
   * (ignoring page/pageSize). Used to drive server-side pagination UIs.
   * `null` means "unknown" — e.g. before the first load.
   */
  private readonly _totalCount = signal<number | null>(null);
  readonly totalCount = this._totalCount.asReadonly();

  /** Loading state for async operations */
  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  /** Error state */
  private readonly _error = signal<string | null>(null);
  readonly error = this._error.asReadonly();

  /** Computed property indicating if service is ready for operations */
  readonly isReady = computed(() => this.supabaseService.isAuthenticated());

  /** Computed property for current user ID */
  readonly currentUserId = computed(() => this.supabaseService.currentUser()?.id ?? null);

  /**
   * Email of the only account permitted to delete orders. Deletion also
   * returns linked inventory stock for any items in the deleted package.
   */
  private static readonly ORDER_DELETE_ALLOWED_EMAIL = 'rendani@email.com';

  /**
   * True when the currently authenticated user is allowed to delete orders.
   * Currently restricted to a single account (see ORDER_DELETE_ALLOWED_EMAIL).
   */
  readonly canDeleteOrders = computed(() => {
    const email = this.supabaseService.currentUser()?.email?.trim().toLowerCase() ?? '';
    return email === PackageService.ORDER_DELETE_ALLOWED_EMAIL;
  });

  // ============================================================================
  // Package Creation
  // ============================================================================

  /**
   * Creates a new package by calling the Supabase Edge Function.
   * Requires authenticated user with warehouse or admin role.
   *
   * @param request - The package creation request payload
   * @returns Promise with success/error result
   */
  async createPackage(request: CreatePackageRequest): Promise<CreatePackageResult> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const accessToken = await this.getAccessToken();

      if (!accessToken) {
        return this.errorResult('You must be logged in to create a package');
      }

      const response = await this.callEdgeFunction<CreatePackageApiResponse>(
        EDGE_FUNCTIONS.CREATE_PACKAGE,
        accessToken,
        request
      );

      if (isCreatePackageSuccess(response)) {
        // Add to local list
        this._packages.update(packages => [response.package, ...packages]);
        return this.successResult(response);
      }

      if (isCreatePackageError(response)) {
        const errorMessage = response.details ?? response.error;
        this._error.set(errorMessage);
        return this.errorResult(errorMessage);
      }

      return this.errorResult('Unexpected response format');
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Package Retrieval
  // ============================================================================

  /**
   * Load all packages with optional filters.
   *
   * @param filters - Optional filters for status, search, and limit
   * @param options - When `includeDeleted` is true, soft-deleted packages are
   *   included (only the privileged "Deleted orders" view should set this).
   */
  async loadPackages(
    filters?: PackageFilters,
    options?: { includeDeleted?: boolean },
  ): Promise<GetPackagesResult> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      let query = this.supabaseService.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)', {
          count: 'exact',
        })
        .order('created_at', { ascending: false });

      if (!options?.includeDeleted) {
        // Hide soft-deleted orders from the standard list. RLS would also
        // filter them out for non-privileged accounts, but applying the
        // filter client-side keeps the privileged account's normal views
        // free of recycle-bin rows too.
        query = query.is('deleted_at', null);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.search) {
        const term = filters.search.replace(/[,()]/g, ' ').trim();
        if (term) {
          // The packages table has no receiver_name column — receiver names
          // live on `receiver_profiles` keyed by email. Look up matching
          // receiver emails first, then OR them into the package filter
          // alongside po_number / receiver_email matches on the package row.
          const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
          const { data: receiverMatches } = await this.supabaseService.client
            .from('receiver_profiles')
            .select('email')
            .or(`name.ilike.%${escaped}%,surname.ilike.%${escaped}%`)
            .limit(200);

          const emails = Array.from(
            new Set(
              (receiverMatches ?? [])
                .map(r => (r as { email: string | null }).email)
                .filter((e): e is string => !!e)
            )
          );

          const orParts = [
            `po_number.ilike.%${escaped}%`,
            `receiver_email.ilike.%${escaped}%`,
          ];
          if (emails.length > 0) {
            // Quote emails to be safe inside PostgREST `in` list
            const list = emails.map(e => `"${e.replace(/"/g, '\\"')}"`).join(',');
            orParts.push(`receiver_email.in.(${list})`);
          }

          query = query.or(orParts.join(','));
        }
      }

      if (filters?.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }

      if (filters?.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      // Server-side pagination: when both page and pageSize are provided,
      // use PostgREST `.range()` (inclusive bounds) so we only fetch the
      // current page rather than the entire table.
      if (filters?.page && filters?.pageSize && filters.pageSize > 0) {
        const page = Math.max(1, filters.page);
        const size = filters.pageSize;
        const from = (page - 1) * size;
        const to = from + size - 1;
        query = query.range(from, to);
      }

      const { data, error, count } = await query;

      if (error) {
        this._error.set(error.message);
        return { success: false, error: error.message };
      }

      const packages = (data ?? []) as Package[];
      this._packages.set(packages);
      this._totalCount.set(count ?? packages.length);
      return { success: true, data: packages };
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Get a single package by ID.
   *
   * @param id - Package UUID
   */
  async getPackage(id: string): Promise<GetPackageResult> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .eq('id', id)
        .is('deleted_at', null)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as Package };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a package by reference code.
   *
   * @param reference - Package reference string
   */
  async getPackageByReference(reference: string): Promise<GetPackageResult> {
    try {
      const { data, error } = await this.supabaseService.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .eq('reference', reference.toUpperCase())
        .is('deleted_at', null)
        .single();

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true, data: data as Package };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get a package by purchase order (PO) number.
   * Returns the most recently created match if multiple exist.
   *
   * @param poNumber - Purchase order number to search for
   */
  async getPackageByPoNumber(poNumber: string): Promise<GetPackageResult> {
    try {
      const trimmed = poNumber.trim();
      if (!trimmed) {
        return { success: false, error: 'PO number is required' };
      }

      const { data, error } = await this.supabaseService.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .eq('po_number', trimmed)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        return { success: false, error: error.message };
      }

      if (!data) {
        return { success: false, error: 'Not found' };
      }

      return { success: true, data: data as Package };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Get recent packages created by current user.
   *
   * @param limit - Maximum number of packages to return (default: 5)
   */
  async getMyRecentPackages(limit = 5): Promise<readonly Package[]> {
    const userId = this.currentUserId();
    if (!userId) return [];

    try {
      const { data } = await this.supabaseService.client
        .from('packages')
        .select('*')
        .eq('created_by', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      return (data ?? []) as Package[];
    } catch {
      return [];
    }
  }

  // ============================================================================
  // Package Updates
  // ============================================================================

  /**
   * Update a package via Edge Function.
   * Enforces lock checks - locked packages cannot be modified.
   *
   * @param id - Package UUID
   * @param updates - Fields to update (excluding package_id)
   */
  async updatePackage(
    id: string,
    updates: Omit<UpdatePackageRequest, 'package_id'>
  ): Promise<UpdatePackageResult> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const accessToken = await this.getAccessToken();

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await this.callEdgeFunction<UpdatePackageApiResponse>(
        EDGE_FUNCTIONS.UPDATE_PACKAGE,
        accessToken,
        { package_id: id, ...updates }
      );

      if (isUpdatePackageSuccess(response)) {
        // Update local list
        this.updatePackageInList(id, response.package);
        return { success: true, data: response };
      }

      if (isApiError(response)) {
        const errorMessage = response.details ?? response.error;
        this._error.set(errorMessage);

        // Check if it's a lock error
        const isLocked = response.error === 'Package is locked';
        return { success: false, error: errorMessage, isLocked };
      }

      return { success: false, error: 'Unexpected response format' };
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Workflow Actions
  // ============================================================================

  /**
   * Driver picks up package for delivery.
   * Marks package as in_transit and sends "On the Way" email.
   *
   * @param packageId - Package UUID
   */
  async driverPickup(packageId: string): Promise<PackageActionResult> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Force refresh the session to get a new valid token
      const accessToken = await this.getRefreshedAccessToken();

      if (!accessToken) {
        return { success: false, error: 'Session expired. Please log in again.' };
      }

      const response = await this.callEdgeFunction<PackageActionApiResponse>(
        EDGE_FUNCTIONS.DRIVER_PICKUP,
        accessToken,
        { package_id: packageId }
      );

      if (isPackageActionSuccess(response)) {
        this.updatePackageInList(packageId, response.package);
        return { success: true, data: response };
      }

      if (isApiError(response)) {
        const errorMessage = response.details ?? response.error;
        this._error.set(errorMessage);
        return { success: false, error: errorMessage };
      }

      return { success: false, error: 'Failed to pickup package' };
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Collection point staff receives package.
   * Marks package as ready_for_collection and sends notification email.
   *
   * @param packageId - Package UUID
   */
  async receiveAtCollection(packageId: string): Promise<PackageActionResult> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const accessToken = await this.getAccessToken();

      if (!accessToken) {
        return { success: false, error: 'Not authenticated' };
      }

      const response = await this.callEdgeFunction<PackageActionApiResponse>(
        EDGE_FUNCTIONS.RECEIVE_AT_COLLECTION,
        accessToken,
        { package_id: packageId }
      );

      if (isPackageActionSuccess(response)) {
        this.updatePackageInList(packageId, response.package);
        return { success: true, data: response };
      }

      if (isApiError(response)) {
        const errorMessage = response.details ?? response.error;
        this._error.set(errorMessage);
        return { success: false, error: errorMessage };
      }

      return { success: false, error: 'Failed to receive package' };
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Package Deletion
  // ============================================================================

  /**
   * Soft-delete a package: marks `deleted_at` so the order is hidden from
   * the live list but its row, items, POD, and inventory-movement audit
   * trail are preserved. Stock for any inventory-linked items is returned
   * to inventory at delete time (matches the user's "give me my stock back"
   * intent). The package can later be restored via `restorePackage` —
   * which will re-deduct stock (and may push it negative if other orders
   * have since consumed it).
   *
   * Only the privileged "order deleter" account may call this method.
   * Returns the soft-deleted package on success along with the number of
   * inventory items that were returned for context in the confirmation toast.
   */
  async deletePackageWithInventoryReturn(
    id: string,
  ): Promise<{ success: boolean; error?: string; package?: Package; returnedItems?: number }> {
    if (!this.canDeleteOrders()) {
      return { success: false, error: 'You are not permitted to delete orders.' };
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // 1. Load the package + items so we know what stock to return.
      const fetchResult = await this.getPackage(id);
      if (!fetchResult.success) {
        this._error.set(fetchResult.error);
        return { success: false, error: fetchResult.error };
      }
      const pkg = fetchResult.data;

      // 2. Build the list of inventory-linked items to return.
      const itemsToReturn = (pkg.items ?? [])
        .filter(item => !!item.inventory_item_id && item.quantity > 0)
        .map(item => ({
          inventoryItemId: item.inventory_item_id as string,
          quantity: item.quantity,
        }));

      // 3. Return stock first. If the stock return fails we still attempt
      // the soft delete so the user isn't left with a "ghost" undeletable
      // order — but we surface the underlying error in the result.
      let returnError: string | null = null;
      if (itemsToReturn.length > 0) {
        try {
          await this.inventoryService.returnStock(itemsToReturn, pkg.reference);
        } catch (err) {
          returnError = err instanceof Error ? err.message : 'Failed to return inventory.';
          console.error('[PackageService] returnStock failed:', err);
        }
      }

      // 4. Soft-delete via the SECURITY DEFINER RPC so the operation is
      // atomic and authorized server-side.
      const { data, error } = await this.supabaseService.client
        .rpc('soft_delete_package', { p_package_id: id });

      if (error) {
        this._error.set(error.message);
        return { success: false, error: error.message, package: pkg };
      }

      // Remove from the live list so the UI updates immediately.
      this._packages.update(packages => packages.filter(p => p.id !== id));

      const deletedPkg = (Array.isArray(data) ? data[0] : data) as Package | null;

      return {
        success: true,
        package: deletedPkg ?? pkg,
        returnedItems: itemsToReturn.length,
        error: returnError ?? undefined,
      };
    } catch (error) {
      const result = this.handleError(error);
      return { success: false, error: result.error };
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Restore a previously soft-deleted package and re-deduct stock for any
   * inventory-linked items. If stock has since been consumed by other
   * orders the deduction will push inventory negative — this is surfaced
   * as a warning rather than blocking the restore.
   *
   * Only the privileged "order deleter" account may call this method.
   */
  async restorePackage(
    id: string,
  ): Promise<{ success: boolean; error?: string; package?: Package; reDeductedItems?: number }> {
    if (!this.canDeleteOrders()) {
      return { success: false, error: 'You are not permitted to restore orders.' };
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      // Load the soft-deleted package including its items so we know what
      // stock to re-deduct.
      const { data: pkgRow, error: fetchError } = await this.supabaseService.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .eq('id', id)
        .maybeSingle();

      if (fetchError) {
        this._error.set(fetchError.message);
        return { success: false, error: fetchError.message };
      }
      if (!pkgRow) {
        return { success: false, error: 'Package not found.' };
      }

      const pkg = pkgRow as Package;
      const itemsToReDeduct = (pkg.items ?? [])
        .filter(item => !!item.inventory_item_id && item.quantity > 0)
        .map(item => ({
          inventoryItemId: item.inventory_item_id as string,
          quantity: item.quantity,
        }));

      // Restore the row via the SECURITY DEFINER RPC.
      const { data, error } = await this.supabaseService.client
        .rpc('restore_package', { p_package_id: id });

      if (error) {
        this._error.set(error.message);
        return { success: false, error: error.message, package: pkg };
      }

      // Re-deduct stock (non-fatal).
      let deductError: string | null = null;
      if (itemsToReDeduct.length > 0) {
        try {
          await this.inventoryService.deductStock(itemsToReDeduct, pkg.reference);
        } catch (err) {
          deductError = err instanceof Error ? err.message : 'Failed to re-deduct inventory.';
          console.error('[PackageService] deductStock failed during restore:', err);
        }
      }

      const restoredPkg = (Array.isArray(data) ? data[0] : data) as Package | null;

      return {
        success: true,
        package: restoredPkg ?? pkg,
        reDeductedItems: itemsToReDeduct.length,
        error: deductError ?? undefined,
      };
    } catch (error) {
      const result = this.handleError(error);
      return { success: false, error: result.error };
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Load soft-deleted packages for the "Deleted orders" recycle-bin view.
   * Only the privileged account will see results (RLS enforces this on the
   * server). The local `packages` signal is NOT updated by this method —
   * deleted rows are returned as a separate list so they never leak into
   * the live orders table.
   */
  async loadDeletedPackages(): Promise<GetPackagesResult> {
    if (!this.canDeleteOrders()) {
      return { success: false, error: 'You are not permitted to view deleted orders.' };
    }

    try {
      const { data, error } = await this.supabaseService.client
        .from('packages')
        .select('*, items:package_items(id, quantity, description, inventory_item_id)')
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

      if (error) {
        return { success: false, error: error.message };
      }
      return { success: true, data: (data ?? []) as Package[] };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Delete a single package by ID via direct Supabase call.
   * Removes the package from local state on success.
   *
   * @param id - Package UUID
   */
  async deletePackage(id: string): Promise<{ success: boolean; error?: string }> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      const { error } = await this.supabaseService.client
        .from('packages')
        .delete()
        .eq('id', id);

      if (error) {
        this._error.set(error.message);
        return { success: false, error: error.message };
      }

      this._packages.update(packages => packages.filter(p => p.id !== id));
      return { success: true };
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Delete multiple packages by ID. Returns an aggregate result with the
   * number of successful and failed deletions.
   *
   * @param ids - Array of package UUIDs
   */
  async deletePackages(
    ids: readonly string[]
  ): Promise<{ success: boolean; deleted: number; failed: number; error?: string }> {
    if (ids.length === 0) {
      return { success: true, deleted: 0, failed: 0 };
    }

    this._isLoading.set(true);
    this._error.set(null);

    try {
      const { error } = await this.supabaseService.client
        .from('packages')
        .delete()
        .in('id', ids as string[]);

      if (error) {
        this._error.set(error.message);
        return { success: false, deleted: 0, failed: ids.length, error: error.message };
      }

      const idSet = new Set(ids);
      this._packages.update(packages => packages.filter(p => !idSet.has(p.id)));
      return { success: true, deleted: ids.length, failed: 0 };
    } catch (error) {
      const result = this.handleError(error);
      return { success: false, deleted: 0, failed: ids.length, error: result.error };
    } finally {
      this._isLoading.set(false);
    }
  }

  // ============================================================================
  // Lock Status
  // ============================================================================

  /**
   * Check if a package has a locked POD.
   *
   * @param packageId - Package UUID
   */
  async isPackageLocked(packageId: string): Promise<boolean> {
    try {
      const { data } = await this.supabaseService.client.rpc('is_pod_locked', {
        p_package_id: packageId,
      });

      return data === true;
    } catch {
      return false;
    }
  }

  /**
   * Get the lock status details for a package.
   *
   * @param packageId - Package UUID
   */
  async getPackageLockStatus(packageId: string): Promise<PackageLockStatus | null> {
    try {
      const { data, error } = await this.supabaseService.client.rpc('get_pod_lock_status', {
        p_package_id: packageId,
      });

      if (error || !data || data.length === 0) {
        return null;
      }

      const status = data[0];
      return {
        isLocked: status.is_locked,
        lockedAt: status.locked_at,
        podReference: status.pod_reference,
        pdfUrl: status.pdf_url,
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch the proof-of-delivery record for a package, including receiver
   * and witness identification fields and signature data URLs.
   *
   * @param packageId - Package UUID
   * @returns The POD record, or `null` if none exists / on error.
   */
  async getPodForPackage(packageId: string): Promise<PodRecord | null> {
    try {
      // Helpful debug: log current session user id so operators can correlate RLS behavior
      try {
        const { data: sessionData } = await this.supabaseService.client.auth.getSession();
        const uid = sessionData?.session?.user?.id ?? null;
        console.debug('[PackageService] getPodForPackage currentUserId=', uid);
      } catch (sErr) {
        // ignore session lookup errors — we only log for debugging
      }
      const { data, error } = await this.supabaseService.client
        .from('pods')
        .select(
          'id, package_id, pod_reference, is_locked, locked_at, ' +
          'receiver_name, receiver_employee_number, receiver_phone, receiver_signature, ' +
          'witness_name, witness_employee_number, witness_phone, witness_signature, ' +
          'completed_at, completed_by, staff_name, completion_status'
        )
        .eq('package_id', packageId)
        .maybeSingle();

      if (error) {
        console.error('[PackageService] getPodForPackage error:', error);
        return null;
      }

      if (!data) {
        // Could be: row genuinely missing OR RLS hides it. Log a hint so
        // operators can tell the difference from the browser console.
        console.warn(
          '[PackageService] No POD row visible for package',
          packageId,
          '— if you expected one to exist, check the SELECT RLS policies on `public.pods`.'
        );
        return null;
      }

      return data as unknown as PodRecord;
    } catch (err) {
      console.error('[PackageService] getPodForPackage threw:', err);
      return null;
    }
  }

  /**
   * Ensure a POD row exists for the given package. If a POD already exists
   * it is returned. Otherwise, attempt to create a minimal POD record using
   * package data and the current staff profile so client-side PDF generation
   * / downloads that expect a POD row will succeed.
   *
   * NOTE: This creates a minimal/stub POD (empty signatures) so it should be
   * used only for the purpose of allowing PDF generation/download. The
   * real POD with signatures should still be created via the normal
   * collection flow.
   */
  async ensurePodExists(packageId: string): Promise<PodRecord | null> {
    try {
      // If a POD is already visible, return it
      const existing = await this.getPodForPackage(packageId);
      if (existing) return existing;

      // Load the package to populate required fields
      const pkgRes = await this.getPackage(packageId);
      if (!pkgRes.success) {
        console.warn('[PackageService] ensurePodExists: failed to load package', packageId, pkgRes.error);
        return null;
      }
      const pkg = pkgRes.data;

      // Ensure we have a staff profile for the current user
      let staff = this.staffService.currentProfile();
      if (!staff) {
        staff = await this.staffService.loadCurrentProfile();
      }
      if (!staff) {
        console.warn('[PackageService] ensurePodExists: no staff profile available for current user; cannot create POD row');
        return null;
      }

      // Create a minimal POD row. Several columns are NOT NULL in the schema
      // so we provide defaults where appropriate (empty strings for signature
      // URLs/paths, signed_at/completed_at = now). This is a pragmatic stub
      // to allow downstream PDF generation; the final POD should include
      // real signature data later when saved through the normal flow.
      const insertData: Record<string, unknown> = {
        package_id: packageId,
        package_reference: pkg.reference,
        receiver_email: pkg.receiver_email ?? '',
        staff_id: staff.id,
        staff_name: staff.full_name ?? staff.user_id ?? '',
        staff_email: staff.email ?? '',
        signature_url: '',
        signature_path: '',
        signed_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        is_locked: false,
        // A "delivery photo" in the notes is only ever attached by a driver
        // completing a delivery, so its presence forces the status to
        // 'Delivered'. Otherwise derive it from the staff role.
        completion_status: /delivery photo/i.test(pkg.notes ?? '')
          ? 'Delivered'
          : staff.role === 'driver'
            ? 'Delivered'
            : 'Collected',
        // Package rows do not include receiver_name in the canonical model;
        // leave receiver_name null here (the POD modal flow will populate it
        // when a real signature/collector is recorded).
        receiver_name: null,
      };

      const { data, error } = await this.supabaseService.client
        .from('pods')
        .insert(insertData)
        .select(
          'id, package_id, pod_reference, is_locked, locked_at, receiver_name, receiver_employee_number, receiver_phone, receiver_signature, witness_name, witness_employee_number, witness_phone, witness_signature, completed_at, completed_by, pdf_url, staff_name, completion_status'
        )
        .maybeSingle();

      if (error) {
        console.error('[PackageService] ensurePodExists: insert error', error);
        return null;
      }

      if (!data) {
        console.warn('[PackageService] ensurePodExists: insert returned no data for package', packageId);
        return null;
      }

      return data as PodRecord;
    } catch (err) {
      console.error('[PackageService] ensurePodExists threw:', err);
      return null;
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  /**
   * Clear the error state.
   */
  clearError(): void {
    this._error.set(null);
  }

  /**
   * Clear the packages list.
   */
  clearPackages(): void {
    this._packages.set([]);
    this._totalCount.set(null);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Retrieves the current user's access token.
   */
  private async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabaseService.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /**
   * Refreshes and retrieves a new access token.
   * Used for operations that require a fresh token.
   */
  private async getRefreshedAccessToken(): Promise<string | null> {
    const { data, error } = await this.supabaseService.client.auth.refreshSession();

    if (error) {
      console.warn('[PackageService] Session refresh failed:', error.message);
      // Fall back to current session
      return this.getAccessToken();
    }

    return data.session?.access_token ?? null;
  }

  /**
   * Makes an authenticated call to a Supabase Edge Function.
   */
  private async callEdgeFunction<T>(
    functionName: string,
    accessToken: string,
    payload: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/${functionName}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        apikey: this.apiKey,
      },
      body: JSON.stringify(payload),
    });

    // Handle non-JSON responses gracefully
    const text = await response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      console.error('[PackageService] Failed to parse response:', text);
      throw new Error(text || 'Invalid response from server');
    }
  }

  /**
   * Updates a package in the local packages list.
   */
  private updatePackageInList(id: string, updatedPackage: Package): void {
    this._packages.update(packages =>
      packages.map(p => (p.id === id ? updatedPackage : p))
    );
  }

  /**
   * Creates a success result.
   */
  private successResult<T>(data: T): { success: true; data: T } {
    return { success: true, data };
  }

  /**
   * Creates an error result.
   */
  private errorResult(error: string): { success: false; error: string } {
    return { success: false, error };
  }

  /**
   * Handles and logs errors, returning an error result.
   */
  private handleError(error: unknown): { success: false; error: string } {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[PackageService] Error:', error);
    this._error.set(message);
    return this.errorResult(message);
  }
}

