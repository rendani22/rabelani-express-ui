import { Injectable, inject, signal, computed, effect } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { SupabaseService } from '../../shared/services/supabase.service';
import {
  StaffProfile,
  StaffRole,
  CreateStaffProfileDto,
  UpdateStaffProfileDto
} from '../models/staff-profile.model';

export interface StaffOperationResult {
  readonly profile: StaffProfile | null;
  readonly error: string | null;
}

export interface StaffActionResult {
  readonly success: boolean;
  readonly error: string | null;
}

/**
 * StaffService handles staff profile CRUD operations.
 *
 * Key features:
 * - Fetches current user's profile on init
 * - Admin-only create/update/delete operations
 * - Role-based access checks
 * - Uses Angular signals for reactive state management
 */
@Injectable({
  providedIn: 'root'
})
export class StaffService {
  private readonly supabaseService = inject(SupabaseService);

  /** Current user's staff profile */
  readonly currentProfile = signal<StaffProfile | null>(null);

  /** List of all staff profiles (for admin view) */
  readonly staffList = signal<StaffProfile[]>([]);

  /** Loading state */
  readonly loading = signal<boolean>(false);

  /** Error state */
  readonly error = signal<string | null>(null);

  /** Check if current user has admin role */
  readonly isAdmin = computed(() => this.currentProfile()?.role === 'admin');

  /** Observable version of currentProfile for compatibility */
  readonly currentProfile$ = toObservable(this.currentProfile);

  /** Observable version of staffList for compatibility */
  readonly staffList$ = toObservable(this.staffList);

  /** Observable version of loading for compatibility */
  readonly loading$ = toObservable(this.loading);

  /** Observable version of error for compatibility */
  readonly error$ = toObservable(this.error);

  constructor() {
    // Load current user's profile when auth state changes
    effect(() => {
      const user = this.supabaseService.currentUser();
      const isInitialized = this.supabaseService.isInitialized();

      if (user && isInitialized) {
        this.loadCurrentProfile();
      } else if (!user) {
        this.currentProfile.set(null);
      }
    });
  }

  /**
   * Check if current user has a specific role.
   */
  hasRole(role: StaffRole): boolean {
    return this.currentProfile()?.role === role;
  }

  /**
   * Load the current authenticated user's staff profile.
   */
  async loadCurrentProfile(): Promise<StaffProfile | null> {
    const user = this.supabaseService.currentUser();
    if (!user) return null;

    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) {
        // Profile might not exist yet for new users (PGRST116 = no rows returned)
        if (error.code === 'PGRST116') {
          this.currentProfile.set(null);
          return null;
        }
        this.error.set(error.message);
        return null;
      }

      this.currentProfile.set(data as StaffProfile);
      return data as StaffProfile;
    } catch (err) {
      this.error.set('An unexpected error occurred while loading profile.');
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load all staff profiles (admin only via RLS).
   */
  async loadAllStaff(): Promise<StaffProfile[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        this.error.set(error.message);
        return [];
      }

      this.staffList.set(data as StaffProfile[]);
      return data as StaffProfile[];
    } catch (err) {
      this.error.set('An unexpected error occurred while loading staff list.');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Create a new staff profile with auth user.
   * Admin only - creates both auth user and profile.
   *
   * Note: In production, this should be done via an Edge Function
   * to properly create the auth user with admin privileges.
   */
  async createStaff(dto: CreateStaffProfileDto): Promise<StaffOperationResult> {
    if (!this.isAdmin()) {
      return { profile: null, error: 'Only admins can create staff profiles' };
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      // Call Edge Function to create user and profile
      const { data, error } = await this.supabaseService.client.functions.invoke('create-staff', {
        body: dto
      });

      if (error) {
        this.error.set(error.message);
        return { profile: null, error: error.message };
      }

      if (data?.error) {
        this.error.set(data.error);
        return { profile: null, error: data.error };
      }

      // Refresh staff list
      await this.loadAllStaff();

      return { profile: data.profile as StaffProfile, error: null };
    } catch (err) {
      const errorMessage = 'An unexpected error occurred while creating staff.';
      this.error.set(errorMessage);
      return { profile: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing staff profile.
   * Admin only via RLS.
   */
  async updateStaff(id: string, dto: UpdateStaffProfileDto): Promise<StaffOperationResult> {
    if (!this.isAdmin()) {
      return { profile: null, error: 'Only admins can update staff profiles' };
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { profile: null, error: error.message };
      }

      // Refresh staff list
      await this.loadAllStaff();

      return { profile: data as StaffProfile, error: null };
    } catch (err) {
      const errorMessage = 'An unexpected error occurred while updating staff.';
      this.error.set(errorMessage);
      return { profile: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deactivate a staff profile (soft delete).
   * Admin only via RLS.
   */
  async deactivateStaff(id: string): Promise<StaffActionResult> {
    const result = await this.updateStaff(id, { is_active: false });
    return { success: result.profile !== null, error: result.error };
  }

  /**
   * Reactivate a staff profile.
   * Admin only via RLS.
   */
  async reactivateStaff(id: string): Promise<StaffActionResult> {
    const result = await this.updateStaff(id, { is_active: true });
    return { success: result.profile !== null, error: result.error };
  }

  /**
   * Get a single staff profile by ID.
   */
  async getStaffById(id: string): Promise<StaffOperationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        this.error.set(error.message);
        return { profile: null, error: error.message };
      }

      return { profile: data as StaffProfile, error: null };
    } catch (err) {
      const errorMessage = 'An unexpected error occurred while fetching staff profile.';
      this.error.set(errorMessage);
      return { profile: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }
}

