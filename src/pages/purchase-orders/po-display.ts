import { PACKAGE_STATUS } from '@/lib/status'
import type { PurchaseOrder, PurchaseOrderStatus } from '@/lib/api/purchase-orders'

/** Statuses whose packages carry a downloadable proof of delivery / contribute delivered value. */
export const POD_STATUSES: ReadonlySet<string> = new Set([
  PACKAGE_STATUS.DELIVERED,
  PACKAGE_STATUS.COLLECTED,
])

/** Badge label + tone for a derived PO status. */
export function poStatusMeta(status: PurchaseOrderStatus): { label: string; tone: string } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', tone: 'border-success/40 bg-success/12 text-success' }
    case 'in_progress':
      return { label: 'In progress', tone: 'border-chart-2/40 bg-chart-2/12 text-chart-2' }
    case 'draft':
      return { label: 'Draft', tone: 'border-border bg-muted text-muted-foreground' }
    case 'mixed':
      return {
        label: 'Mixed',
        tone: 'border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning',
      }
  }
}

/** Format a `YYYY-MM-DD` PO date for display (no time component). */
export function formatPoDate(date: string | null): string {
  if (!date) return '—'
  const parsed = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Value delivered so far, priced from inventory unit prices: Σ(delivered/collected
 * quantity × unit_price) across the PO's delivered orders. Only items with a known
 * unit price contribute. Ported from `PurchaseOrdersComponent.deliveredValue`.
 */
export function deliveredValue(po: PurchaseOrder): number {
  const priceByItemId = new Map<string, number>()
  for (const ref of po.inventoryRefs) {
    const price = ref.item?.unit_price
    if (price !== null && price !== undefined && !Number.isNaN(price)) {
      priceByItemId.set(ref.inventoryItemId, price)
    }
  }

  let total = 0
  for (const pkg of po.packages) {
    if (!POD_STATUSES.has(pkg.status)) continue
    for (const item of pkg.items ?? []) {
      const id = item.inventory_item_id
      if (!id) continue
      const price = priceByItemId.get(id)
      if (price === undefined) continue
      total += (Number(item.quantity) || 0) * price
    }
  }
  return total
}

export type DeliveredTone = 'full' | 'partial' | 'none'

export function deliveredValueTone(po: PurchaseOrder): DeliveredTone {
  const total = po.poValue ?? 0
  const delivered = deliveredValue(po)
  if (delivered <= 0) return 'none'
  if (delivered >= total) return 'full'
  return 'partial'
}

export function deliveredValuePercent(po: PurchaseOrder): number {
  const total = po.poValue ?? 0
  const delivered = deliveredValue(po)
  if (total <= 0) return delivered > 0 ? 100 : 0
  return Math.min(100, Math.round((delivered / total) * 100))
}

export function deliveredValueLabel(po: PurchaseOrder): string {
  switch (deliveredValueTone(po)) {
    case 'full':
      return 'Fully delivered'
    case 'partial':
      return 'Partially delivered'
    case 'none':
      return 'Not yet delivered'
  }
}

export function deliveredValueTextClass(tone: DeliveredTone): string {
  switch (tone) {
    case 'full':
      return 'text-success'
    case 'partial':
      return 'text-warning-foreground dark:text-warning'
    case 'none':
      return 'text-muted-foreground'
  }
}

export function deliveredValueBarClass(tone: DeliveredTone): string {
  switch (tone) {
    case 'full':
      return 'bg-success'
    case 'partial':
      return 'bg-warning'
    case 'none':
      return 'bg-muted-foreground/40'
  }
}

/** Packages in this PO that have a downloadable POD (delivered / collected). */
export function podEligiblePackages(po: PurchaseOrder) {
  return po.packages.filter((pkg) => POD_STATUSES.has(pkg.status))
}

export function showCompletion(po: PurchaseOrder): boolean {
  return po.source === 'purchase_order'
    ? po.inventoryRefs.length > 0 || po.totalItems > 0
    : po.packages.length > 0
}
