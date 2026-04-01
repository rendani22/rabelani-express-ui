import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import {
  ReceiverProfile,
  CreateReceiverProfileDto,
  UpdateReceiverProfileDto
} from '../models/receiver-profile.model';

export interface ReceiverOperationResult {
  readonly profile: ReceiverProfile | null;
  readonly error: string | null;
}

export interface ReceiverActionResult {
  readonly success: boolean;
  readonly error: string | null;
}

/**
 * ReceiverService handles CRUD operations for receiver profiles.
 *
 * Key features:
 * - Load and manage the list of receiver profiles
 * - Create, update, deactivate, and reactivate receiver profiles
 * - Uses Angular signals for reactive state management
 */
@Injectable({
  providedIn: 'root'
})
export class ReceiverService {
  private readonly supabaseService = inject(SupabaseService);

  /** List of all receiver profiles */
  readonly receiverList = signal<ReceiverProfile[]>([]);

  /** Loading state */
  readonly loading = signal<boolean>(false);

  /** Error state */
  readonly error = signal<string | null>(null);

  /**
   * Load all receiver profiles.
   */
  async loadAllReceivers(): Promise<ReceiverProfile[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('receiver_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        this.error.set(error.message);
        return [];
      }

      this.receiverList.set(data as ReceiverProfile[]);
      return data as ReceiverProfile[];
    } catch {
      this.error.set('An unexpected error occurred while loading receivers.');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Create a new receiver profile.
   */
  async createReceiver(dto: CreateReceiverProfileDto): Promise<ReceiverOperationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('receiver_profiles')
        .insert(dto)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { profile: null, error: error.message };
      }

      await this.loadAllReceivers();
      return { profile: data as ReceiverProfile, error: null };
    } catch {
      const errorMessage = 'An unexpected error occurred while creating receiver.';
      this.error.set(errorMessage);
      return { profile: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing receiver profile.
   */
  async updateReceiver(id: string, dto: UpdateReceiverProfileDto): Promise<ReceiverOperationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('receiver_profiles')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { profile: null, error: error.message };
      }

      await this.loadAllReceivers();
      return { profile: data as ReceiverProfile, error: null };
    } catch {
      const errorMessage = 'An unexpected error occurred while updating receiver.';
      this.error.set(errorMessage);
      return { profile: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deactivate a receiver profile (soft delete).
   */
  async deactivateReceiver(id: string): Promise<ReceiverActionResult> {
    const result = await this.updateReceiver(id, { is_active: false });
    return { success: result.profile !== null, error: result.error };
  }

  /**
   * Reactivate a receiver profile.
   */
  async reactivateReceiver(id: string): Promise<ReceiverActionResult> {
    const result = await this.updateReceiver(id, { is_active: true });
    return { success: result.profile !== null, error: result.error };
  }

  /**
   * Get a single receiver profile by ID.
   */
  async getReceiverById(id: string): Promise<ReceiverOperationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('receiver_profiles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        this.error.set(error.message);
        return { profile: null, error: error.message };
      }

      return { profile: data as ReceiverProfile, error: null };
    } catch {
      const errorMessage = 'An unexpected error occurred while fetching receiver profile.';
      this.error.set(errorMessage);
      return { profile: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }
}
