import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Download,
  FileCheck2,
  Loader2,
  Mail,
  PackageX,
  RotateCw,
  Search,
  User,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useMyPackageGroups,
  useMyPackageStatusCounts,
  useMyPackagesTotal,
} from '@/hooks/use-my-packages'
import { useDebounced } from '@/hooks/use-debounced'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { StatusStamp, SectionLabel, RouteTimeline } from '@/components/dispatch'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDateTime } from '@/lib/format'
import { PACKAGE_STATUS, type PackageStatus, customerStatusMeta } from '@/lib/status'
import { customerRouteStops } from '@/lib/package-timeline'
import { reportError } from '@/lib/logger'
import { downloadCustomerPod } from '@/lib/api/customer-pod'
import { rescheduleDelivery, type CustomerPackage } from '@/lib/api/customer-packages'

/** The depot's public support address — the same one the emails and app header use. */
const SUPPORT_EMAIL = 'support@rabelani.co.za'

/**
 * Inline links. The brand orange rides the underline rather than the text:
 * cargo orange is 3.3:1 on a light surface, which fails AA below 18px, so the
 * text stays ink and the accent marks it as a link.
 */
const LINK_CLASS =
  'rounded-sm font-medium text-foreground underline decoration-primary decoration-2 underline-offset-4 outline-none transition-colors hover:decoration-primary/60 focus-visible:ring-[3px] focus-visible:ring-ring/50'

