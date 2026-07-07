import { useQuery } from '@tanstack/react-query'
import { computeInventoryStats, listInventoryItems, listItemMovements } from '@/lib/api/inventory'

/** All inventory items (active + inactive) plus derived stats. */
export function useInventory() {
  const query = useQuery({ queryKey: ['inventory'], queryFn: listInventoryItems })
  const items = query.data ?? []
  return { ...query, items, stats: computeInventoryStats(items) }
}

/** Stock movement history for a single item; only fetches while `enabled`. */
export function useItemMovements(itemId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['inventory-movements', itemId],
    queryFn: () => listItemMovements(itemId!),
    enabled: enabled && !!itemId,
  })
}
