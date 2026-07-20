import { supabase } from '@/lib/supabase'

// ============================================================================
// Types (ported from core/models/delivery-location.models.ts)
// ============================================================================

/**
 * Delivery point entity matching the `delivery_locations` table schema.
 * (Table is still named `delivery_locations`; the domain concept is a
 * "Delivery Point".)
 */
export interface DeliveryLocation {
  id: string
  name: string
  description?: string
  address?: string
  notes?: string
  latitude?: number
  longitude?: number
  is_active: boolean
  created_at: string
  updated_at?: string
}

/** DTO for creating a new delivery point. */
export interface CreateDeliveryLocationDto {
  name: string
  description?: string
  address?: string
  notes?: string
  latitude?: number
  longitude?: number
}

/** DTO for updating an existing delivery point. */
export interface UpdateDeliveryLocationDto {
  name?: string
  description?: string
  address?: string
  notes?: string
  latitude?: number
  longitude?: number
  is_active?: boolean
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Load all delivery locations, ordered by name.
 * Ported from `DeliveryLocationService.loadLocations()`.
 */
export async function listDeliveryLocations(): Promise<DeliveryLocation[]> {
  const { data, error } = await supabase
    .from('delivery_locations')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  return (data ?? []) as DeliveryLocation[]
}

/** Active delivery locations only. Applies the `is_active` filter to `listDeliveryLocations()`. */
export async function listActiveDeliveryLocations(): Promise<DeliveryLocation[]> {
  const all = await listDeliveryLocations()
  return all.filter((l) => l.is_active)
}

// ============================================================================
// Mutations (ported from DeliveryLocationService CRUD)
// ============================================================================

/** Create a new delivery location. Returns the inserted row. */
export async function createDeliveryLocation(
  dto: CreateDeliveryLocationDto,
): Promise<DeliveryLocation> {
  const { data, error } = await supabase
    .from('delivery_locations')
    .insert(dto)
    .select()
    .single()

  if (error) throw error
  return data as DeliveryLocation
}

/** Update an existing delivery location by id. Returns the updated row. */
export async function updateDeliveryLocation(
  id: string,
  dto: UpdateDeliveryLocationDto,
): Promise<DeliveryLocation> {
  const { data, error } = await supabase
    .from('delivery_locations')
    .update(dto)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as DeliveryLocation
}

/** Deactivate a delivery location (soft-delete via `is_active = false`). */
export async function deactivateDeliveryLocation(id: string): Promise<DeliveryLocation> {
  return updateDeliveryLocation(id, { is_active: false })
}

/** Reactivate a delivery location (`is_active = true`). */
export async function reactivateDeliveryLocation(id: string): Promise<DeliveryLocation> {
  return updateDeliveryLocation(id, { is_active: true })
}

/** Permanently delete a delivery location by id. */
export async function deleteDeliveryLocation(id: string): Promise<void> {
  const { error } = await supabase.from('delivery_locations').delete().eq('id', id)
  if (error) throw error
}