function PackageItems({ items }: { items: CustomerPackage['items'] }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="text-foreground">{it.description}</span>
          <span className="mono shrink-0 text-muted-foreground">×{it.quantity}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Proof-of-delivery download, shown once an order is collected/delivered.
 * Styled as a tear-off docket stub — a "verified" delivered-green stamp glyph
 * (the one place green is earned), a stencil label, and a mono PDF line — so it
 * reads as retrieving a signed artifact, not a generic download button.
 */
function DownloadPodButton({ pkg }: { pkg: CustomerPackage }) {
  const [downloading, setDownloading] = useState(false)
  async function onClick() {
    setDownloading(true)
    try {
      await downloadCustomerPod(pkg.id, pkg.po_number)
    } catch (e) {
      toast.error(reportError(e, 'Could not download the proof of delivery.', { op: 'customer.pod.download' }))
    } finally {
      setDownloading(false)
    }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={downloading}
      aria-label="Download proof of delivery PDF"
      className="group mt-3 inline-flex items-center gap-2.5 self-end rounded-md border border-border bg-muted/40 py-1.5 pl-1.5 pr-3.5 text-left transition-[background-color,transform] duration-150 hover:bg-muted/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <span className="flex size-7 items-center justify-center rounded-[4px] border border-success/40 bg-success/12 text-success">
        {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck2 className="size-3.5" />}
      </span>
      <span className="flex flex-col gap-0.5 leading-none">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground/80">Proof of delivery</span>
        <span className="mono text-[11px] tracking-tight text-muted-foreground">
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </span>
      </span>
      <Download className="ml-1.5 size-4 text-muted-foreground transition-colors group-hover:text-foreground" />
    </button>
  )
}

/**
 * Reschedule request for an out-for-delivery parcel. Only the actual receiver
 * sees it (server also enforces this). Sends the parcel back to the dispatch
 * queue and records the reason for the warehouse; the driver won't attempt it.
 */
function RescheduleButton({ pkg }: { pkg: CustomerPackage }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const reasonId = useId()

  const mut = useMutation({
    mutationFn: () => rescheduleDelivery(pkg.id, reason.trim()),
    onSuccess: () => {
      toast.success('Reschedule requested — the warehouse will arrange a new delivery.')
      qc.invalidateQueries({ queryKey: ['customer-packages'] })
      setOpen(false)
      setReason('')
    },
    onError: (e) =>
      toast.error(reportError(e, 'Could not request a reschedule.', { op: 'customer.reschedule' })),
  })

  return (
    <>
      {/* The one action on this card — it carries the accent. The POD download
          stays deliberately neutral: retrieving a record isn't acting on one. */}
      <Button size="sm" className="mt-3 self-start" onClick={() => setOpen(true)}>
        <CalendarClock /> Request reschedule
      </Button>

      <Dialog open={open} onOpenChange={(o) => !mut.isPending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reschedule this delivery?</DialogTitle>
            <DialogDescription>
              The driver won&apos;t attempt delivery today, and the request can&apos;t be undone once
              sent. Tell us why so the warehouse can arrange a better time.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={reasonId}>Why do you need a new time?</Label>
            <Textarea
              id={reasonId}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. No one available today — please deliver Thursday morning."
              rows={3}
              maxLength={600}
            />
            <span
              className={cn(
                'mono self-end text-[11px] text-muted-foreground',
                reason.length < 500 && 'invisible',
              )}
              aria-hidden={reason.length < 500}
            >
              {reason.length}/600
            </span>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={mut.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending || !reason.trim()}>
              {mut.isPending && <Loader2 className="animate-spin" />} Request reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * The parcel's journey, worded for the customer. While a parcel is still moving
 * this IS the answer they came for, so it stays open. Once it has landed the
 * journey is history and the proof of delivery is the point — so it collapses,
 * and the card stays scannable for someone reading back through old orders.
 */
function CustomerTimeline({ pkg }: { pkg: CustomerPackage }) {
  const stops = useMemo(() => customerRouteStops(pkg), [pkg])
  const landed = pkg.status === PACKAGE_STATUS.COLLECTED || pkg.status === PACKAGE_STATUS.DELIVERED

  if (!landed) return <RouteTimeline stops={stops} className="mb-4" />

  return (
    <details className="group mb-4">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-0.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 text-muted-foreground transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none" />
        <SectionLabel className="cursor-pointer">Journey</SectionLabel>
      </summary>
      <div className="pt-3">
        <RouteTimeline stops={stops} />
      </div>
    </details>
  )
}

/** One package's detail inside a group (status + journey + items + notes). */
function PackageRow({ pkg, showDivider }: { pkg: CustomerPackage; showDivider: boolean }) {
  const podAvailable = pkg.status === PACKAGE_STATUS.COLLECTED || pkg.status === PACKAGE_STATUS.DELIVERED
  // A reschedule already asked for can't be asked for twice — the request
  // persists, so the notice below replaces the button rather than joining it.
  const canReschedule =
    pkg.status === PACKAGE_STATUS.IN_TRANSIT && pkg.is_receiver && !pkg.reschedule_requested
  const meta = customerStatusMeta(pkg.status)
  // Only worth showing when it actually differs — otherwise it's the same date twice.
  const updated = pkg.updated_at && pkg.updated_at !== pkg.created_at ? pkg.updated_at : null

  return (
    <div className={showDivider ? 'flex flex-col border-t pt-4' : 'flex flex-col'}>
      {/* The status leads: it's the question this page exists to answer. */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <StatusStamp status={pkg.status} label={meta.label} tone={meta.tone} />
        {/* Only a buyer ever sees a parcel that isn't theirs — name whose it is
            so a mixed list is readable. Your own parcels stay unlabelled. */}
        {!pkg.is_receiver && pkg.receiver_name && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-foreground/70">
            <User className="size-3 shrink-0" /> <span className="truncate">{pkg.receiver_name}</span>
          </span>
        )}
      </div>

      {/* Dates are demoted and labelled — an unlabelled date next to "On the way"
          reads as an ETA, which is exactly what it isn't. */}
      <dl className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
        <div className="flex items-baseline gap-1.5">
          <dt>Ordered</dt>
          <dd className="mono">{formatDateTime(pkg.created_at)}</dd>
        </div>
        {updated && (
          <div className="flex items-baseline gap-1.5">
            <dt>Last updated</dt>
            <dd className="mono">{formatDateTime(updated)}</dd>
          </div>
        )}
      </dl>

      <CustomerTimeline pkg={pkg} />

      <PackageItems items={pkg.items} />

      {pkg.customer_notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{pkg.customer_notes}</p>
      )}

      {/* The record of the customer's own request. Amber is the system's
          "waiting" tone; it persists whatever the parcel does next, because the
          person who asked is the person who most needs to see it stuck. */}
      {pkg.reschedule_requested && (
        <p className="mt-3 flex items-start gap-2 rounded-md border border-warning/45 bg-warning/10 px-2.5 py-2 text-xs text-warning-foreground dark:text-warning">
          <CalendarClock className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>Reschedule requested — the depot will arrange a new delivery time.</span>
        </p>
      )}

      {podAvailable && <DownloadPodButton pkg={pkg} />}
      {canReschedule && <RescheduleButton pkg={pkg} />}
    </div>
  )
}

/** Lifecycle order for the status filter chips (draft → returned). */
const CUSTOMER_STATUS_ORDER: PackageStatus[] = [
  PACKAGE_STATUS.DRAFT,
  PACKAGE_STATUS.PENDING,
  PACKAGE_STATUS.NOTIFIED,
  PACKAGE_STATUS.IN_TRANSIT,
  PACKAGE_STATUS.READY_FOR_COLLECTION,
  PACKAGE_STATUS.DELIVERED,
  PACKAGE_STATUS.COLLECTED,
  PACKAGE_STATUS.RETURNED,
]

type StatusFilter = 'all' | PackageStatus

/**
 * One filter pill: customer-facing label + a count badge. Selected state is an
 * orange tint, not an accent fill — the orange belongs to the action on the
 * card, not to a filter. The label stays ink rather than orange: cargo orange
 * is only 3.3:1 on a light surface, so orange-on-tint would fail AA at this
 * size. The tint and border carry the signal; the ink carries the text.
 * Targets are thumb-sized on a phone and tighten up on a desktop.
 */
function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs font-medium outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:min-h-8',
        active
          ? 'border-primary/40 bg-primary/12 text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {label}
      <span
        className={cn(
          'mono rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none',
          active ? 'bg-primary/20 text-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {count}
      </span>
    </button>
  )
}

/**
 * End of the list. Loads the next page when it scrolls into view, and stays a
 * real button so the list is reachable without a mouse wheel — an auto-only
 * sentinel is unreachable by keyboard and invisible to a screen reader.
 */
function LoadMoreGroups({
  isFetching,
  onLoad,
}: {
  isFetching: boolean
  onLoad: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    // Without an observer the button below is still the way forward, so there is
    // nothing to fall back to — just skip the automatic part.
    if (!el || typeof IntersectionObserver === 'undefined') return
    // Root stays the viewport. It cannot be the sm+ scroll region: below `sm`
    // that element does not scroll, so its rect would cover the whole list and
    // the sentinel would report as visible immediately, loading every page at
    // once. The margin therefore only buys a head start while the page itself
    // scrolls; inside the scroll region the container clips the sentinel and the
    // next page loads as it is reached.
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoad()
      },
      { rootMargin: '400px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [onLoad])

  return (
    <div ref={ref} className="flex justify-center pt-1">
      <Button variant="outline" size="sm" onClick={onLoad} disabled={isFetching}>
        {isFetching ? <Loader2 className="animate-spin" /> : <ChevronDown />}
        {isFetching ? 'Loading…' : 'Load more'}
      </Button>
    </div>
  )
}

export function MyPackagesPage() {
  const { data: principal } = useCurrentPrincipal()

  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  // The search now costs a round trip, so wait for a pause in typing.
  const debouncedQuery = useDebounced(query)

  const { data: total } = useMyPackagesTotal()
  const { data: counts } = useMyPackageStatusCounts(debouncedQuery)
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMyPackageGroups({
    query: debouncedQuery,
    status: status === 'all' ? null : status,
  })

  const filtered = useMemo(() => data?.pages.flat() ?? [], [data])

  // Only show chips for statuses that are actually present, in lifecycle order.
  const presentStatuses = useMemo(
    () => CUSTOMER_STATUS_ORDER.filter((s) => (counts?.get(s) ?? 0) > 0),
    [counts],
  )
  const searchedTotal = useMemo(
    () => [...(counts?.values() ?? [])].reduce((a, b) => a + b, 0),
    [counts],
  )

  // If the active status disappears from scope (e.g. after a search), reset it.
  useEffect(() => {
    if (status !== 'all' && counts && !counts.has(status)) setStatus('all')
  }, [status, counts])

  const loadNext = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage()
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const hasAnyOrders = (total ?? 0) > 0
  const hasActiveFilters = query.trim() !== '' || status !== 'all'

  const role = principal?.kind === 'customer' ? principal.customer.role : undefined
  const scopeLabel =
    role === 'buyer' ? 'Your orders, and those of the end users assigned to you'
    : role === 'runner' ? 'Orders assigned to you'
    : 'Your orders'

  return (
    // The heading and filters are fixed chrome; only the list below scrolls, so
    // the search and status chips stay reachable however far down the list you
    // are. Below `sm` the shell scrolls normally and this is a plain column.
    <div className="flex flex-col gap-6 sm:h-full sm:min-h-0">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My packages</h1>
        <p className="text-sm text-muted-foreground">{scopeLabel}</p>
      </div>

      {!isLoading && !isError && hasAnyOrders && (
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by PO number…"
              aria-label="Search by PO number"
              className="pl-9 pr-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-0.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {presentStatuses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
              <FilterChip
                label="All"
                count={searchedTotal}
                active={status === 'all'}
                onClick={() => setStatus('all')}
              />
              {presentStatuses.map((s) => (
                <FilterChip
                  key={s}
                  label={customerStatusMeta(s).label}
                  count={counts?.get(s) ?? 0}
                  active={status === s}
                  onClick={() => setStatus(s)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* The scroll region. `-mx-1 px-1` keeps card focus rings from clipping:
          overflow-y:auto forces overflow-x to auto, so a ring drawn outside a
          full-width card would otherwise trigger a horizontal scrollbar. */}
      <div className="flex flex-col sm:-mx-1 sm:min-h-0 sm:flex-1 sm:overflow-y-auto sm:px-1 sm:pb-8">
      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : isError ? (
        <Card className="flex flex-col items-start gap-3 p-5">
          <p className="flex items-center gap-2.5 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4 shrink-0" aria-hidden />
            Could not load your packages.
          </p>
          <p className="text-sm text-muted-foreground">
            This is usually temporary. Try again in a moment — if it keeps happening,{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK_CLASS}>
              contact the depot
            </a>
            .
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RotateCw /> Try again
          </Button>
        </Card>
      ) : !hasAnyOrders ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <PackageX className="size-7 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">No orders to show yet.</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Orders appear here as soon as the depot registers them, and you&apos;ll get an email when
            one is on its way.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className={cn(LINK_CLASS, 'inline-flex items-center gap-1.5 text-xs')}>
            <Mail className="size-3.5" aria-hidden /> Expecting an order?
          </a>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <Search className="size-7" aria-hidden />
          <p className="text-sm">
            {query.trim()
              ? `No orders match “${query.trim()}”.`
              : 'No orders with this status.'}
          </p>
          {query.trim() && (
            <p className="max-w-sm text-xs">Search matches PO numbers — not item names.</p>
          )}
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery('')
                setStatus('all')
              }}
            >
              Clear filters
            </Button>
          )}
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3">
            {filtered.map((group) => (
              <li key={group.key}>
                <Card className="flex flex-col gap-4 p-5">
                  <div className="flex items-baseline justify-between gap-3">
                    {group.po ? (
                      <div className="flex items-baseline gap-2">
                        <SectionLabel>PO</SectionLabel>
                        <span className="mono text-sm font-medium tracking-tight text-foreground/80">
                          {group.po}
                        </span>
                      </div>
                    ) : (
                      <SectionLabel>Order</SectionLabel>
                    )}
                    {group.packages.length > 1 && (
                      <span className="text-xs text-muted-foreground">
                        {group.packages.length} packages
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-4">
                    {group.packages.map((pkg, i) => (
                      <PackageRow key={pkg.id} pkg={pkg} showDivider={i > 0} />
                    ))}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {hasNextPage && <LoadMoreGroups isFetching={isFetchingNextPage} onLoad={loadNext} />}
        </div>
      )}
      </div>
    </div>
  )
}
