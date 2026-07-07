import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, FileDown, Loader2 } from 'lucide-react'
import { fetchCompletedOrders } from '@/lib/api/orders'
import { downloadPodsZip } from '@/lib/api/pod-export'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { formatDateShort, nameFromEmail } from '@/lib/format'
import { cn } from '@/lib/utils'

type QuickRange = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek'

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function quickRange(kind: QuickRange): { from: string; to: string } {
  const now = new Date()
  const start = new Date(now)
  const end = new Date(now)
  if (kind === 'yesterday') {
    start.setDate(start.getDate() - 1)
    end.setDate(end.getDate() - 1)
  } else if (kind === 'thisWeek') {
    start.setDate(start.getDate() - start.getDay())
  } else if (kind === 'lastWeek') {
    start.setDate(start.getDate() - start.getDay() - 7)
    end.setDate(end.getDate() - end.getDay() - 1)
  }
  return { from: isoDay(start), to: isoDay(end) }
}

export function BulkPodDownloadsPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [active, setActive] = useState<QuickRange | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [downloading, setDownloading] = useState(false)

  const range = useMemo(
    () => ({
      dateFrom: from ? new Date(from).toISOString() : undefined,
      dateTo: to ? new Date(to + 'T23:59:59').toISOString() : undefined,
    }),
    [from, to],
  )

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pods', 'completed', range],
    queryFn: () => fetchCompletedOrders(range),
  })

  const rows = data?.packages ?? []
  const allSelected = rows.length > 0 && rows.every((p) => selected.has(p.id))

  const applyQuick = (kind: QuickRange) => {
    const r = quickRange(kind)
    setFrom(r.from)
    setTo(r.to)
    setActive(kind)
  }

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  async function download() {
    const chosen = rows.filter((p) => selected.has(p.id))
    if (!chosen.length) return
    setDownloading(true)
    try {
      const res = await downloadPodsZip(chosen, 'pods.zip')
      if (res.zipped > 0) {
        toast.success(`Downloaded ${res.zipped} POD${res.zipped > 1 ? 's' : ''}${res.skipped ? `, ${res.skipped} without a POD record skipped` : ''}.`)
      } else {
        toast.warning('None of the selected orders have a proof-of-delivery record.')
      }
    } finally {
      setDownloading(false)
    }
  }

  const QUICK: { key: QuickRange; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'thisWeek', label: 'This week' },
    { key: 'lastWeek', label: 'Last week' },
  ]

  return (
    <PageBody>
      <PageHeader
        eyebrow="Proof of delivery"
        title="Bulk POD downloads"
        description="Select completed orders and download their proof-of-delivery documents as a zip."
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1.5 self-end rounded-md border p-0.5">
            {QUICK.map((q) => (
              <button
                key={q.key}
                onClick={() => applyQuick(q.key)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  active === q.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {q.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setActive(null) }} className="w-40" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setActive(null) }} className="w-40" />
          </div>
        </div>
        <Button onClick={download} disabled={selected.size === 0 || downloading}>
          {downloading ? <Loader2 className="animate-spin" /> : <Download />}
          Download{selected.size > 0 ? ` (${selected.size})` : ''}
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          Couldn&apos;t load completed orders: {(error as Error)?.message}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="w-10 px-4 py-2.5">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((p) => p.id)))}
                  aria-label="Select all"
                />
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
                <tr key={i}><td colSpan={5} className="px-4 py-3"><Skeleton className="h-6 w-full" /></td></tr>
              ))
            ) : rows.length > 0 ? (
              rows.map((pkg) => {
                const name = data?.names[pkg.receiver_email?.toLowerCase()] || nameFromEmail(pkg.receiver_email)
                return (
                  <tr key={pkg.id} className="cursor-pointer transition-colors hover:bg-accent/40" onClick={() => toggle(pkg.id)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={selected.has(pkg.id)} onCheckedChange={() => toggle(pkg.id)} />
                    </td>
                    <td className="px-4 py-3"><TrackingNumber value={pkg.reference} /></td>
                    <td className="px-4 py-3 font-medium">{name}</td>
                    <td className="px-4 py-3"><StatusStamp status={pkg.status} /></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateShort(pkg.updated_at ?? pkg.created_at)}</td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <FileDown className="size-5" />
                    </span>
                    <p className="text-sm font-medium">No completed orders in range</p>
                    <p className="text-sm text-muted-foreground">Pick a date range with collected or delivered packages.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </PageBody>
  )
}
