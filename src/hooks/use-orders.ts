import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchOrders, type OrdersQuery } from '@/lib/api/orders'
import { PACKAGE_STATUS } from '@/lib/status'

export const ORDER_STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: PACKAGE_STATUS.DRAFT, label: 'Draft' },
  { value: PACKAGE_STATUS.PENDING, label: 'Pending' },
  { value: PACKAGE_STATUS.NOTIFIED, label: 'Notified' },
  { value: PACKAGE_STATUS.IN_TRANSIT, label: 'In Transit' },
  { value: PACKAGE_STATUS.READY_FOR_COLLECTION, label: 'Ready for Collection' },
  { value: PACKAGE_STATUS.COLLECTED, label: 'Collected' },
  { value: PACKAGE_STATUS.DELIVERED, label: 'Delivered' },
  { value: PACKAGE_STATUS.RETURNED, label: 'Returned' },
]

export function useOrders(query: OrdersQuery) {
  return useQuery({
    queryKey: ['orders', query],
    queryFn: () => fetchOrders(query),
    placeholderData: keepPreviousData,
  })
}
