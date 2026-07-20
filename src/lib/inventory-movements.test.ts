import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { InventoryItem, InventoryMovementSource } from '@/lib/api/inventory'
import {
  deltaIcon,
  deltaTone,
  formatDelta,
  formatZar,
  isBackordered,
  isLowStock,
  isOutOfStock,
  isStaleStock,
  movementDotColor,
  movementSourceLabel,
  movementSourceTone,
} from './inventory-movements'

const SOURCES: InventoryMovementSource[] = [
  'initial',
  'manual_edit',
  'package_deduct',
  'package_backorder',
  'restock',
]

describe('movement source presentation', () => {
  it('labels every known source and echoes unknown ones', () => {
    expect(SOURCES.map(movementSourceLabel)).toEqual([
      'Initial stock',
      'Manual edit',
      'Package',
      'Backorder',
      'Restock',
    ])
    expect(movementSourceLabel('surprise' as InventoryMovementSource)).toBe('surprise')
  })

  it('returns a tone and dot colour for every source (incl. fallback)', () => {
    for (const s of [...SOURCES, 'surprise' as InventoryMovementSource]) {
      expect(movementSourceTone(s)).toBeTruthy()
      expect(movementDotColor(s)).toMatch(/^bg-/)
    }
  })
})

describe('signed deltas', () => {
  it('tones positive/negative/zero deltas', () => {
    expect(deltaTone(3)).toBe('text-success')
    expect(deltaTone(-3)).toBe('text-destructive')
    expect(deltaTone(0)).toBe('text-muted-foreground')
  })

  it('picks a directional icon', () => {
    expect(deltaIcon(3)).toBe(TrendingUp)
    expect(deltaIcon(-3)).toBe(TrendingDown)
    expect(deltaIcon(0)).toBe(Minus)
  })

  it('formats the sign', () => {
    expect(formatDelta(5)).toBe('+5')
    expect(formatDelta(-3)).toBe('-3')
    expect(formatDelta(0)).toBe('0')
  })
})

describe('stock-state predicates', () => {
  const item = (over: Partial<InventoryItem>): InventoryItem =>
    ({ quantity: 10, low_stock_threshold: 5, updated_at: '2026-07-01T00:00:00Z', ...over }) as InventoryItem

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T00:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('detects low / out / backordered stock', () => {
    expect(isLowStock(item({ quantity: 4 }))).toBe(true)
    expect(isLowStock(item({ quantity: 10 }))).toBe(false)
    expect(isLowStock(item({ quantity: 0 }))).toBe(false)
    expect(isOutOfStock(item({ quantity: 0 }))).toBe(true)
    expect(isOutOfStock(item({ quantity: 1 }))).toBe(false)
    expect(isBackordered(item({ quantity: -2 }))).toBe(true)
    expect(isBackordered(item({ quantity: 0 }))).toBe(false)
  })

  it('flags stale stock older than two months (only when in stock)', () => {
    expect(isStaleStock(item({ quantity: 3, updated_at: '2026-01-01T00:00:00Z' }))).toBe(true)
    expect(isStaleStock(item({ quantity: 3, updated_at: '2026-07-01T00:00:00Z' }))).toBe(false)
    expect(isStaleStock(item({ quantity: 0, updated_at: '2020-01-01T00:00:00Z' }))).toBe(false)
  })
})

describe('formatZar', () => {
  it('formats ZAR currency and dashes null', () => {
    expect(formatZar(null)).toBe('—')
    expect(formatZar(1200)).toContain('R')
  })
})
