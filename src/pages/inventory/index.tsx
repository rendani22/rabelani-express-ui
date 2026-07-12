import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  MoreHorizontal,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Search,
  TrendingUp,
  Trash2,
  X,
} from 'lucide-react'
import type { InventoryItem } from '@/lib/api/inventory'
import { bulkDeleteInventoryItems, bulkSetInventoryActive, deleteInventoryItem, toggleInventoryItemActive } from '@/lib/api/inventory'
import { useInventory } from '@/hooks/use-inventory'
import { reportError } from '@/lib/logger'
import { downloadCsv, toCsv, yyyymmdd } from '@/lib/csv'
import { formatZar, isBackordered, isLowStock, isOutOfStock, isStaleStock } from '@/lib/inventory-movements'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { useConfirm } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Combobox } from '@/components/ui/combobox'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { ItemDialog } from './item-dialog'
import { RestockDialog } from './restock-dialog'
import { MovementHistoryPanel } from './movement-history-panel'

type StockFilter = 'none' | 'low' | 'out' | 'backordered' | 'stale'
type StatusFilter = 'active' | 'inactive' | 'all'
const PAGE_SIZES = [5, 10, 25, 50, 100]

/** Windowed page numbers around the current page (max 5), like the old inventory pager. */
function visiblePages(current: number, total: number): number[] {
  const size = 5
  let start = Math.max(1, current - Math.floor(size / 2))
  const end = Math.min(total, start + size - 1)
  start = Math.max(1, end - size + 1)
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

// -------------------------------------------------------------------------
// Stats tile
// -------------------------------------------------------------------------

function StatTile({
  label,
  value,
  tone,
  active,
  fit,
}: {
  label: string
  value: string | number
  tone?: 'warning' | 'destructive' | 'chart-2'
  active?: boolean
  /** For long values (currency): shrink to fit and truncate with a tooltip. */
  fit?: boolean
}) {
  const toneText =
    active && tone === 'warning'
      ? 'text-warning-foreground dark:text-warning'
      : active && tone === 'destructive'
        ? 'text-destructive'
        : active && tone === 'chart-2'
          ? 'text-chart-2'
          : 'text-foreground'
  const toneBorder =
    active && tone === 'warning'
      ? 'border-warning/45'
      : active && tone === 'destructive'
        ? 'border-destructive/40'
        : active && tone === 'chart-2'
          ? 'border-chart-2/40'
          : 'border-border'
  return (
    <div className={cn('flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4', toneBorder)}>
      <span
        title={fit ? String(value) : undefined}
        className={cn(
          'tabular font-semibold leading-none',
          fit ? 'block truncate text-lg sm:text-xl' : 'text-2xl',
          toneText,
        )}
      >
        {value}
      </span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </span>
    </div>
  )
}

// -------------------------------------------------------------------------
// Filter chip
// -------------------------------------------------------------------------

function FilterChip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'warning' | 'destructive' | 'chart-2'
}) {
  const activeCls =
    tone === 'warning'
      ? 'border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning'
      : tone === 'destructive'
        ? 'border-destructive/40 bg-destructive/12 text-destructive'
        : tone === 'chart-2'
          ? 'border-chart-2/40 bg-chart-2/12 text-chart-2'
          : 'border-primary/40 bg-primary/12 text-primary'
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? activeCls : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

// -------------------------------------------------------------------------
// Stock cell
// -------------------------------------------------------------------------

function StockBadge({ item }: { item: InventoryItem }) {
  if (isBackordered(item))
    return <span className="rounded-full border border-destructive/40 bg-destructive/12 px-2 py-0.5 text-[10.5px] font-semibold text-destructive">Backorder</span>
  if (isOutOfStock(item))
    return <span className="rounded-full border border-destructive/40 bg-destructive/12 px-2 py-0.5 text-[10.5px] font-semibold text-destructive">Out</span>
  if (isLowStock(item))
    return <span className="rounded-full border border-warning/45 bg-warning/15 px-2 py-0.5 text-[10.5px] font-semibold text-warning-foreground dark:text-warning">Low</span>
  return null
}

// -------------------------------------------------------------------------
// Page
// -------------------------------------------------------------------------

export function InventoryPage() {
  const qc = useQueryClient()
  const confirm = useConfirm()
  const { items, stats, isLoading, isError, error, isFetching, refetch } = useInventory()

  const [searchParams, setSearchParams] = useSearchParams()
  const [search, setSearch] = useState(() => searchParams.get('search') ?? '')
  const [category, setCategory] = useState('')
  const [stockFilter, setStockFilter] = useState<StockFilter>('none')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active')
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  // Deep link (e.g. opened from a Global PO item):
  //   ?id=<inventoryItemId> — reveal, search the item's name, and highlight its row
  //   ?search=<sku|name>    — just prefill the search box
  // Reveal inactive items so a linked item is never hidden, then clear the param.
  useEffect(() => {
    const idParam = searchParams.get('id')
    const term = searchParams.get('search')
    if (idParam) {
      if (items.length === 0) return // items still loading — re-run once they arrive
      const match = items.find((i) => i.id === idParam)
      setStatusFilter('all')
      if (match) {
        setSearch(match.name)
        setHighlightId(match.id)
      }
      setSearchParams((p) => { p.delete('id'); return p }, { replace: true })
      return
    }
    if (term !== null) {
      setSearch(term)
      setStatusFilter('all')
      setSearchParams((p) => { p.delete('search'); return p }, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items])

  // Clear the row highlight after a short pulse.
  useEffect(() => {
    if (!highlightId) return
    const t = setTimeout(() => setHighlightId(null), 2600)
    return () => clearTimeout(t)
  }, [highlightId])

  const [dismissed, setDismissed] = useState<Record<'out' | 'low' | 'stale', boolean>>({
    out: false,
    low: false,
    stale: false,
  })

  const [selected, setSelected] = useState<Set<string>>(new Set())

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<InventoryItem | null>(null)
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null)
  const [restockOpen, setRestockOpen] = useState(false)
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((item) => {
      if (statusFilter === 'active' && !item.is_active) return false
      if (statusFilter === 'inactive' && item.is_active) return false
      if (category && item.category !== category) return false
      if (stockFilter === 'low' && !isLowStock(item)) return false
      if (stockFilter === 'out' && !isOutOfStock(item)) return false
      if (stockFilter === 'backordered' && !isBackordered(item)) return false
      if (stockFilter === 'stale' && !isStaleStock(item)) return false
      if (q) {
        const hay = [item.name, item.sku ?? '', item.category ?? '', item.description ?? '']
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, search, category, stockFilter, statusFilter])

  // reset to page 1 when filters change
  useEffect(() => setPage(1), [search, category, stockFilter, statusFilter, pageSize])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const clampedPage = Math.min(page, totalPages)
  const paged = filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize)
  const rangeStart = filtered.length === 0 ? 0 : (clampedPage - 1) * pageSize + 1
  const rangeEnd = Math.min(clampedPage * pageSize, filtered.length)

  const allVisibleSelected = paged.length > 0 && paged.every((i) => selected.has(i.id))

  const toggleStock = (f: StockFilter) => setStockFilter((cur) => (cur === f ? 'none' : f))

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const toggleSelectAll = () =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) paged.forEach((i) => next.delete(i.id))
      else paged.forEach((i) => next.add(i.id))
      return next
    })

  const clearSelection = () => setSelected(new Set())

  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventory'] })

  const toggleActive = useMutation({
    mutationFn: (item: InventoryItem) => toggleInventoryItemActive(item),
    onSuccess: (updated) => {
      toast.success(updated.is_active ? `"${updated.name}" reactivated.` : `"${updated.name}" deactivated.`)
      invalidate()
    },
    onError: (e) => toast.error(reportError(e, 'Could not update the item.', { op: 'inventory.toggleActive' })),
  })

  const remove = useMutation({
    mutationFn: (item: InventoryItem) => deleteInventoryItem(item.id),
    onSuccess: (_, item) => {
      toast.success(`"${item.name}" deleted.`)
      invalidate()
    },
    onError: (e) => toast.error(reportError(e, 'Could not delete the item.', { op: 'inventory.delete' })),
  })

  const bulkActive = useMutation({
    mutationFn: ({ ids, active }: { ids: string[]; active: boolean }) => bulkSetInventoryActive(ids, active),
    onSuccess: (_, { ids, active }) => {
      toast.success(`${active ? 'Activated' : 'Deactivated'} ${ids.length} item(s).`)
      clearSelection()
      invalidate()
    },
    onError: (e) => toast.error(reportError(e, 'The bulk update could not be completed.', { op: 'inventory.bulkActive' })),
  })

  const bulkRemove = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteInventoryItems(ids),
    onSuccess: (_, ids) => {
      toast.success(`Deleted ${ids.length} item(s).`)
      clearSelection()
      invalidate()
    },
    onError: (e) => toast.error(reportError(e, 'The bulk delete could not be completed.', { op: 'inventory.bulkDelete' })),
  })

  const openNew = () => {
    setEditing(null)
    setDialogOpen(true)
  }
  const openEdit = (item: InventoryItem) => {
    setEditing(item)
    setDialogOpen(true)
  }
  const openRestock = (item: InventoryItem) => {
    setRestockItem(item)
    setRestockOpen(true)
  }
  const openHistory = (item: InventoryItem) => {
    setHistoryItem(item)
    setHistoryOpen(true)
  }

  const categoryOptions = useMemo(
    () => [{ value: '', label: 'All categories' }, ...stats.categories.map((c) => ({ value: c, label: c }))],
    [stats.categories],
  )

  // Export the currently-filtered items (respects search, category, stock and status filters).
  const onExport = () => {
    if (filtered.length === 0) return
    const csv = toCsv(
      filtered.map((item) => ({
        name: item.name,
        sku: item.sku ?? '',
        category: item.category ?? '',
        unit: item.unit,
        quantity: item.quantity,
        low_stock_threshold: item.low_stock_threshold,
        unit_price: item.unit_price ?? '',
        value: item.unit_price != null ? item.unit_price * item.quantity : '',
        status: item.is_active ? 'active' : 'inactive',
      })),
      ['name', 'sku', 'category', 'unit', 'quantity', 'low_stock_threshold', 'unit_price', 'value', 'status'],
    )
    downloadCsv(`inventory-${yyyymmdd()}.csv`, csv)
  }

  const banners = [
    stats.outOfStockCount > 0 && !dismissed.out && {
      key: 'out' as const,
      tone: 'border-destructive/40 bg-destructive/8 text-destructive',
      text: (
        <>
          <strong>{stats.outOfStockCount}</strong> item(s) are out of stock. Restock to avoid delays.
        </>
      ),
    },
    stats.lowStockCount > 0 && !dismissed.low && {
      key: 'low' as const,
      tone: 'border-warning/45 bg-warning/10 text-warning-foreground dark:text-warning',
      text: (
        <>
          <strong>{stats.lowStockCount}</strong> item(s) are running low on stock.
        </>
      ),
    },
    stats.staleStockCount > 0 && !dismissed.stale && {
      key: 'stale' as const,
      tone: 'border-chart-2/40 bg-chart-2/8 text-chart-2',
      text: (
        <>
          <strong>{stats.staleStockCount}</strong> item(s) haven&apos;t moved in over 2 months.
        </>
      ),
    },
  ].filter(Boolean) as { key: 'out' | 'low' | 'stale'; tone: string; text: React.ReactNode }[]

  return (
    <PageBody>
      <PageHeader
        eyebrow="Stock"
        title="Inventory"
        description="Track stock levels, restock items, and review every movement."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/inventory/movements">
                <History /> Movements
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={onExport} disabled={isLoading || filtered.length === 0}>
              <Download /> Export CSV
            </Button>
            <Button size="sm" onClick={openNew}>
              <Plus /> New item
            </Button>
          </>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <StatTile label="Total items" value={stats.totalItems} />
        <StatTile label="Total stock" value={stats.totalStock.toLocaleString()} />
        <StatTile label="Low stock" value={stats.lowStockCount} tone="warning" active={stats.lowStockCount > 0} />
        <StatTile label="Out of stock" value={stats.outOfStockCount} tone="destructive" active={stats.outOfStockCount > 0} />
        <StatTile label="Stale stock" value={stats.staleStockCount} tone="chart-2" active={stats.staleStockCount > 0} />
        <StatTile label="Stock value" value={formatZar(stats.totalValue)} fit />
        <StatTile label="Categories" value={stats.categories.length} />
      </div>

      {/* banners */}
      {banners.length > 0 && (
        <div className="flex flex-col gap-2">
          {banners.map((b) => (
            <div
              key={b.key}
              className={cn('flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm', b.tone)}
            >
              <AlertTriangle className="size-4 shrink-0" />
              <span className="flex-1">{b.text}</span>
              <button
                onClick={() => setStockFilter(b.key)}
                className="shrink-0 rounded px-2 py-0.5 text-xs font-semibold underline-offset-2 hover:underline"
              >
                View
              </button>
              <button
                onClick={() => setDismissed((d) => ({ ...d, [b.key]: true }))}
                className="shrink-0 rounded p-1 opacity-70 transition-opacity hover:opacity-100"
                aria-label="Dismiss"
              >
                <X className="size-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* filters */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search name, SKU, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="w-[200px]">
            <Combobox
              options={categoryOptions}
              value={category}
              onChange={setCategory}
              placeholder="All categories"
              searchPlaceholder="Filter category…"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={stockFilter === 'low'} onClick={() => toggleStock('low')} tone="warning">
            Low stock
          </FilterChip>
          <FilterChip active={stockFilter === 'out'} onClick={() => toggleStock('out')} tone="destructive">
            Out of stock
          </FilterChip>
          <FilterChip active={stockFilter === 'backordered'} onClick={() => toggleStock('backordered')} tone="destructive">
            Backordered
          </FilterChip>
          <FilterChip active={stockFilter === 'stale'} onClick={() => toggleStock('stale')} tone="chart-2">
            Stale
          </FilterChip>
          <span className="mx-1 h-5 w-px bg-border" />
          {/* Status filter: isolate active-only (default), inactive-only, or show all. */}
          <div className="inline-flex items-center gap-1 rounded-full border border-border p-0.5">
            {(['active', 'inactive', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors',
                  statusFilter === s
                    ? 'bg-primary/12 text-primary'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-accent/40 px-3.5 py-2.5 text-sm">
          <span className="font-medium">{selected.size} selected</span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => bulkActive.mutate({ ids: [...selected], active: true })} disabled={bulkActive.isPending}>
              <Power /> Activate
            </Button>
            <Button variant="outline" size="sm" onClick={() => bulkActive.mutate({ ids: [...selected], active: false })} disabled={bulkActive.isPending}>
              <Power /> Deactivate
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={async () => {
                const n = selected.size
                const ok = await confirm({
                  title: `Delete ${n} item${n === 1 ? '' : 's'}?`,
                  description: 'This permanently removes the selected inventory items and cannot be undone.',
                  confirmText: 'Delete',
                  destructive: true,
                })
                if (ok) bulkRemove.mutate([...selected])
              }}
              disabled={bulkRemove.isPending}
            >
              <Trash2 /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={clearSelection}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* table */}
      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertTriangle className="size-6 text-destructive" />
          <p className="text-sm font-medium">Couldn&apos;t load inventory</p>
          <p className="max-w-md text-sm text-muted-foreground">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw /> Retry
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="w-10 px-4 py-2.5">
                    <Checkbox
                      checked={allVisibleSelected}
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all on page"
                    />
                  </th>
                  <th className="px-4 py-2.5 font-medium">Item</th>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 text-right font-medium">Stock</th>
                  <th className="px-4 py-2.5 text-right font-medium">Alert at</th>
                  <th className="px-4 py-2.5 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2.5 text-right font-medium">Value</th>
                  <th className="w-10 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={8} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : paged.length > 0 ? (
                  paged.map((item) => {
                    const rowSelected = selected.has(item.id)
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'transition-colors hover:bg-accent/40',
                          rowSelected && 'bg-accent/30',
                          highlightId === item.id && 'bg-primary/10 ring-2 ring-inset ring-primary/60',
                          !item.is_active && 'opacity-55',
                        )}
                      >
                        <td className="px-4 py-3">
                          <Checkbox
                            checked={rowSelected}
                            onCheckedChange={() => toggleRow(item.id)}
                            aria-label={`Select ${item.name}`}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.name}</span>
                              {!item.is_active && (
                                <span className="rounded-full border border-border bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                                  Inactive
                                </span>
                              )}
                            </div>
                            {item.sku && <span className="mono text-xs text-muted-foreground">{item.sku}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {item.category ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{item.category}</span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <StockBadge item={item} />
                            <span className={cn('tabular font-semibold', isBackordered(item) && 'text-destructive')}>
                              {item.quantity.toLocaleString()}
                            </span>
                            <span className="text-xs text-muted-foreground">{item.unit}</span>
                          </div>
                        </td>
                        <td className="tabular px-4 py-3 text-right text-muted-foreground">
                          {item.low_stock_threshold.toLocaleString()}
                        </td>
                        <td className="tabular px-4 py-3 text-right text-muted-foreground">
                          {formatZar(item.unit_price)}
                        </td>
                        <td className="tabular px-4 py-3 text-right text-muted-foreground">
                          {item.unit_price != null ? formatZar(item.unit_price * item.quantity) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="Actions">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => openRestock(item)}>
                                <TrendingUp /> Add stock
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openHistory(item)}>
                                <History /> Movement history
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => openEdit(item)}>
                                <Pencil /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => toggleActive.mutate(item)}>
                                <Power /> {item.is_active ? 'Deactivate' : 'Reactivate'}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant="destructive"
                                onSelect={async () => {
                                  const ok = await confirm({
                                    title: 'Delete item?',
                                    description: `“${item.name}” will be permanently deleted. This cannot be undone.`,
                                    confirmText: 'Delete',
                                    destructive: true,
                                  })
                                  if (ok) remove.mutate(item)
                                }}
                              >
                                <Trash2 /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <Boxes className="size-5" />
                        </span>
                        <p className="text-sm font-medium">No items found</p>
                        <p className="text-sm text-muted-foreground">
                          {search || category || stockFilter !== 'none'
                            ? 'Try adjusting your filters.'
                            : 'Add your first inventory item to get started.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          {filtered.length > 0 && (
            <div className="flex flex-col items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row">
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="tabular">
                  {rangeStart}–{rangeEnd} of {filtered.length}
                </span>
                <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                  <SelectTrigger size="sm" className="h-8 w-[110px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s} / page
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={clampedPage === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                {visiblePages(clampedPage, totalPages).map((p) => (
                  <Button
                    key={p}
                    variant={p === clampedPage ? 'default' : 'outline'}
                    size="icon-sm"
                    className="tabular"
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === clampedPage ? 'page' : undefined}
                  >
                    {p}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={clampedPage >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ItemDialog item={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
      <RestockDialog item={restockItem} open={restockOpen} onOpenChange={setRestockOpen} />
      <MovementHistoryPanel item={historyItem} open={historyOpen} onOpenChange={setHistoryOpen} />
    </PageBody>
  )
}
