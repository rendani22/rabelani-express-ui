import { useMemo } from 'react'
import { Loader2, PackageX } from 'lucide-react'
import { useMyPackages } from '@/hooks/use-my-packages'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { StatusStamp, SectionLabel } from '@/components/dispatch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'
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

/** One package's detail inside a group (status + items + notes), no reference. */
function PackageRow({ pkg, showDivider }: { pkg: CustomerPackage; showDivider: boolean }) {
  return (
    <div className={showDivider ? 'border-t pt-4' : undefined}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">{formatDateTime(pkg.created_at)}</span>
        <StatusStamp status={pkg.status} />
      </div>
      <PackageItems items={pkg.items} />
      {pkg.customer_notes && (
        <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{pkg.customer_notes}</p>
      )}
    </div>
  )
}

export function MyPackagesPage() {
  const { data: principal } = useCurrentPrincipal()
  const { data: packages, isLoading, isError } = useMyPackages()

  const groups = useMemo(() => groupByPo(packages ?? []), [packages])

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
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((group) => (
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
