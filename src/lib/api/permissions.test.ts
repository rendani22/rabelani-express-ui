import { describe, expect, it } from 'vitest'
import {
  PERMISSION_KEYS,
  resolveEffectivePermissions,
  type RolePermission,
  type UserPermission,
} from './permissions'

/**
 * `resolveEffectivePermissions` mirrors the SQL `has_permission()` so the admin
 * screen can preview an override without a round-trip. Two implementations of
 * one rule is a drift risk, so the resolution order is pinned here:
 *
 *   active admin  >  explicit deny  >  explicit grant  >  role default
 */

const roleDefaults: RolePermission[] = [
  { role: 'warehouse', permission_key: 'orders.read' },
  { role: 'warehouse', permission_key: 'orders.create' },
  { role: 'viewer', permission_key: 'orders.read' },
]

function override(
  permission_key: UserPermission['permission_key'],
  effect: UserPermission['effect']
): UserPermission {
  return {
    user_id: 'u1',
    permission_key,
    effect,
    granted_by: null,
    created_at: '2026-07-14T00:00:00Z',
  }
}

describe('resolveEffectivePermissions', () => {
  it('gives an admin every permission, ignoring the role table entirely', () => {
    const effective = resolveEffectivePermissions('admin', [], [])
    expect(effective.size).toBe(PERMISSION_KEYS.length)
    expect(effective.has('policies.manage')).toBe(true)
  })

  it('ignores overrides for an admin — they cannot be denied anything', () => {
    const effective = resolveEffectivePermissions('admin', [], [
      override('orders.read', 'deny'),
    ])
    expect(effective.has('orders.read')).toBe(true)
  })

  it('falls back to the role defaults when there are no overrides', () => {
    const effective = resolveEffectivePermissions('warehouse', roleDefaults, [])
    expect([...effective].sort()).toEqual(['orders.create', 'orders.read'])
  })

  it('a grant adds a permission the role does not have', () => {
    const effective = resolveEffectivePermissions('viewer', roleDefaults, [
      override('orders.delete', 'grant'),
    ])
    expect(effective.has('orders.delete')).toBe(true)
    expect(effective.has('orders.read')).toBe(true) // role default survives
  })

  it('a deny removes a permission the role does have', () => {
    const effective = resolveEffectivePermissions('warehouse', roleDefaults, [
      override('orders.create', 'deny'),
    ])
    expect(effective.has('orders.create')).toBe(false)
    expect(effective.has('orders.read')).toBe(true)
  })

  it('a role with no seeded permissions can do nothing', () => {
    expect(resolveEffectivePermissions('driver', roleDefaults, []).size).toBe(0)
  })

  it('denying something the role never had is a no-op, not an error', () => {
    const effective = resolveEffectivePermissions('viewer', roleDefaults, [
      override('users.manage', 'deny'),
    ])
    expect(effective.has('users.manage')).toBe(false)
    expect(effective.has('orders.read')).toBe(true)
  })
})
