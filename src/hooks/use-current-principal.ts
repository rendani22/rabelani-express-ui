import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/auth'
import { getCurrentStaffProfile } from '@/lib/api/staff'
import { getCurrentCustomer, type CurrentCustomer } from '@/lib/api/customers'

/**
 * What kind of principal the logged-in user is. Staff take precedence; a user
 * that is neither active staff nor an invited customer is 'none' (no portal
 * access). Server RLS is the real boundary — this only drives which shell/routes
 * the frontend shows.
 */
export type Principal =
  | { kind: 'staff' }
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
      if (staff) return { kind: 'staff' }
      const customer = await getCurrentCustomer()
      if (customer) return { kind: 'customer', customer }
      return { kind: 'none' }
    },
  })
}
