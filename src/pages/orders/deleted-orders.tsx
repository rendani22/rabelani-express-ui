import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, RotateCcw, ShieldX, Trash2 } from 'lucide-react'
import type { Package } from '@/lib/models/package'
import { canDeleteOrders, restorePackage } from '@/lib/api/packages'
import { fetchDeletedOrders } from '@/lib/api/orders'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { formatDateTime, nameFromEmail } from '@/lib/format'

function RestoreButton({ pkg, onDone }: { pkg: Package; onDone: () => void }) {
  const restore = useMutation({
    mutationFn: () => restorePackage(pkg.id),
    onSuccess: (res) => {
      if (res.success) {
        toast.success(`Order ${pkg.reference} restored.`)
        onDone()
      } else {
        toast.error(reportError(res.error, 'Could not restore the order.', { op: 'orders.restore' }))
      }
    },
    onError: (e) => toast.error(reportError(e, 'Something went wrong while restoring the order.', { op: 'orders.restore' })),
  })
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={restore.isPending}
      onClick={() => {
        if (confirm(`Restore order ${pkg.reference}? Linked inventory stock will be re-deducted.`)) {
          restore.mutate()
        }
      }}
    >
      {restore.isPending ? <Loader2 className="animate-spin" /> : <RotateCcw />} Restore
    </Button>
  )
}

export function DeletedOrdersPage() {
  const qc = useQueryClient()
  const admin = useQuery({ queryKey: ['can-delete-orders'], queryFn: canDeleteOrders })
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['orders', 'deleted'],
    queryFn: fetchDeletedOrders,
    enabled: admin.data === true,
  })

  const afterRestore = () => {
    refetch()
    qc.invalidateQueries({ queryKey: ['orders'] })
    qc.invalidateQueries({ queryKey: ['dashboard'] })
  }

  const header = (
    <PageHeader
      eyebrow="Dispatch"
      title="Deleted orders"
      description="Soft-deleted packages. Restoring re-deducts any linked inventory."
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orders">
            <ArrowLeft /> Orders
          </Link>
        </Button>
      }
    />
  )

  if (admin.isLoading) {
    return (
      <PageBody>
        {header}
        <Skeleton className="h-64 rounded-lg" />
      </PageBody>
    )
  }

  if (!admin.data) {
    return (
      <PageBody>
        {header}
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShieldX className="size-5" />
          </span>
          <p className="text-sm font-medium">Admins only</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            The recycle bin is restricted to admin accounts.
          </p>
        </div>
      </PageBody>
    )
  }

  const rows = data?.packages ?? []

  return (
    <PageBody>
      {header}
      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load deleted orders: {(error as Error)?.message}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Tracking</th>
                <th className="px-4 py-2.5 font-medium">Receiver</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Deleted</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-6 w-full" />
                    </td>
                  </tr>
                ))
              ) : rows.length > 0 ? (
                rows.map((pkg) => {
                  const name = data?.names[pkg.receiver_email?.toLowerCase()] || nameFromEmail(pkg.receiver_email)
                  return (
                    <tr key={pkg.id} className="transition-colors hover:bg-accent/40">
                      <td className="px-4 py-3"><TrackingNumber value={pkg.reference} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <ReceiverAvatar name={name} className="size-7" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{name}</span>
                            <span className="truncate text-xs text-muted-foreground">{pkg.receiver_email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusStamp status={pkg.status} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(pkg.deleted_at)}</td>
                      <td className="px-4 py-3 text-right">
                        <RestoreButton pkg={pkg} onDone={afterRestore} />
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Trash2 className="size-5" />
                      </span>
                      <p className="text-sm font-medium">Recycle bin is empty</p>
                      <p className="text-sm text-muted-foreground">No soft-deleted orders.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageBody>
  )
}
