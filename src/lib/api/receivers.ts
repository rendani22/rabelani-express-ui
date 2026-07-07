import { supabase } from '@/lib/supabase'

// ============================================================================
// Types (ported from core/models/receiver-profile.model.ts + receiver-contact.model.ts)
// ============================================================================

/** Receiver profile entity from the `receiver_profiles` table. */
export interface ReceiverProfile {
  id: string
  name: string
  surname: string
  email: string
  phone?: string
  is_active: boolean
  created_at: string
  updated_at: string
  created_by?: string
}

/** DTO for creating a new receiver profile. */
export interface CreateReceiverProfileDto {
  name: string
  surname: string
  email: string
  phone?: string
}

/** DTO for updating an existing receiver profile. */
export interface UpdateReceiverProfileDto {
  name?: string
  surname?: string
  email?: string
  phone?: string
  is_active?: boolean
}

/** Alternative contact person attached to a receiver (`receiver_contacts` table). */
export interface ReceiverContact {
  id: string
  receiver_id: string
  name: string
  phone: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Load all receiver profiles (active and inactive), newest first.
 * Ported from `ReceiverService.loadAllReceivers()`.
 *
 * Note: the Angular query is a plain `select('*')` — there is NO join to
 * `receiver_contacts`; contacts are fetched separately via
 * `listReceiverContacts(receiverId)`.
 */
export async function listReceivers(): Promise<ReceiverProfile[]> {
  const { data, error } = await supabase
    .from('receiver_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as ReceiverProfile[]
}

/** Active receiver profiles only. Applies the `is_active` filter to `listReceivers()`. */
export async function listActiveReceivers(): Promise<ReceiverProfile[]> {
  const all = await listReceivers()
  return all.filter((r) => r.is_active)
}

/**
 * Load all alternative contacts for a given receiver, oldest first.
 * Ported from `ReceiverService.loadContacts(receiverId)`.
 */
export async function listReceiverContacts(receiverId: string): Promise<ReceiverContact[]> {
  const { data, error } = await supabase
    .from('receiver_contacts')
    .select('*')
    .eq('receiver_id', receiverId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as ReceiverContact[]
}

// ============================================================================
// Receiver contact DTOs (ported from core/models/receiver-contact.model.ts)
// ============================================================================

/** DTO for creating a new alternative contact (`receiver_contacts` table). */
export interface CreateReceiverContactDto {
  receiver_id: string
  name: string
  phone: string
}

/** DTO for updating an existing alternative contact. */
export interface UpdateReceiverContactDto {
  name?: string
  phone?: string
}

// ============================================================================
// Receiver profile mutations (ported from ReceiverService)
// ============================================================================

/**
 * Create a new receiver profile. Ported from `ReceiverService.createReceiver(dto)`.
 * Inserts into `receiver_profiles` and returns the created row.
 */
export async function createReceiver(dto: CreateReceiverProfileDto): Promise<ReceiverProfile> {
  const { data, error } = await supabase
    .from('receiver_profiles')
    .insert(dto)
    .select()
    .single()

  if (error) throw error
  return data as ReceiverProfile
}

/**
 * Update an existing receiver profile. Ported from `ReceiverService.updateReceiver(id, dto)`.
 * Updates the matching `receiver_profiles` row and returns it.
 */
export async function updateReceiver(id: string, dto: UpdateReceiverProfileDto): Promise<ReceiverProfile> {
  const { data, error } = await supabase
    .from('receiver_profiles')
    .update(dto)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as ReceiverProfile
}

/**
 * Deactivate a receiver profile (soft delete). Ported from
 * `ReceiverService.deactivateReceiver(id)` — sets `is_active: false`.
 */
export async function deactivateReceiver(id: string): Promise<ReceiverProfile> {
  return updateReceiver(id, { is_active: false })
}

/**
 * Reactivate a receiver profile. Ported from `ReceiverService.reactivateReceiver(id)`
 * — sets `is_active: true`.
 */
export async function reactivateReceiver(id: string): Promise<ReceiverProfile> {
  return updateReceiver(id, { is_active: true })
}

/** Fetch a single receiver profile by ID. Ported from `ReceiverService.getReceiverById(id)`. */
export async function getReceiverById(id: string): Promise<ReceiverProfile> {
  const { data, error } = await supabase
    .from('receiver_profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as ReceiverProfile
}

// ============================================================================
// Receiver contact mutations (ported from ReceiverService)
// ============================================================================

/**
 * Add a new alternative contact for a receiver. Ported from
 * `ReceiverService.addContact(dto)`. Inserts into `receiver_contacts`.
 */
export async function createReceiverContact(dto: CreateReceiverContactDto): Promise<ReceiverContact> {
  const { data, error } = await supabase
    .from('receiver_contacts')
    .insert(dto)
    .select()
    .single()

  if (error) throw error
  return data as ReceiverContact
}

/**
 * Update an existing alternative contact. Ported from
 * `ReceiverService.updateContact(id, dto)`.
 */
export async function updateReceiverContact(id: string, dto: UpdateReceiverContactDto): Promise<ReceiverContact> {
  const { data, error } = await supabase
    .from('receiver_contacts')
    .update(dto)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as ReceiverContact
}

/**
 * Delete an alternative contact. Ported from `ReceiverService.deleteContact(id)`.
 */
export async function deleteReceiverContact(id: string): Promise<void> {
  const { error } = await supabase
    .from('receiver_contacts')
    .delete()
    .eq('id', id)

  if (error) throw error
}
