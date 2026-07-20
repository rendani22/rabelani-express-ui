import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { getCurrentStaffProfile, type StaffProfile } from '@/lib/api/staff'
import { getCurrentCustomer, type CurrentCustomer } from '@/lib/api/customers'
import { fetchMyPermissions, type PermissionKey } from '@/lib/api/permissions'

/**
 * What kind of principal the logged-in user is. Staff take precedence; a user
 * that is neither active staff nor an invited customer is 'none' (no portal
 * access).
 *
 * The staff branch carries the profile (so components can read the role) and
 * the resolved permission set. Server RLS is still the real boundary — this
 * drives which shell, routes and controls the frontend shows, nothing more. A
 * stale set here can only make a control *look* available; the write fails.
 */
export type Principal =
  | { kind: 'staff'; profile: StaffProfile; permissions: ReadonlySet<PermissionKey> }
  | { kind: 'customer'; customer: CurrentCustomer }
  | { kind: 'none' }

export function useCurrentPrincipal() {
  const { user, initializing } = useAuth()
  return useQuery<Principal>({
    queryKey: ['principal', user?.id],
    enabled: !!user && !initializing,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Principal> => {
      const staff = await getCurrentStaffProfile()
      if (staff) {
        const permissions = await fetchMyPermissions()
        return { kind: 'staff', profile: staff, permissions: new Set(permissions) }
      }
      const customer = await getCurrentCustomer()
      if (customer) return { kind: 'customer', customer }
      return { kind: 'none' }
    },
  })
}
