import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { AlertCircle, CalendarClock, ChevronLeft, ChevronRight, Download, MoreHorizontal, Package as PackageIcon, PackageCheck, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import type { Package } from '@/lib/models/package'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getPackage } from '@/lib/api/packages'
import { ORDER_STATUS_FILTERS, useOrders } from '@/hooks/use-orders'
import { useCompanies } from '@/hooks/use-dashboard'
import { displayStatusMeta } from '@/lib/status'
import { useSettings } from '@/lib/settings-store'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { useAutoTour } from '@/hooks/use-auto-tour'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Combobox } from '@/components/ui/combobox'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { formatDateShort, nameFromEmail, timeAgo } from '@/lib/format'
import { PackageDetailsPanel } from './package-details-panel'
import { CreatePackageDialog } from './create-package-dialog'

const PAGE_SIZES = [10, 25, 50, 100]

function useDebounced<T>(value: T, delay = 350): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export function OrdersPage() {
  useAutoTour('orders')
  const [searchParams, setSearchParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(() => useSettings.getState().defaultOrdersFilter)
  const [company, setCompany] = useState('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const debouncedSearch = useDebounced(search)

  const companies = useCompanies()
  const companyOptions = useMemo(
    () => [
      { value: 'all', label: 'All companies' },
      ...(companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    ],
    [companies.data],
  )

  const query = useMemo(
    () => ({ page, pageSize, status, search: debouncedSearch, companyId: company === 'all' ? null : company }),
    [page, pageSize, status, debouncedSearch, company],
  )
  const { data, isLoading, isError, error, isFetching, refetch } = useOrders(query)

  // reset to page 1 on filter change
  useEffect(() => setPage(1), [status, debouncedSearch, pageSize, company])

  const [selected, setSelected] = useState<Package | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  // deep link: /orders?id=<uuid>
  useEffect(() => {
    const id = searchParams.get('id')
    if (!id) return
    const inPage = data?.packages.find((p) => p.id === id)
    if (inPage) {
      setSelected(inPage)
      setPanelOpen(true)
    } else {
      getPackage(id).then((r) => {
        if (r.success) {
          setSelected(r.data)
          setPanelOpen(true)
        }
      })
    }
    setSearchParams((p) => {
      p.delete('id')
      return p
    }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, data])

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, total)

  const openRow = (pkg: Package) => {
    setSelected(pkg)
    setPanelOpen(true)
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Dispatch"
        title="Orders"
        description="Every package in the network — track, dispatch, and prove delivery."
        actions={
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon-sm" aria-label="More">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/orders/completed"><PackageCheck /> Completed orders</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/pods/bulk-downloads"><Download /> Bulk POD downloads</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/orders/deleted"><Trash2 /> Deleted orders</Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} data-tour="orders-refresh">
              <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)} data-tour="orders-create">
              <Plus /> New package
            </Button>
          </>
        }
      />

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div data-tour="orders-search" className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search ref, PO, receiver, item…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div data-tour="orders-status" className="w-[200px]">
          <Combobox
            options={ORDER_STATUS_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
            value={status}
            onChange={setStatus}
            placeholder="All statuses"
            searchPlaceholder="Filter status…"
          />
        </div>
        <div className="w-[200px]">
          <Combobox
            options={companyOptions}
            value={company}
            onChange={setCompany}
            placeholder="All companies"
            searchPlaceholder="Filter companies…"
          />
        </div>
      </div>

      {/* table */}
      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
          <AlertCircle className="size-6 text-destructive" />
          <p className="text-sm font-medium">Couldn&apos;t load orders</p>
          <p className="max-w-md text-sm text-muted-foreground">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw /> Retry
          </Button>
        </div>
      ) : (
        <div data-tour="orders-table" className="overflow-hidden rounded-lg border">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Tracking</th>
                  <th className="px-4 py-2.5 font-medium">Receiver</th>
                  <th className="px-4 py-2.5 font-medium">PO</th>
                  <th className="px-4 py-2.5 text-center font-medium">Items</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={7} className="px-4 py-3">
                        <Skeleton className="h-6 w-full" />
                      </td>
                    </tr>
                  ))
                ) : data && data.packages.length > 0 ? (
                  data.packages.map((pkg) => {
                    const name = data.names[pkg.receiver_email?.toLowerCase()] || nameFromEmail(pkg.receiver_email)
                    return (
                      <tr
                        key={pkg.id}
                        onClick={() => openRow(pkg)}
                        className="cursor-pointer transition-colors hover:bg-accent/40"
                      >
                        <td className="px-4 py-3">
                          <TrackingNumber value={pkg.reference} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <ReceiverAvatar name={name} className="size-7" />
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate font-medium">{name}</span>
                              <span className="truncate text-xs text-muted-foreground">{pkg.receiver_email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {pkg.po_number ? (
                            <span className="mono text-xs text-muted-foreground">{pkg.po_number}</span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="tabular px-4 py-3 text-center text-muted-foreground">
                          {pkg.items?.length ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusStamp status={pkg.status} label={displayStatusMeta(pkg).label} />
                            {pkg.reschedule_requested && (
                              <span className="inline-flex items-center gap-1 rounded-[3px] border border-warning/45 bg-warning/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase leading-none tracking-[0.08em] text-warning-foreground dark:text-warning">
                                <CalendarClock className="size-3" /> Rescheduled
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDateShort(pkg.created_at)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{timeAgo(pkg.updated_at ?? pkg.created_at)}</td>
                      </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <PackageIcon className="size-5" />
                        </span>
                        <p className="text-sm font-medium">No packages found</p>
                        <p className="text-sm text-muted-foreground">
                          {debouncedSearch || status !== 'all' || company !== 'all'
                            ? 'Try adjusting your filters.'
                            : 'Create your first package to get started.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* pagination */}
          {total > 0 && (
            <div data-tour="orders-pagination" className="flex flex-col items-center justify-between gap-3 border-t bg-muted/20 px-4 py-3 text-sm sm:flex-row">
              <div className="flex items-center gap-3 text-muted-foreground">
                <span className="tabular">
                  {rangeStart}–{rangeEnd} of {total}
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
                  disabled={page === 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft />
                </Button>
                <span className="tabular px-2 text-muted-foreground">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <PackageDetailsPanel
        pkg={selected}
        receiverName={selected ? data?.names[selected.receiver_email?.toLowerCase()] : undefined}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />

      <CreatePackageDialog open={createOpen} onOpenChange={setCreateOpen} />
    </PageBody>
  )
}
