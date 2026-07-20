import { supabase } from '@/lib/supabase'

/** The DB `staff_role` enum — these are the ONLY valid values. */
// Every value the DB `staff_role` enum can hold after all migrations (base
// admin/warehouse/driver/collection + the manager/staff/viewer added later).
// The Users dialog only *offers* a subset; this type must still represent any
// stored value so existing rows read cleanly.
export type StaffRole = 'admin' | 'warehouse' | 'manager' | 'driver' | 'staff' | 'viewer' | 'collection'

export interface StaffProfile {
  id: string
  user_id: string
  email: string
  name?: string | null
  surname?: string | null
  role: StaffRole
}

/** The staff_profiles row for the currently authenticated user, or null. */
export async function getCurrentStaffProfile(): Promise<StaffProfile | null> {
  const { data: auth } = await supabase.auth.getUser()
  const userId = auth.user?.id
  if (!userId) return null
  const { data } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('user_id', userId)
    .single()
  return (data as StaffProfile) ?? null
}

/** True when the current user's staff role is 'admin'. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  const profile = await getCurrentStaffProfile()
  return profile?.role === 'admin'
}

/**
 * Resolve display names for a set of staff `user_id`s. Used by the inventory
 * movements view to label who made each change. Returns `{}` if RLS blocks the
 * read; callers fall back to placeholders. Ported from `StaffService.getStaffByIds`.
 */
export async function getStaffNamesByIds(userIds: string[]): Promise<Record<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))]
  if (!ids.length) return {}
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('user_id, full_name, email')
    .in('user_id', ids)
  if (error || !data) return {}
  const map: Record<string, string> = {}
  for (const row of data as Array<{ user_id: string; full_name?: string | null; email?: string | null }>) {
    map[row.user_id] = row.full_name?.trim() || row.email?.trim() || `Staff (${row.user_id.slice(0, 8)})`
  }
  return map
}

// ============================================================================
// Staff CRUD DTOs (ported from core/models/staff-profile.model.ts)
// ============================================================================

/**
 * DTO for creating a new staff profile. Ported from `CreateStaffProfileDto`.
 * Consumed by the `create-staff` Edge Function (creates auth user + profile).
 */
export interface CreateStaffProfileDto {
  email: string
  password: string
  full_name: string
  role: StaffRole
  phone?: string
  department?: string
  avatar_url?: string
}

/** DTO for updating an existing staff profile. Ported from `UpdateStaffProfileDto`. */
export interface UpdateStaffProfileDto {
  full_name?: string
  role?: StaffRole
  is_active?: boolean
  phone?: string
  department?: string
  avatar_url?: string
}

// ============================================================================
// Staff mutations (ported from StaffService)
// ============================================================================

/**
 * Create a new staff profile. Ported from `StaffService.createStaff(dto)`.
 * Invokes the `create-staff` Supabase Edge Function, which creates both the
 * auth user and the profile. Returns the created profile.
 *
 * Note: the admin gate (`isAdmin()`) in the Angular service is enforced at the
 * UI/RLS layer here; this function ports the Supabase call only.
 */
export async function createStaff(dto: CreateStaffProfileDto): Promise<StaffProfile> {
  const { data, error } = await supabase.functions.invoke('create-staff', {
    body: dto,
  })

  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.profile as StaffProfile
}

/**
 * Update an existing staff profile. Ported from `StaffService.updateStaff(id, dto)`.
 * Updates the matching `staff_profiles` row (admin-only via RLS) and returns it.
 */
export async function updateStaff(id: string, dto: UpdateStaffProfileDto): Promise<StaffProfile> {
  const { data, error } = await supabase
    .from('staff_profiles')
    .update(dto)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as StaffProfile
}

/**
 * Deactivate a staff profile (soft delete). Ported from
 * `StaffService.deactivateStaff(id)` — sets `is_active: false`.
 */
export async function deactivateStaff(id: string): Promise<StaffProfile> {
  return updateStaff(id, { is_active: false })
}

/**
 * Reactivate a staff profile. Ported from `StaffService.reactivateStaff(id)`
 * — sets `is_active: true`.
 */
export async function reactivateStaff(id: string): Promise<StaffProfile> {
  return updateStaff(id, { is_active: true })
}
