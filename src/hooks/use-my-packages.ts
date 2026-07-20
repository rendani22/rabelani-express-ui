import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  CUSTOMER_PAGE_SIZE,
  fetchMyPackageGroups,
  fetchMyPackageStatusCounts,
  fetchMyPackagesTotal,
} from '@/lib/api/customer-packages'
import type { PackageStatus } from '@/lib/status'

export interface MyPackagesFilters {
  /** Substring match on PO number. Blank means no search. */
  query: string
  /** Null means every status. */
  status: PackageStatus | null
}

/**
 * The customer's PO groups, one scroll page at a time. A short page that comes
 * back means the list is exhausted, so there is no next page to ask for.
 */
export function useMyPackageGroups({ query, status }: MyPackagesFilters) {
  return useInfiniteQuery({
    queryKey: ['customer-packages', 'groups', query, status],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchMyPackageGroups({ offset: pageParam, query, status }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < CUSTOMER_PAGE_SIZE ? undefined : allPages.length * CUSTOMER_PAGE_SIZE,
  })
}

/** Status counts for the filter chips, within the current search scope. */
export function useMyPackageStatusCounts(query: string) {
  return useQuery({
    queryKey: ['customer-packages', 'counts', query],
    queryFn: () => fetchMyPackageStatusCounts(query),
  })
}

/** Whether the customer has any orders at all, ignoring search and filters. */
export function useMyPackagesTotal() {
  return useQuery({
    queryKey: ['customer-packages', 'total'],
    queryFn: fetchMyPackagesTotal,
  })
}
