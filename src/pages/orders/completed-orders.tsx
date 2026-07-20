import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Download, Loader2, PackageCheck, RefreshCw } from 'lucide-react'
import type { Package } from '@/lib/models/package'
import { fetchCompletedOrders } from '@/lib/api/orders'
import { downloadPodsZip } from '@/lib/api/pod-export'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { displayStatusMeta } from '@/lib/status'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { formatDateTime, nameFromEmail } from '@/lib/format'
import { PackageDetailsPanel } from './package-details-panel'

export function CompletedOrdersPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detail, setDetail] = useState<Package | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const range = useMemo(
    () => ({
      dateFrom: from ? new Date(from).toISOString() : undefined,
      dateTo: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    }),
    [from, to],
  )

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ['orders', 'completed', range],
    queryFn: () => fetchCompletedOrders(range),
  })

  const rows = data?.packages ?? []
  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id))

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((p) => p.id)))

  async function downloadSelected() {
    const chosen = rows.filter((p) => selected.has(p.id))
    if (!chosen.length) return
    setDownloading(true)
    try {
      const res = await downloadPodsZip(chosen, 'pods.zip')
      if (res.zipped > 0) {
        toast.success(
          `Downloaded ${res.zipped} POD${res.zipped > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} skipped (no stored PDF)` : ''}.`,
        )
      } else {
        toast.warning('None of the selected packages have a stored POD PDF yet.')
      }
    } finally {
      setDownloading(false)
    }
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Dispatch"
        title="Completed orders"
        description="Collected and delivered packages — download proof-of-delivery documents."
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/orders">
                <ArrowLeft /> Orders
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
          </>
        }
      />

      {/* filters + bulk action */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
        </div>
        <PermissionButton permission="pod.export_bulk" onClick={downloadSelected} disabled={selected.size === 0 || downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          Download PODs{selected.size > 0 ? ` (${selected.size})` : ''}
        </PermissionButton>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load completed orders: {(error as Error)?.message}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="w-10 px-4 py-2.5">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                </th>
                <th className="px-4 py-2.5 font-medium">Tracking</th>
                <th className="px-4 py-2.5 font-medium">Receiver</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Completed</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
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
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(pkg.id)} onCheckedChange={() => toggle(pkg.id)} />
                      </td>
                      <td className="cursor-pointer px-4 py-3" onClick={() => { setDetail(pkg); setPanelOpen(true) }}>
                        <TrackingNumber value={pkg.reference} />
                      </td>
                      <td className="cursor-pointer px-4 py-3" onClick={() => { setDetail(pkg); setPanelOpen(true) }}>
                        <div className="flex items-center gap-2.5">
                          <ReceiverAvatar name={name} className="size-7" />
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{name}</span>
                            <span className="truncate text-xs text-muted-foreground">{pkg.receiver_email}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><StatusStamp status={pkg.status} label={displayStatusMeta(pkg).label} /></td>
                      <td className="px-4 py-3 text-muted-foreground">{formatDateTime(pkg.updated_at ?? pkg.created_at)}</td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <PackageCheck className="size-5" />
                      </span>
                      <p className="text-sm font-medium">No completed orders</p>
                      <p className="text-sm text-muted-foreground">Nothing collected or delivered in this range.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PackageDetailsPanel
        pkg={detail}
        receiverName={detail ? data?.names[detail.receiver_email?.toLowerCase()] : undefined}
        open={panelOpen}
        onOpenChange={setPanelOpen}
      />
    </PageBody>
  )
}
