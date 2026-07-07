import { useQuery } from '@tanstack/react-query'
import { fetchMyPackages } from '@/lib/api/customer-packages'

export function useMyPackages() {
  return useQuery({
    queryKey: ['customer-packages'],
    queryFn: fetchMyPackages,
  })
}
