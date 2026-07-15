import { supabase } from '@/lib/supabase'
import type { StaffRole } from '@/lib/api/staff'

/**
 * The permission catalog, mirroring the `permissions` table seeded in
 * 20260714200000_phase1_policy_schema.sql. Kept as a literal union so a typo in
 * a `can(...)` call is a compile error rather than a silent `false`.
 *
 * Adding a permission means: seed row (migration) + key here + a check somewhere.
 */
export const PERMISSION_KEYS = [
  'orders.read',
  'orders.create',
  'orders.update',
  'orders.delete',
  'orders.restore',
  'orders.delete_hard',
  'orders.export',
  'orders.audit.view',
  'pod.view',
  'pod.export_bulk',
  'inventory.read',
  'inventory.create',
  'inventory.update',
  'inventory.delete',
  'inventory.restock',
  'inventory.export',
  'purchase_orders.read',
  'purchase_orders.create',
  'purchase_orders.update',
  'customers.read',
  'customers.create',
  'customers.update',
  'customers.deactivate',
  'customers.invite',
  'companies.create',
  'companies.delete',
  'locations.read',
  'locations.create',
  'locations.update',
  'locations.delete',
  'drivers.read',
  'drivers.track',
  'users.read',
  'users.manage',
  'email_templates.read',
  'email_templates.edit',
  'email.send_test',
  'dashboard.ops.view',
  'dashboard.exec.view',
  'sla.export',
  'policies.manage',
] as const

export type PermissionKey = (typeof PERMISSION_KEYS)[number]

export interface Permission {
  key: PermissionKey
  feature: string
  label: string
  description: string | null
  is_sensitive: boolean
  sort_order: number
}

export interface RolePermission {
  role: StaffRole
  permission_key: PermissionKey
}

export type OverrideEffect = 'grant' | 'deny'

export interface UserPermission {
  user_id: string
  permission_key: PermissionKey
  effect: OverrideEffect
  granted_by: string | null
  created_at: string
}

/**
 * The caller's fully-resolved permission set — role defaults, with per-user
 * grants and denies applied, and an unconditional everything for active admins.
 *
 * This is advisory: it drives what the UI shows. Postgres is the real boundary,
 * so a stale cache here can only ever make a button *look* usable — the write
 * still fails.
 */
export async function fetchMyPermissions(): Promise<PermissionKey[]> {
  const { data, error } = await supabase.rpc('my_permissions')
  if (error) throw error
  return (data ?? []) as PermissionKey[]
}

/** The full catalog, for the admin screen. */
export async function listPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase
    .from('permissions')
    .select('*')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return (data ?? []) as Permission[]
}

/** Every role → permission mapping. Small table; fetched whole. */
export async function listRolePermissions(): Promise<RolePermission[]> {
  const { data, error } = await supabase.from('role_permissions').select('*')
  if (error) throw error
  return (data ?? []) as RolePermission[]
}

/** Grant or revoke a permission for a whole role. */
export async function setRolePermission(
  role: StaffRole,
  key: PermissionKey,
  enabled: boolean
): Promise<void> {
  if (enabled) {
    const { error } = await supabase
      .from('role_permissions')
      .upsert({ role, permission_key: key }, { onConflict: 'role,permission_key' })
    if (error) throw error
    return
  }

  const { error } = await supabase
    .from('role_permissions')
    .delete()
    .eq('role', role)
    .eq('permission_key', key)
  if (error) throw error
}

/** Per-user overrides. Omit `userId` to fetch every override in the system. */
export async function listUserPermissions(userId?: string): Promise<UserPermission[]> {
  let query = supabase.from('user_permissions').select('*')
  if (userId) query = query.eq('user_id', userId)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as UserPermission[]
}

/**
 * Set a user's override for one permission.
 *
 * `'inherit'` removes the override row, so the user falls back to their role's
 * default. `'deny'` beats a role default; `'grant'` adds on top of one.
 */
export async function setUserPermission(
  userId: string,
  key: PermissionKey,
  effect: OverrideEffect | 'inherit'
): Promise<void> {
  if (effect === 'inherit') {
    const { error } = await supabase
      .from('user_permissions')
      .delete()
      .eq('user_id', userId)
      .eq('permission_key', key)
    if (error) throw error
    return
  }

  const { data: auth } = await supabase.auth.getUser()

  const { error } = await supabase.from('user_permissions').upsert(
    {
      user_id: userId,
      permission_key: key,
      effect,
      granted_by: auth.user?.id ?? null,
    },
    { onConflict: 'user_id,permission_key' }
  )
  if (error) throw error
}

/**
 * Resolve what a given user can do, without asking the database — used by the
 * admin screen to preview the effect of an override before saving.
 *
 * Mirrors `has_permission()` in SQL. If you change one, change the other.
 */
export function resolveEffectivePermissions(
  role: StaffRole,
  rolePermissions: readonly RolePermission[],
  overrides: readonly UserPermission[]
): Set<PermissionKey> {
  if (role === 'admin') return new Set(PERMISSION_KEYS)

  const effective = new Set<PermissionKey>(
    rolePermissions.filter((rp) => rp.role === role).map((rp) => rp.permission_key)
  )

  for (const o of overrides) {
    if (o.effect === 'grant') effective.add(o.permission_key)
    else effective.delete(o.permission_key)
  }

  return effective
}
