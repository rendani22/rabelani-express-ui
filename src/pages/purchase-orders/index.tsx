import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertCircle, ClipboardList, Plus, RefreshCw, Search, X } from 'lucide-react'
import type { PurchaseOrderFilters } from '@/lib/api/purchase-orders'
import { computePurchaseOrderStats, filterPurchaseOrders, loadPurchaseOrders } from '@/lib/api/purchase-orders'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { useAutoTour } from '@/hooks/use-auto-tour'
import { useCompanies } from '@/hooks/use-dashboard'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { PoCard } from './po-card'
import { CreatePoDialog } from './create-po-dialog'
import { EditPoDialog } from './edit-po-dialog'

type StatusKey = NonNullable<PurchaseOrderFilters['status']>

const STATUS_TABS: { key: StatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'draft', label: 'Draft' },
  { key: 'mixed', label: 'Mixed' },
]

function StatTile({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: 'chart-2' | 'success' | 'primary' }) {
  const toneText =
    tone === 'chart-2' ? 'text-chart-2' : tone === 'success' ? 'text-success' : tone === 'primary' ? 'text-primary' : 'text-foreground'
  const toneBorder =
    tone === 'chart-2' ? 'border-chart-2/30' : tone === 'success' ? 'border-success/30' : tone === 'primary' ? 'border-primary/30' : 'border-border'
  return (
    <div className={cn('flex flex-col gap-0.5 rounded-lg border bg-card p-4', toneBorder)}>
      <span className={cn('tabular text-2xl font-semibold leading-none', toneText)}>{value}</span>
      <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="text-[11px] text-muted-foreground">{sub}</span>
    </div>
  )
}

export function PurchaseOrdersPage() {
  useAutoTour('purchase-orders')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusKey>('all')
  const [company, setCompany] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editPo, setEditPo] = useState<string | null>(null)
  const [editOpen, setEditOpen] = useState(false)

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ['purchase-orders'],
    queryFn: loadPurchaseOrders,
  })

  const companies = useCompanies()
  const companyOptions = useMemo(
    () => [
      { value: 'all', label: 'All companies' },
      ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [companies.data],
  )

  const orders = useMemo(() => data ?? [], [data])
  const stats = useMemo(() => computePurchaseOrderStats(orders), [orders])
  const filtered = useMemo(
    () => filterPurchaseOrders(orders, { search, status, company }),
    [orders, search, status, company],
  )

  const openEdit = (poNumber: string) => {
    setEditPo(poNumber)
    setEditOpen(true)
  }

  const clearFilters = () => {
    setSearch('')
    setStatus('all')
    setCompany('all')
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Procurement"
        title="Global PO"
        description="Every purchase order with its linked orders and inventory."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
            <PermissionButton permission="purchase_orders.create" size="sm" onClick={() => setCreateOpen(true)} data-tour="po-create">
              <Plus /> Create PO
            </PermissionButton>
          </>
        }
      />

      {/* stats */}
      <div data-tour="po-stats" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Total POs" value={stats.totalPOs} sub="All time" />
        <StatTile label="In progress" value={stats.activePOs} sub="Active POs" tone="chart-2" />
        <StatTile label="Completed" value={stats.completedPOs} sub="Fulfilled" tone="success" />
        <StatTile label="Draft" value={stats.draftPOs} sub="Not yet sent" />
        <StatTile label="Orders" value={stats.totalPackages} sub="Linked packages" />
        <StatTile label="Inventory" value={stats.totalInventoryItems} sub="Linked items" tone="primary" />
      </div>

      {/* filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div data-tour="po-search" className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search PO, order ref, receiver, inventory…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="w-full shrink-0 sm:w-[210px]">
          <Combobox
            options={companyOptions}
            value={company}
            onChange={setCompany}
            placeholder="All companies"
            searchPlaceholder="Filter companies…"
          />
        </div>
        <div data-tour="po-status" className="flex shrink-0 rounded-md border p-0.5">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                status === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="text-sm font-medium">Couldn&apos;t load purchase orders</p>
          <p className="max-w-md text-sm text-muted-foreground">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw /> Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[76px] rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ClipboardList className="size-6" />
          </span>
          <p className="text-sm font-medium">{search || status !== 'all' || company !== 'all' ? 'No results found' : 'No purchase orders yet'}</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            {search || status !== 'all' || company !== 'all'
              ? 'Try adjusting your search or filters.'
              : 'Purchase orders appear here once created. Use Create PO to add your first.'}
          </p>
          {(search || status !== 'all' || company !== 'all') && (
            <Button variant="outline" size="sm" onClick={clearFilters}>
              <X /> Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div data-tour="po-list" className="flex flex-col gap-3">
          {filtered.map((po) => (
            <PoCard key={po.poNumber} po={po} onEdit={openEdit} />
          ))}
        </div>
      )}

      <CreatePoDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditPoDialog poNumber={editPo} open={editOpen} onOpenChange={setEditOpen} />
    </PageBody>
  )
}
