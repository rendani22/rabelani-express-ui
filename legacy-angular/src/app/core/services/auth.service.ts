import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthResult, LoginCredentials } from '../models/auth.models';
import { SupabaseService } from '../../shared/services/supabase.service';

/**
 * Service responsible for authentication operations
 * Acts as a facade over the Supabase auth provider
 */
@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly router = inject(Router);
  private readonly supabaseService = inject(SupabaseService);

  /** Whether a user is currently authenticated (delegates to SupabaseService) */
  readonly isAuthenticated = this.supabaseService.isAuthenticated;

  /** Whether the auth service has initialized (checked session) */
  readonly isInitialized = this.supabaseService.isInitialized;

  /** Current authenticated user */
  readonly currentUser = this.supabaseService.currentUser;

  /** Whether an auth operation is in progress */
  readonly isLoading = this.supabaseService.isLoading;

  /**
   * Attempt to sign in with email and password.
   *
   * Drivers are not allowed to sign into the dashboard. If the authenticated
   * user has the `driver` role, they are immediately signed out and an error
   * is returned.
   */
  async signIn(credentials: LoginCredentials): Promise<AuthResult> {
    const response = await this.supabaseService.signIn(
      credentials.email,
      credentials.password
    );

    if (!response.success) {
      return {
        success: response.success,
        error: response.error,
      };
    }

    // Block driver-role users from accessing the dashboard.
    const userId = response.user?.id;
    if (userId) {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (!error && data?.role === 'driver') {
        await this.supabaseService.signOut();
        return {
          success: false,
          error:
            'Drivers are not permitted to sign in here. Please use the driver app.',
        };
      }
    }

    return {
      success: true,
    };
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<AuthResult> {
    const response = await this.supabaseService.signOut();
    return {
      success: response.success,
      error: response.error,
    };
  }

  /**
   * Request password reset email
   */
  async resetPassword(email: string): Promise<AuthResult> {
    const response = await this.supabaseService.resetPassword(email);
    return {
      success: response.success,
      error: response.error,
    };
  }

  /**
   * Navigate to the post-login destination
   */
  async navigateAfterLogin(destination = '/dashboard'): Promise<void> {
    await this.router.navigate([destination]);
  }

  /**
   * Navigate to login page
   */
  async navigateToLogin(): Promise<void> {
    await this.router.navigate(['/login']);
  }
}

