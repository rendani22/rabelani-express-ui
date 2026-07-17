import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  PURCHASE_ORDER_PAGE_SIZE,
  fetchPurchaseOrderPage,
  fetchPurchaseOrderStats,
} from '@/lib/api/purchase-orders'
import type { PurchaseOrderStatus } from '@/lib/api/purchase-orders'

export interface PurchaseOrderPageFilters {
  /** Substring match on PO number, order reference/email, inventory name/sku. */
  search: string
  status: PurchaseOrderStatus | 'all'
  /** Company id, or 'all' for every company. */
  company: string
}

/**
 * Purchase orders, one scroll page at a time. A short page means the list is
 * exhausted, so there is no next page to ask for.
 *
 * Filters are part of the key: changing one starts a fresh page 0 from the
 * server rather than re-filtering what is already loaded.
 */
export function usePurchaseOrderPages({ search, status, company }: PurchaseOrderPageFilters) {
  return useInfiniteQuery({
    queryKey: ['purchase-orders', 'page', search, status, company],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchPurchaseOrderPage({ offset: pageParam, search, status, company }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < PURCHASE_ORDER_PAGE_SIZE
        ? undefined
        : allPages.length * PURCHASE_ORDER_PAGE_SIZE,
  })
}

/** The six header tiles. Unfiltered — they describe every PO, not the page. */
export function usePurchaseOrderStats() {
  return useQuery({
    queryKey: ['purchase-orders', 'stats'],
    queryFn: fetchPurchaseOrderStats,
  })
}
