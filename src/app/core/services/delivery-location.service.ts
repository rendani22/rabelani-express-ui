import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import {
  DeliveryLocation,
  CreateDeliveryLocationDto,
  UpdateDeliveryLocationDto,
} from '../models/delivery-location.models';

export interface DeliveryLocationResult {
  readonly location: DeliveryLocation | null;
  readonly error: string | null;
}

export interface DeliveryLocationActionResult {
  readonly success: boolean;
  readonly error: string | null;
}

/**
 * Service for managing delivery location CRUD operations.
 */
@Injectable({
  providedIn: 'root',
})
export class DeliveryLocationService {
  private readonly supabaseService = inject(SupabaseService);

  readonly locations = signal<DeliveryLocation[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Load all delivery locations.
   */
  async loadLocations(): Promise<DeliveryLocation[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('delivery_locations')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        this.error.set(error.message);
        return [];
      }

      this.locations.set((data ?? []) as DeliveryLocation[]);
      return (data ?? []) as DeliveryLocation[];
    } catch {
      this.error.set('An unexpected error occurred while loading delivery locations.');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Create a new delivery location.
   */
  async createLocation(dto: CreateDeliveryLocationDto): Promise<DeliveryLocationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('delivery_locations')
        .insert(dto)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { location: null, error: error.message };
      }

      await this.loadLocations();
      return { location: data as DeliveryLocation, error: null };
    } catch {
      const msg = 'An unexpected error occurred while creating the delivery location.';
      this.error.set(msg);
      return { location: null, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update an existing delivery location.
   */
  async updateLocation(id: string, dto: UpdateDeliveryLocationDto): Promise<DeliveryLocationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('delivery_locations')
        .update(dto)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        this.error.set(error.message);
        return { location: null, error: error.message };
      }

      await this.loadLocations();
      return { location: data as DeliveryLocation, error: null };
    } catch {
      const msg = 'An unexpected error occurred while updating the delivery location.';
      this.error.set(msg);
      return { location: null, error: msg };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Deactivate a delivery location.
   */
  async deactivateLocation(id: string): Promise<DeliveryLocationActionResult> {
    const result = await this.updateLocation(id, { is_active: false });
    return { success: result.location !== null, error: result.error };
  }

  /**
   * Reactivate a delivery location.
   */
  async reactivateLocation(id: string): Promise<DeliveryLocationActionResult> {
    const result = await this.updateLocation(id, { is_active: true });
    return { success: result.location !== null, error: result.error };
  }

  /**
   * Delete a delivery location permanently.
   */
  async deleteLocation(id: string): Promise<DeliveryLocationActionResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { error } = await this.supabaseService.client
        .from('delivery_locations')
        .delete()
        .eq('id', id);

      if (error) {
        this.error.set(error.message);
        return { success: false, error: error.message };
      }

      await this.loadLocations();
      return { success: true, error: null };
    } catch {
      const msg = 'An unexpected error occurred while deleting the delivery location.';
      this.error.set(msg);
      return { success: false, error: msg };
    } finally {
      this.loading.set(false);
    }
  }
}
