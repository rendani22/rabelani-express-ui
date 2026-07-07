import { Loader2, PackageX } from 'lucide-react'
import { useMyPackages } from '@/hooks/use-my-packages'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { StatusStamp, TrackingNumber, SectionLabel } from '@/components/dispatch'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDateTime } from '@/lib/format'

export function MyPackagesPage() {
  const { data: principal } = useCurrentPrincipal()
  const { data: packages, isLoading, isError } = useMyPackages()

  const role = principal?.kind === 'customer' ? principal.customer.role : undefined
  const scopeLabel =
    role === 'buyer' ? 'All packages for your company'
    : role === 'runner' ? 'Packages assigned to you'
    : 'Your packages'

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
      ) : !packages || packages.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center text-muted-foreground">
          <PackageX className="size-7" />
          <p className="text-sm">No packages to show yet.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {packages.map((p) => (
            <li key={p.id}>
              <Card className="flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex flex-col gap-1">
                    <TrackingNumber value={p.reference} />
                    {p.po_number && (
                      <span className="text-xs text-muted-foreground">PO {p.po_number}</span>
                    )}
                  </div>
                  <StatusStamp status={p.status} />
                </div>

                {p.items.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <SectionLabel>Items</SectionLabel>
                    <ul className="flex flex-col gap-1 text-sm">
                      {p.items.map((it, i) => (
                        <li key={i} className="flex justify-between gap-3">
                          <span className="text-foreground">{it.description}</span>
                          <span className="tabular-nums text-muted-foreground">×{it.quantity}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {p.customer_notes && (
                  <div className="flex flex-col gap-1.5">
                    <SectionLabel>Notes</SectionLabel>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">{p.customer_notes}</p>
                  </div>
                )}

                <p className="text-xs text-muted-foreground/70">
                  Created {formatDateTime(p.created_at)}
                </p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
