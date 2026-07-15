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

export function useUserPermissions(userId?: string) {
  return useQuery({
    queryKey: ['permissions', 'users', userId ?? 'all'],
    queryFn: () => listUserPermissions(userId),
  })
}

/**
 * Both mutations invalidate `['principal']` as well as the policy tables: if an
 * admin changes their own permissions, or their own role's, the change has to be
 * reflected in their own UI immediately rather than after the 5-minute staleTime.
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] })
      qc.invalidateQueries({ queryKey: ['principal'] })
    },
    onError: (err) => toast.error(reportError(err, 'Could not update the role.')),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['permissions'] })
      qc.invalidateQueries({ queryKey: ['principal'] })
    },
    onError: (err) => toast.error(reportError(err, 'Could not update the override.')),
  })
}
