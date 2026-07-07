import { useQuery } from '@tanstack/react-query'
import { listDriverActivePackages, listDrivers } from '@/lib/api/drivers'
import { useSettings } from '@/lib/settings-store'

export function useDrivers() {
  const { autoRefreshEnabled, autoRefreshInterval } = useSettings()
  return useQuery({
    queryKey: ['drivers'],
    queryFn: listDrivers,
    // locations move — keep the map fresh per the user's auto-refresh preference
    refetchInterval: autoRefreshEnabled ? autoRefreshInterval * 1000 : false,
  })
}

export function useDriverPackages(userId: string | undefined) {
  return useQuery({
    queryKey: ['driver-packages', userId],
    queryFn: () => listDriverActivePackages(userId!),
    enabled: !!userId,
  })
}
