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

  /** Current authenticated user */
  readonly currentUser = this.supabaseService.currentUser;

  /** Whether an auth operation is in progress */
  readonly isLoading = this.supabaseService.isLoading;

  /**
   * Attempt to sign in with email and password
   */
  async signIn(credentials: LoginCredentials): Promise<AuthResult> {
    const response = await this.supabaseService.signIn(
      credentials.email,
      credentials.password
    );

    return {
      success: response.success,
      error: response.error,
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
  async navigateAfterLogin(destination = '/'): Promise<void> {
    await this.router.navigate([destination]);
  }

  /**
   * Navigate to login page
   */
  async navigateToLogin(): Promise<void> {
    await this.router.navigate(['/login']);
  }
}

