import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { reportError } from '@/lib/logger'
import {
  listPermissions,
  listRolePermissions,
  listUserPermissions,
  setRolePermission,
  setUserPermission,
  type OverrideEffect,
  type PermissionKey,
  type RolePermission,
  type UserPermission,
} from '@/lib/api/permissions'
import type { StaffRole } from '@/lib/api/staff'

/**
 * `can('orders.delete')` — the single question the UI asks about authorization.
 *
 * Returns false while the principal is still loading, so a control never flashes
 * enabled before we know whether it should be. Non-staff principals can nothing.
 */
export function usePermissions() {
  const { data, isLoading } = useCurrentPrincipal()

  const permissions = useMemo(
    () => (data?.kind === 'staff' ? data.permissions : new Set<PermissionKey>()),
    [data]
  )

  const can = useCallback(
    (key: PermissionKey) => permissions.has(key),
    [permissions]
  )

  return {
    can,
    permissions,
    role: data?.kind === 'staff' ? data.profile.role : null,
    isAdmin: data?.kind === 'staff' && data.profile.role === 'admin',
    isLoading,
  }
}

// ---------------------------------------------------------------------------
// Admin screen: the policy tables themselves.
// ---------------------------------------------------------------------------

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ['permissions', 'catalog'],
    queryFn: listPermissions,
    staleTime: Infinity, // seeded by migration; never changes at runtime
  })
}

export function useRolePermissions() {
  return useQuery({
    queryKey: ['permissions', 'roles'],
    queryFn: listRolePermissions,
  })
}

const userPermissionsKey = (userId?: string) =>
  ['permissions', 'users', userId ?? 'all'] as const

export function useUserPermissions(userId?: string) {
  return useQuery({
    queryKey: userPermissionsKey(userId),
    queryFn: () => listUserPermissions(userId),
  })
}

/**
 * Refetch everything a policy edit can invalidate — except the catalog, which is
 * seeded by migration and never changes at runtime.
 *
 * `['principal']` matters as much as the policy tables: if an admin changes their
 * own permissions, or their own role's, their own UI has to reflect it now rather
 * than after the staleTime.
 */
function invalidatePolicy(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['permissions', 'roles'] })
  qc.invalidateQueries({ queryKey: ['permissions', 'users'] })
  qc.invalidateQueries({ queryKey: ['principal'] })
}

/**
 * Both policy mutations apply optimistically. The grid is a checkbox matrix an
 * admin works down in a run, and a round-trip per tick — with the tick only
 * landing once the refetch does — reads as a broken control rather than a slow
 * one. The write is still authoritative: on error we roll back to the snapshot
 * and say so, and `onSettled` reconciles against the server either way.
 */
export function useSetRolePermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      role,
      key,
      enabled,
    }: {
      role: StaffRole
      key: PermissionKey
      enabled: boolean
    }) => setRolePermission(role, key, enabled),
    onMutate: async ({ role, key, enabled }) => {
      const queryKey = ['permissions', 'roles']
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<RolePermission[]>(queryKey)

      qc.setQueryData<RolePermission[]>(queryKey, (old = []) => {
        const without = old.filter(
          (rp) => !(rp.role === role && rp.permission_key === key)
        )
        return enabled ? [...without, { role, permission_key: key }] : without
      })

      return { previous }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(['permissions', 'roles'], ctx.previous)
      toast.error(reportError(err, 'Could not update the role.'))
    },
    onSettled: () => invalidatePolicy(qc),
  })
}

export function useSetUserPermission() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      userId,
      key,
      effect,
    }: {
      userId: string
      key: PermissionKey
      effect: OverrideEffect | 'inherit'
    }) => setUserPermission(userId, key, effect),
    onMutate: async ({ userId, key, effect }) => {
      const queryKey = userPermissionsKey(userId)
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<UserPermission[]>(queryKey)

      qc.setQueryData<UserPermission[]>(queryKey, (old = []) => {
        const without = old.filter((o) => o.permission_key !== key)
        if (effect === 'inherit') return without
        // granted_by/created_at are the server's to assign; this row only has to
        // survive until onSettled refetches the real one.
        const existing = old.find((o) => o.permission_key === key)
        return [
          ...without,
          {
            user_id: userId,
            permission_key: key,
            effect,
            granted_by: existing?.granted_by ?? null,
            created_at: existing?.created_at ?? '',
          },
        ]
      })

      return { previous, queryKey }
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.queryKey, ctx.previous)
      toast.error(reportError(err, 'Could not update the override.'))
    },
    onSettled: () => invalidatePolicy(qc),
  })
}
