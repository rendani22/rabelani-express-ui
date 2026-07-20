import { useMemo } from 'react'
import { Lock, Plus, Trash2 } from 'lucide-react'
import type { InventoryItem } from '@/lib/api/inventory'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'

export interface PoLine {
  key: string
  /** Empty for a brand-new line added during an edit (or any create line). */
  purchaseOrderItemId: string
  inventoryItemId: string
  orderedQuantity: string
  /** Lowest quantity this line may be reduced to (allocated/consumed). 1 for new lines. */
  minAllowedQuantity: number
}

let seq = 0
export function newPoLine(): PoLine {
  seq += 1
  return { key: `line-${seq}`, purchaseOrderItemId: '', inventoryItemId: '', orderedQuantity: '1', minAllowedQuantity: 1 }
}

/** Editable list of PO lines: inventory item + ordered quantity, add/remove. */
export function PoLineEditor({
  lines,
  onChange,
  items,
}: {
  lines: PoLine[]
  onChange: (lines: PoLine[]) => void
  items: InventoryItem[]
}) {
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items])
  const selectedIds = useMemo(() => new Set(lines.map((l) => l.inventoryItemId).filter(Boolean)), [lines])

  const setLine = (key: string, patch: Partial<PoLine>) =>
    onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: string) => onChange(lines.filter((l) => l.key !== key))
  const addLine = () => onChange([...lines, newPoLine()])

  return (
    <div className="flex flex-col gap-2">
      {lines.length === 0 ? (
        <div className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          No lines yet — add at least one inventory item.
        </div>
      ) : (
        lines.map((line) => {
          const item = itemById.get(line.inventoryItemId)
          // options: unselected items, plus this line's own current selection
          const options = items
            .filter((i) => i.id === line.inventoryItemId || !selectedIds.has(i.id))
            .map((i) => ({ value: i.id, label: `${i.name}${i.sku ? ` · ${i.sku}` : ''}` }))
          const qty = Number(line.orderedQuantity)
          const belowMin = Number.isFinite(qty) && qty < line.minAllowedQuantity
          return (
            <div key={line.key} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-2.5">
              <div className="flex-1 min-w-0">
                <Combobox
                  options={options}
                  value={line.inventoryItemId}
                  onChange={(v) => setLine(line.key, { inventoryItemId: v })}
                  placeholder="Select inventory item…"
                  searchPlaceholder="Search items…"
                />
                {line.minAllowedQuantity > 1 && (
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    Min {line.minAllowedQuantity} {item?.unit ?? ''} (already allocated / consumed)
                  </span>
                )}
              </div>
              <div className="w-24 shrink-0">
                <Input
                  type="number"
                  min={line.minAllowedQuantity}
                  value={line.orderedQuantity}
                  onChange={(e) => setLine(line.key, { orderedQuantity: e.target.value })}
                  className={cn('tabular', belowMin && 'border-destructive')}
                  aria-label="Ordered quantity"
                />
              </div>
              {line.purchaseOrderItemId === '' ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="mt-0.5 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeLine(line.key)}
                  aria-label="Remove line"
                >
                  <Trash2 />
                </Button>
              ) : (
                // Persisted PO lines can't be removed (protects allocated quantities);
                // reduce the quantity to its minimum instead.
                <span
                  className="mt-0.5 flex size-8 shrink-0 items-center justify-center text-muted-foreground/40"
                  title="Existing lines can't be removed"
                >
                  <Lock className="size-3.5" />
                </span>
              )}
            </div>
          )
        })
      )}
      <Button variant="outline" size="sm" className="self-start" onClick={addLine}>
        <Plus /> Add line
      </Button>
    </div>
  )
}

/** True when every line has an item and a quantity ≥ its minimum, and there is ≥1 line. */
export function poLinesValid(lines: PoLine[]): boolean {
  if (lines.length === 0) return false
  return lines.every((l) => {
    const qty = Number(l.orderedQuantity)
    return l.inventoryItemId.trim().length > 0 && Number.isFinite(qty) && qty >= Math.max(1, l.minAllowedQuantity)
  })
}
