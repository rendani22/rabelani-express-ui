import { useQuery } from '@tanstack/react-query'
import { fetchOperationsDashboard } from '@/lib/api/operations-dashboard'
import { fetchExecutiveDashboard } from '@/lib/api/executive-dashboard'
import { listCompanies } from '@/lib/api/customers'

/** `companyId` scopes every package/revenue metric to that company; null = whole network. */
export function useOperationsDashboard(companyId?: string | null) {
  return useQuery({
    queryKey: ['dashboard', 'operations', companyId ?? 'all'],
    queryFn: () => fetchOperationsDashboard(undefined, companyId),
  })
}

export function useExecutiveDashboard(companyId?: string | null) {
  return useQuery({
    queryKey: ['dashboard', 'executive', companyId ?? 'all'],
    queryFn: () => fetchExecutiveDashboard(undefined, companyId),
  })
}

/** Companies for the dashboard company filter (and anywhere a company picker is needed). */
export function useCompanies() {
  return useQuery({
    queryKey: ['companies'],
    queryFn: listCompanies,
    staleTime: 5 * 60_000,
  })
}
