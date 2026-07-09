import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Download, History, Package as PackageIcon, RefreshCw } from 'lucide-react'
import { listRecentMovements } from '@/lib/api/inventory'
import { getStaffNamesByIds } from '@/lib/api/staff'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { SectionLabel } from '@/components/dispatch'
import { formatDateTime } from '@/lib/format'
import { downloadCsv, toCsv, yyyymmdd } from '@/lib/csv'
import {
  deltaIcon,
  deltaTone,
  formatDelta,
  movementSourceLabel,
  movementSourceTone,
} from '@/lib/inventory-movements'
import { cn } from '@/lib/utils'

const LIMIT = 100

export function RecentMovementsPage() {
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['inventory-recent-movements'],
    queryFn: () => listRecentMovements(LIMIT),
  })
  const movements = useMemo(() => data ?? [], [data])

  // Resolve staff display names for movement authors (best-effort; RLS may block).
  const [userNames, setUserNames] = useState<Record<string, string>>({})
  useEffect(() => {
    const ids = [...new Set(movements.map((m) => m.user_id).filter((id): id is string => !!id))]
    if (ids.length === 0) return
    let cancelled = false
    getStaffNamesByIds(ids).then((map) => {
      if (cancelled) return
      // fall back to short placeholders for ids the query didn't return
      const filled = { ...map }
      for (const id of ids) if (!filled[id]) filled[id] = `Staff (${id.slice(0, 8)})`
      setUserNames(filled)
    })
    return () => {
      cancelled = true
    }
  }, [movements])

  const userDisplay = (userId: string | null) => (!userId ? 'System' : userNames[userId] ?? '—')

  const onExport = () => {
    if (movements.length === 0) return
    const csv = toCsv(
      movements.map((m) => ({
        created_at: m.created_at,
        user_name: m.user_id ? userNames[m.user_id] ?? '' : 'System',
        item_name: m.item?.name ?? '',
        item_sku: m.item?.sku ?? '',
        unit: m.item?.unit ?? '',
        source: m.source,
        delta: m.delta,
        quantity_before: m.quantity_before,
        quantity_after: m.quantity_after,
        reference: m.reference ?? '',
        note: m.note ?? '',
      })),
      ['created_at', 'user_name', 'item_name', 'item_sku', 'unit', 'source', 'delta', 'quantity_before', 'quantity_after', 'reference', 'note'],
    )
    downloadCsv(`inventory-movements-${yyyymmdd()}.csv`, csv)
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Stock"
        title="Recent movements"
        description={`The last ${movements.length} stock movements across all items.`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/inventory">
                <ArrowLeft /> Inventory
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button size="sm" onClick={onExport} disabled={isLoading || movements.length === 0}>
              <Download /> Export CSV
            </Button>
          </>
        }
      />

      {isLoading ? (
        <div className="overflow-hidden rounded-lg border">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="border-b p-3 last:border-0">
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </div>
      ) : movements.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <History className="size-5" />
          </span>
          <p className="text-sm font-medium">No movements recorded yet</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Stock changes appear here once items are created, restocked, edited, or consumed by packages.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Source</th>
                  <th className="px-4 py-2.5 text-right font-medium">Delta</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">User</th>
                  <th className="hidden px-4 py-2.5 text-center font-medium md:table-cell">Before → After</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Reference</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map((m) => {
                  const DeltaIcon = deltaIcon(m.delta)
                  return (
                    <tr key={m.id} className="transition-colors hover:bg-accent/30">
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDateTime(m.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{m.item?.name ?? '—'}</span>
                          {m.item?.sku && <span className="mono text-xs text-muted-foreground">{m.item.sku}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium', movementSourceTone(m.source))}>
                          {movementSourceLabel(m.source)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn('inline-flex items-center justify-end gap-1 font-semibold tabular', deltaTone(m.delta))}>
                          <DeltaIcon className="size-3.5" />
                          {formatDelta(m.delta)}
                          <span className="ml-0.5 text-xs font-normal text-muted-foreground">{m.item?.unit}</span>
                        </span>
                      </td>
                      <td className="hidden max-w-[12rem] truncate px-4 py-3 text-muted-foreground md:table-cell" title={userDisplay(m.user_id)}>
                        {userDisplay(m.user_id)}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-center text-xs text-muted-foreground md:table-cell">
                        <span className="tabular">{m.quantity_before.toLocaleString()}</span>
                        <span className="mx-1 text-muted-foreground/50">→</span>
                        <span className="tabular font-semibold text-foreground">{m.quantity_after.toLocaleString()}</span>
                      </td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {m.reference ? (
                          <span className="inline-flex items-center gap-1 text-xs text-chart-2">
                            <PackageIcon className="size-3" />
                            <span className="mono">{m.reference}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="hidden max-w-[16rem] px-4 py-3 lg:table-cell">
                        {m.note ? (
                          <span className="block truncate text-xs italic text-muted-foreground" title={m.note}>
                            {m.note}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="border-t bg-muted/20 px-4 py-2.5">
            <SectionLabel>Showing the {movements.length} most recent movements</SectionLabel>
          </div>
        </div>
      )}
    </PageBody>
  )
}
