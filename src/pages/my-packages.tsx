import { useMemo, useState } from 'react'
import { Download, FileCheck2, Loader2, PackageX, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { useMyPackages } from '@/hooks/use-my-packages'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { StatusStamp, SectionLabel } from '@/components/dispatch'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'
import { PACKAGE_STATUS, customerStatusMeta } from '@/lib/status'
import { reportError } from '@/lib/logger'
import { downloadCustomerPod } from '@/lib/api/customer-pod'
import type { CustomerPackage } from '@/lib/api/customer-packages'

/** A PO grouping (po set) or a standalone package (po null → key by id). */
interface PackageGroup {
  key: string
  po: string | null
  packages: CustomerPackage[]
}

/** Group packages by PO number; packages without a PO stand alone. */
function groupByPo(packages: CustomerPackage[]): PackageGroup[] {
  const byPo = new Map<string, CustomerPackage[]>()
  const standalone: PackageGroup[] = []

  for (const pkg of packages) {
    const po = pkg.po_number?.trim()
    if (po) {
      const list = byPo.get(po) ?? []
      list.push(pkg)
      byPo.set(po, list)
    } else {
      standalone.push({ key: pkg.id, po: null, packages: [pkg] })
    }
  }

  const poGroups: PackageGroup[] = [...byPo.entries()].map(([po, pkgs]) => ({ key: `po:${po}`, po, packages: pkgs }))
  // Newest first, by the most recent package in each group.
  const recency = (g: PackageGroup) => Math.max(...g.packages.map((p) => Date.parse(p.created_at)))
  return [...poGroups, ...standalone].sort((a, b) => recency(b) - recency(a))
}

function PackageItems({ items }: { items: CustomerPackage['items'] }) {
  if (items.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {items.map((it, i) => (
        <li key={i} className="flex justify-between gap-3">
          <span className="text-foreground">{it.description}</span>
          <span className="tabular-nums text-muted-foreground">×{it.quantity}</span>
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
      className="group mt-3 inline-flex items-center gap-2.5 self-start rounded-md border border-border bg-muted/40 py-1.5 pl-1.5 pr-3.5 text-left transition-[background-color,transform] duration-150 hover:bg-muted/70 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
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

/** One package's detail inside a group (status + items + notes), no reference. */
function PackageRow({ pkg, showDivider }: { pkg: CustomerPackage; showDivider: boolean }) {
  const podAvailable = pkg.status === PACKAGE_STATUS.COLLECTED || pkg.status === PACKAGE_STATUS.DELIVERED
  return (
    <div className={showDivider ? 'flex flex-col border-t pt-4' : 'flex flex-col'}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{formatDateTime(pkg.created_at)}</span>
        {(() => {
          const s = customerStatusMeta(pkg.status)
          return <StatusStamp status={pkg.status} label={s.label} tone={s.tone} />
        })()}
      </div>
      <PackageItems items={pkg.items} />
      {pkg.customer_notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{pkg.customer_notes}</p>
      )}
      {podAvailable && <DownloadPodButton pkg={pkg} />}
    </div>
  )
}

export function MyPackagesPage() {
  const { data: principal } = useCurrentPrincipal()
  const { data: packages, isLoading, isError } = useMyPackages()

  const groups = useMemo(() => groupByPo(packages ?? []), [packages])

  const [query, setQuery] = useState('')
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.po?.toLowerCase().includes(q))
  }, [groups, query])

  const role = principal?.kind === 'customer' ? principal.customer.role : undefined
  const scopeLabel =
    role === 'buyer' ? 'All orders for your company'
    : role === 'runner' ? 'Orders assigned to you'
    : 'Your orders'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">My packages</h1>
        <p className="text-sm text-muted-foreground">{scopeLabel}</p>
      </div>

      {!isLoading && !isError && groups.length > 0 && (
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
              className="absolute right-1 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
        </div>
      ) : isError ? (
        <Card className="flex items-center gap-3 p-5 text-sm text-destructive">
          <Loader2 className="size-4" /> Could not load your packages. Please try again shortly.
        </Card>
      ) : groups.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <PackageX className="size-7" />
          <p className="text-sm">No orders to show yet.</p>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <Search className="size-7" />
          <p className="text-sm">No orders match “{query.trim()}”.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((group) => (
            <li key={group.key}>
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex items-baseline justify-between gap-3">
                  {group.po ? (
                    <div className="flex flex-col gap-0.5">
                      <SectionLabel>Purchase order</SectionLabel>
                      <span className="font-mono text-base font-semibold tracking-tight">{group.po}</span>
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
      )}
    </div>
  )
}
