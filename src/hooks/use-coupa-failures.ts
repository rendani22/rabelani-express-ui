import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CoupaFailureStatus } from '@/lib/api/coupa-failures'
import { loadCoupaFailures, retryCoupaFailure, setCoupaFailureStatus } from '@/lib/api/coupa-failures'
import { reportError } from '@/lib/logger'

const QUERY_KEY = ['coupa-failures'] as const

export function useCoupaFailures(status?: CoupaFailureStatus) {
  return useQuery({
    queryKey: [...QUERY_KEY, status ?? 'all'],
    queryFn: () => loadCoupaFailures(status),
  })
}

/**
 * Replays a queued email.
 *
 * A rejected replay is NOT a mutation error — it resolves, with `success:
 * false`. The retry ran exactly as asked and ingestion said no again, usually
 * because the underlying data still is not fixed. Throwing would put a red
 * "something went wrong" toast on a request that worked; the distinction the
 * admin needs is "did the order go in", not "did the HTTP call succeed".
 */
export function useRetryCoupaFailure() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: retryCoupaFailure,
    onSuccess: (result) => {
      if (result.success) {
        toast.success(result.poNumber ? `${result.poNumber} created` : 'Purchase order created')
        // The PO now exists, so the Global PO list and the ingestion card are
        // both stale.
        queryClient.invalidateQueries({ queryKey: ['purchase-orders'] })
        queryClient.invalidateQueries({ queryKey: ['dashboard', 'executive'] })
      } else {
        toast.warning('Still not accepted', { description: result.details })
      }
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (err) => toast.error(reportError(err, 'Could not retry this ingestion.')),
  })
}

/** Takes a row off the queue by hand — resolved (keyed in) or ignored (a test). */
export function useSetCoupaFailureStatus() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'resolved' | 'ignored' }) =>
      setCoupaFailureStatus(id, status),
    onSuccess: () => {
      toast.success('Updated')
      queryClient.invalidateQueries({ queryKey: QUERY_KEY })
    },
    onError: (err) => toast.error(reportError(err, 'Could not update this ingestion.')),
  })
}
