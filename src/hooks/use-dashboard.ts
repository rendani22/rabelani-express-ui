import { useQuery } from '@tanstack/react-query'
import { fetchOperationsDashboard } from '@/lib/api/operations-dashboard'
import { fetchExecutiveDashboard } from '@/lib/api/executive-dashboard'

export function useOperationsDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'operations'],
    queryFn: () => fetchOperationsDashboard(),
  })
}

export function useExecutiveDashboard() {
  return useQuery({
    queryKey: ['dashboard', 'executive'],
    queryFn: () => fetchExecutiveDashboard(),
  })
}
