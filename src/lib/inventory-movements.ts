import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { InventoryItem, InventoryMovementSource } from '@/lib/api/inventory'

/**
 * Presentation helpers for inventory stock movements — the React port of the
 * Angular `movement-format.util.ts`, re-themed onto Dispatch design tokens
 * (a movement ledger reads +/- like an account, so success/destructive earn
 * their meaning here rather than the "green = delivered only" status rule).
 */

/** Human label for a movement's origin. */
export function movementSourceLabel(source: InventoryMovementSource): string {
  switch (source) {
    case 'initial':
      return 'Initial stock'
    case 'manual_edit':
      return 'Manual edit'
    case 'package_deduct':
      return 'Package'
    case 'package_backorder':
      return 'Backorder'
    case 'restock':
      return 'Restock'
    default:
      return source
  }
}

/** Badge tone (border + tint + text) for a movement source. */
export function movementSourceTone(source: InventoryMovementSource): string {
  switch (source) {
    case 'restock':
      return 'border-success/40 bg-success/12 text-success'
    case 'manual_edit':
      return 'border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning'
    case 'package_deduct':
      return 'border-chart-2/35 bg-chart-2/12 text-chart-2'
    case 'package_backorder':
      return 'border-destructive/40 bg-destructive/12 text-destructive'
    case 'initial':
    default:
      return 'border-border bg-muted text-muted-foreground'
  }
}

/** Timeline dot fill for a movement source. */
export function movementDotColor(source: InventoryMovementSource): string {
  switch (source) {
    case 'restock':
      return 'bg-success'
    case 'manual_edit':
      return 'bg-warning'
    case 'package_deduct':
      return 'bg-chart-2'
    case 'package_backorder':
      return 'bg-destructive'
    case 'initial':
    default:
      return 'bg-muted-foreground'
  }
}

/** Text colour for a signed delta. */
export function deltaTone(delta: number): string {
  if (delta > 0) return 'text-success'
  if (delta < 0) return 'text-destructive'
  return 'text-muted-foreground'
}

/** Directional icon for a signed delta. */
export function deltaIcon(delta: number) {
  if (delta > 0) return TrendingUp
  if (delta < 0) return TrendingDown
  return Minus
}

/** "+5" / "-3" / "0" — the signed delta as a string. */
export function formatDelta(delta: number): string {
  return delta > 0 ? `+${delta}` : `${delta}`
}

// -------------------------------------------------------------------------
// Item stock-state predicates (ported from the inventory component helpers)
// -------------------------------------------------------------------------

const twoMonthsAgo = () => {
  const d = new Date()
  d.setMonth(d.getMonth() - 2)
  return d
}

export function isLowStock(item: InventoryItem): boolean {
  return item.quantity > 0 && item.quantity <= item.low_stock_threshold
}

export function isOutOfStock(item: InventoryItem): boolean {
  return item.quantity === 0
}

export function isBackordered(item: InventoryItem): boolean {
  return item.quantity < 0
}

export function isStaleStock(item: InventoryItem): boolean {
  return item.quantity > 0 && new Date(item.updated_at) < twoMonthsAgo()
}

/** ZAR currency, or an em-dash for null. */
export function formatZar(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value)
}
