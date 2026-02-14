import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import { environment } from '../../../environments/environment';
import {
  CreatePackageRequest,
  CreatePackageApiResponse,
  CreatePackageResult,
  CreatePackageSuccessResponse,
  isCreatePackageSuccess,
  isCreatePackageError,
} from '../models/package.models';

/** Edge function endpoints */
const EDGE_FUNCTIONS = {
  CREATE_PACKAGE: 'create-package',
} as const;

/**
 * Service for managing package operations via Supabase Edge Functions.
 * Handles authentication, API calls, and error handling.
 */
@Injectable({
  providedIn: 'root',
})
export class PackageService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly baseUrl = environment.supabase.functionsUrl;
  private readonly apiKey = environment.supabase.anonKey;

  /** Loading state for async operations */
  private readonly _isLoading = signal(false);
  readonly isLoading = this._isLoading.asReadonly();

  /** Computed property indicating if service is ready for operations */
  readonly isReady = computed(() => this.supabaseService.isAuthenticated());

  /**
   * Creates a new package by calling the Supabase Edge Function.
   * Requires authenticated user with warehouse or admin role.
   *
   * @param request - The package creation request payload
   * @returns Promise with success/error result
   */
  async createPackage(request: CreatePackageRequest): Promise<CreatePackageResult> {
    this._isLoading.set(true);

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
        return this.successResult(response);
      }

      if (isCreatePackageError(response)) {
        return this.errorResult(response.details ?? response.error);
      }

      return this.errorResult('Unexpected response format');
    } catch (error) {
      return this.handleError(error);
    } finally {
      this._isLoading.set(false);
    }
  }

  /**
   * Retrieves the current user's access token
   */
  private async getAccessToken(): Promise<string | null> {
    const { data } = await this.supabaseService.client.auth.getSession();
    return data.session?.access_token ?? null;
  }

  /**
   * Makes an authenticated call to a Supabase Edge Function
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

    const data: unknown = await response.json();

    // For non-OK responses, we still return the parsed data
    // as it may contain error details from the Edge Function
    return data as T;
  }

  /**
   * Creates a success result
   */
  private successResult(data: CreatePackageSuccessResponse): CreatePackageResult {
    return { success: true, data };
  }

  /**
   * Creates an error result
   */
  private errorResult(error: string): CreatePackageResult {
    return { success: false, error };
  }

  /**
   * Handles and logs errors, returning an error result
   */
  private handleError(error: unknown): CreatePackageResult {
    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    console.error('[PackageService] Error:', error);
    return this.errorResult(message);
  }
}

