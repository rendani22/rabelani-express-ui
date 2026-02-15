import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import { environment } from '../../../environments/environment';
import {
  Package,
  PackageFilters,
  PackageLockStatus,
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
  private readonly baseUrl = environment.supabase.functionsUrl;
  private readonly apiKey = environment.supabase.anonKey;

  // ============================================================================
  // State Signals
  // ============================================================================

  /** List of loaded packages */
  private readonly _packages = signal<readonly Package[]>([]);
  readonly packages = this._packages.asReadonly();

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
   */
  async loadPackages(filters?: PackageFilters): Promise<GetPackagesResult> {
    this._isLoading.set(true);
    this._error.set(null);

    try {
      let query = this.supabaseService.client
        .from('packages')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.search) {
        query = query.or(
          `reference.ilike.%${filters.search}%,receiver_email.ilike.%${filters.search}%`
        );
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;

      if (error) {
        this._error.set(error.message);
        return { success: false, error: error.message };
      }

      const packages = (data ?? []) as Package[];
      this._packages.set(packages);
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
        .select('*, items:package_items(id, quantity, description)')
        .eq('id', id)
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
        .select('*, items:package_items(id, quantity, description)')
        .eq('reference', reference.toUpperCase())
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

