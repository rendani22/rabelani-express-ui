import { Download, History, Loader2, Package as PackageIcon, X } from 'lucide-react'
import type { InventoryItem } from '@/lib/api/inventory'
import { useItemMovements } from '@/hooks/use-inventory'
import { Sheet, SheetClose, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { formatDateTime } from '@/lib/format'
import { downloadCsv, slugify, toCsv, yyyymmdd } from '@/lib/csv'
import {
  deltaIcon,
  deltaTone,
  formatDelta,
  movementDotColor,
  movementSourceLabel,
  movementSourceTone,
} from '@/lib/inventory-movements'
import { cn } from '@/lib/utils'

export function MovementHistoryPanel({
  item,
  open,
  onOpenChange,
}: {
  item: InventoryItem | null
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const { data, isLoading } = useItemMovements(item?.id, open)
  const movements = data ?? []

  const onExport = () => {
    if (!item || movements.length === 0) return
    const csv = toCsv(
      movements.map((m) => ({
        created_at: m.created_at,
        source: m.source,
        delta: m.delta,
        quantity_before: m.quantity_before,
        quantity_after: m.quantity_after,
        reference: m.reference ?? '',
        note: m.note ?? '',
      })),
      ['created_at', 'source', 'delta', 'quantity_before', 'quantity_after', 'reference', 'note'],
    )
    const slug = slugify(item.sku || item.name || item.id)
    downloadCsv(`movements-${slug}-${yyyymmdd()}.csv`, csv)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg" showCloseButton={false}>
        <SheetHeader className="border-b p-5">
          {/* pr-10 leaves room for the Sheet's built-in close button (absolute top-4 right-4) */}
          <div className="flex items-start justify-between gap-3 pr-10">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-chart-2/12 text-chart-2">
                <History className="size-[18px]" />
              </span>
              <div className="flex min-w-0 flex-col">
                <SheetTitle>Movement history</SheetTitle>
                <span className="truncate text-sm text-muted-foreground">{item?.name}</span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onExport}
                disabled={isLoading || movements.length === 0}
              >
                <Download /> CSV
              </Button>
              <SheetClose className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <X className="size-4" />
                <span className="sr-only">Close</span>
              </SheetClose>
            </div>
          </div>
        </SheetHeader>

        {item && (
          <div className="grid grid-cols-3 gap-3 border-b p-5">
            <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">On hand</span>
              <span className="tabular text-lg font-semibold">{item.quantity.toLocaleString()}</span>
              <span className="text-[11px] text-muted-foreground">{item.unit}</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-muted/50 p-3">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Alert at</span>
              <span className="tabular text-lg font-semibold">{item.low_stock_threshold.toLocaleString()}</span>
              <span className="text-[11px] text-muted-foreground">{item.unit}</span>
            </div>
            <div className="flex flex-col gap-0.5 rounded-lg bg-chart-2/10 p-3">
              <span className="text-[11px] uppercase tracking-wider text-chart-2">Events</span>
              <span className="tabular text-lg font-semibold text-chart-2">
                {isLoading ? '—' : movements.length}
              </span>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading history…
            </div>
          ) : movements.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <History className="size-5" />
              </span>
              <p className="text-sm font-medium">No movement history yet</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Changes to stock quantities will appear here.
              </p>
            </div>
          ) : (
            <ol className="relative ml-2 flex flex-col gap-5 border-l-2 pl-6">
              {movements.map((m) => {
                const DeltaIcon = deltaIcon(m.delta)
                return (
                  <li key={m.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[31px] top-1 size-3.5 rounded-full border-2 border-background',
                        movementDotColor(m.source),
                      )}
                    />
                    <div className="flex flex-col gap-2 rounded-lg bg-muted/40 p-3.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span
                          className={cn(
                            'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium',
                            movementSourceTone(m.source),
                          )}
                        >
                          {movementSourceLabel(m.source)}
                        </span>
                        <span className={cn('inline-flex items-center gap-1 text-sm font-semibold tabular', deltaTone(m.delta))}>
                          <DeltaIcon className="size-3.5" />
                          {formatDelta(m.delta)} {item?.unit}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="tabular">{m.quantity_before.toLocaleString()}</span>
                        <span className="text-muted-foreground/50">→</span>
                        <span className="tabular font-semibold text-foreground">
                          {m.quantity_after.toLocaleString()}
                        </span>
                        <span>{item?.unit}</span>
                      </div>
                      {m.reference && (
                        <div className="flex items-center gap-1.5 text-xs text-chart-2">
                          <PackageIcon className="size-3" />
                          <span className="mono">{m.reference}</span>
                        </div>
                      )}
                      {m.note && <p className="text-xs italic text-muted-foreground">{m.note}</p>}
                      <p className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
