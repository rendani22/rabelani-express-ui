import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User, AuthError } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';

export interface AuthResponse {
  success: boolean;
  error?: string;
  user?: User | null;
}

@Injectable({
  providedIn: 'root',
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private router = inject(Router);

  currentUser = signal<User | null>(null);
  isAuthenticated = signal(false);
  isInitialized = signal(false);
  isLoading = signal(false);

  constructor() {
    this.supabase = createClient(environment.supabase.url, environment.supabase.anonKey);

    // Listen to auth state changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.currentUser.set(session?.user ?? null);
      this.isAuthenticated.set(!!session?.user);
    });

    // Check initial session
    this.loadUser();
  }

  private async loadUser(): Promise<void> {
    const {
      data: { session },
    } = await this.supabase.auth.getSession();
    this.currentUser.set(session?.user ?? null);
    this.isAuthenticated.set(!!session?.user);
    this.isInitialized.set(true);
  }

  async signIn(email: string, password: string): Promise<AuthResponse> {
    this.isLoading.set(true);
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return { success: false, error: this.getErrorMessage(error) };
      }

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred. Please try again.' };
    } finally {
      this.isLoading.set(false);
    }
  }

  async signUp(email: string, password: string): Promise<AuthResponse> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        return { success: false, error: this.getErrorMessage(error) };
      }

      return { success: true, user: data.user };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred. Please try again.' };
    }
  }

  async signOut(): Promise<AuthResponse> {
    try {
      const { error } = await this.supabase.auth.signOut();

      if (error) {
        return { success: false, error: this.getErrorMessage(error) };
      }

      this.router.navigate(['/login']);
      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred. Please try again.' };
    }
  }

  async resetPassword(email: string): Promise<AuthResponse> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        return { success: false, error: this.getErrorMessage(error) };
      }

      return { success: true };
    } catch (error) {
      return { success: false, error: 'An unexpected error occurred. Please try again.' };
    }
  }

  private getErrorMessage(error: AuthError): string {
    // Map Supabase error codes to user-friendly messages
    switch (error.message) {
      case 'Invalid login credentials':
        return 'Invalid email or password. Please try again.';
      case 'Email not confirmed':
        return 'Please confirm your email address before logging in.';
      case 'User already registered':
        return 'An account with this email already exists.';
      case 'Password should be at least 6 characters':
        return 'Password must be at least 6 characters long.';
      default:
        return error.message || 'An error occurred. Please try again.';
    }
  }

  // Expose the Supabase client for advanced usage
  get client(): SupabaseClient {
    return this.supabase;
  }
}
