import { useNavigate } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Download,
  FileSignature,
  Inbox,
  Loader2,
  Package,
  Truck,
  Users,
} from 'lucide-react'
import type {
  DriverPerformance,
  DriverStats,
  InventoryHealth,
  LifecycleMetrics,
  LocationDistribution,
  OperationsDashboardData,
  PackageStats,
  PodStats,
  StatusDistribution,
  StuckPackage,
  TimeSeriesDataPoint,
  TopReceiver,
  TopShippedItem,
} from '@/lib/api/operations-dashboard'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { DonutChart, HorizontalBars, TrendAreaChart, VolumeBarChart } from '@/components/dashboard/charts'
import { StatusStamp } from '@/components/dispatch'
import { useDownloadSlaBreaches } from '@/hooks/use-dashboard'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { statusColor } from '@/lib/chart'
import { cn } from '@/lib/utils'

function fmtHours(h: number | null): string {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}m`
  if (h < 48) return `${h.toFixed(1)}h`
  return `${Math.round(h / 24)}d`
}

const num = (n: number) => new Intl.NumberFormat('en-ZA').format(n)

/* ── stat tile ── */
function StatTile({
  icon: Icon,
  label,
  value,
  subtitle,
  accent,
}: {
  icon: typeof Package
  label: string
  value: number
  subtitle?: string
  accent?: boolean
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {label}
        </span>
        <Icon className={cn('size-4', accent ? 'text-primary' : 'text-muted-foreground')} />
      </div>
      <span className="tabular text-[1.75rem] font-semibold leading-none tracking-tight">
        {num(value)}
      </span>
      {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
    </div>
  )
}

function StatsRow({
  stats,
  drivers,
  pod,
  companyScoped,
}: {
  stats: PackageStats
  drivers: DriverStats
  pod: PodStats
  companyScoped?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      <StatTile icon={Package} label="Total Packages" value={stats.total} accent />
      <StatTile icon={Clock} label="Pending" value={stats.pending} />
      <StatTile icon={Truck} label="In Transit" value={stats.inTransit} />
      <StatTile icon={Inbox} label="Ready to Collect" value={stats.readyForCollection} />
      <StatTile icon={CheckCircle2} label="Completed" value={stats.completed} />
      <StatTile icon={CalendarDays} label="Today" value={stats.todayCount} subtitle={`${num(stats.weeklyCount)} this week`} />
      {/* Driver roster + POD totals are network-wide — hide when scoped to a company. */}
      {!companyScoped && (
        <>
          <StatTile icon={Users} label="Active Drivers" value={drivers.active} subtitle={`${num(drivers.total)} total`} />
          <StatTile icon={FileSignature} label="PODs Signed" value={pod.total} subtitle={`${num(pod.withPdf)} with PDF`} />
        </>
      )}
    </div>
  )
}

/* ── status distribution ── */
function StatusDonut({ data }: { data: StatusDistribution[] }) {
  const slices = data.map((d) => ({ label: d.label, value: d.value, color: statusColor(d.status) }))
  const total = data.reduce((a, d) => a + d.value, 0)
  return (
    <div className="flex flex-col gap-4">
      <DonutChart data={slices} centerLabel="total" centerValue={num(total)} height={200} />
      <ul className="flex flex-col gap-1.5">
        {data.map((d) => (
          <li key={d.status} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: statusColor(d.status) }} />
            <span className="flex-1 text-muted-foreground">{d.label}</span>
            <span className="tabular font-medium">{num(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── driver overview ── */
function DriverOverview({ d }: { d: DriverStats }) {
  const rows: [string, number][] = [
    ['On delivery', d.onDelivery],
    ['Packages on road', d.packagesInTransit],
    ['Total handled', d.totalPackages],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-4xl font-semibold tracking-tight text-primary">{d.active}</span>
        <span className="text-sm text-muted-foreground">of {d.total} drivers active</span>
      </div>
      <div className="flex flex-col divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular font-medium">{num(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── POD stats ── */
function PodBlock({ p }: { p: PodStats }) {
  const rows: [string, number][] = [
    ['With PDF', p.withPdf],
    ['Locked', p.locked],
    ['Today', p.today],
    ['This week', p.thisWeek],
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="tabular text-4xl font-semibold tracking-tight">{num(p.total)}</span>
        <span className="text-sm text-muted-foreground">signed</span>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{label}</span>
            <span className="tabular font-medium">{num(value)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── delivery performance ── */
function DeliveryPerformance({ stats }: { stats: PackageStats }) {
  const completed = stats.completed
  const inProgress = stats.inTransit + stats.readyForCollection
  const pending = stats.pending
  const total = Math.max(1, completed + inProgress + pending)
  const seg = [
    { label: 'Completed', value: completed, color: 'var(--chart-3)' },
    { label: 'In progress', value: inProgress, color: 'var(--chart-1)' },
    { label: 'Pending', value: pending, color: 'var(--chart-4)' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 overflow-hidden rounded-full">
        {seg.map((s) => (
          <div key={s.label} style={{ width: `${(s.value / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <ul className="flex flex-col gap-2">
        {seg.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-muted-foreground">{s.label}</span>
            <span className="tabular font-medium">{num(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── cycle-time ── */
function CycleTime({ m }: { m: LifecycleMetrics }) {
  const stages: [string, number | null][] = [
    ['Created → Picked up', m.avgCreateToPickupHours],
    ['Pickup → Received', m.avgPickupToReceiveHours],
    ['Received → Collected', m.avgReceiveToCollectHours],
    ['Created → Fulfilled', m.avgTotalCycleHours],
  ]
  // Created → fulfilment, split by how the order completed (POD label).
  const breakdown: { label: string; value: number | null; sample: number }[] = [
    { label: 'Delivered', value: m.avgCreateToDeliveredHours, sample: m.deliveredSampleSize },
    { label: 'Collected', value: m.avgCreateToCollectedHours, sample: m.collectedSampleSize },
  ]
  const hasBreakdown = breakdown.some((b) => b.sample > 0)
  return (
    <div className="flex flex-col gap-3">
      {stages.map(([label, value]) => (
        <div key={label} className="flex items-baseline justify-between border-b pb-2 last:border-0">
          <span className="text-sm text-muted-foreground">{label}</span>
          <span className="tabular text-lg font-semibold">{fmtHours(value)}</span>
        </div>
      ))}

      {hasBreakdown && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Fulfilment by type
          </span>
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">
                {b.label}
                <span className="ml-1.5 tabular text-xs text-muted-foreground/70">
                  ({num(b.sample)})
                </span>
              </span>
              <span className="tabular text-sm font-semibold">{fmtHours(b.value)}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Based on {num(m.completedSampleSize)} completed packages.
      </p>
    </div>
  )
}

/* ── SLA alerts ── */
function StuckList({
  items,
  total,
  onClick,
}: {
  items: StuckPackage[]
  /** Full breach count — `items` is only the worst 10. */
  total: number
  onClick: (s: StuckPackage) => void
}) {
  if (!items.length)
    return <p className="py-8 text-center text-sm text-muted-foreground">No SLA breaches — all moving.</p>
  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y">
        {items.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => onClick(s)}
              className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="mono truncate text-[0.8125rem]">{s.reference}</span>
                <span className="truncate text-xs text-muted-foreground">{s.receiverEmail}</span>
              </div>
              <StatusStamp status={s.status} />
              <span className="tabular w-16 shrink-0 text-right text-sm font-semibold text-destructive">
                {fmtHours(s.hoursStuck)}
              </span>
            </button>
          </li>
        ))}
      </ul>

      {total > items.length && (
        <p className="text-xs text-muted-foreground">
          Showing the worst {num(items.length)} of {num(total)} breaches — download for the full list.
        </p>
      )}
    </div>
  )
}

/* ── driver performance table ── */
function DriverTable({ rows }: { rows: DriverPerformance[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No driver activity.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
            <th className="pb-2 font-medium">Driver</th>
            <th className="pb-2 text-right font-medium">Pickups</th>
            <th className="pb-2 text-right font-medium">Delivered</th>
            <th className="pb-2 text-right font-medium">Avg</th>
            <th className="pb-2 text-right font-medium">Rate</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((d) => (
            <tr key={d.driverUserId}>
              <td className="py-2 font-medium">{d.name}</td>
              <td className="tabular py-2 text-right">{num(d.pickups)}</td>
              <td className="tabular py-2 text-right">{num(d.delivered)}</td>
              <td className="tabular py-2 text-right text-muted-foreground">{fmtHours(d.avgDeliveryHours)}</td>
              <td className="tabular py-2 text-right font-medium text-success">
                {Math.round(d.completionRate)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── simple ranked list ── */
function RankedList({
  items,
}: {
  items: { key: string; primary: string; secondary?: string; value: number }[]
}) {
  if (!items.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
  return (
    <ul className="flex flex-col divide-y">
      {items.map((it, i) => (
        <li key={it.key} className="flex items-center gap-3 py-2.5">
          <span className="tabular w-5 text-sm text-muted-foreground">{i + 1}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">{it.primary}</span>
            {it.secondary && <span className="truncate text-xs text-muted-foreground">{it.secondary}</span>}
          </div>
          <span className="tabular text-sm font-semibold">{num(it.value)}</span>
        </li>
      ))}
    </ul>
  )
}

/* ── inventory health ── */
function InventoryHealthBlock({ h }: { h: InventoryHealth }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Items', h.totalItems],
          ['Low stock', h.lowStock],
          ['Out', h.outOfStock],
        ].map(([label, value]) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
            <span
              className={cn(
                'tabular text-2xl font-semibold',
                label === 'Out' && Number(value) > 0 && 'text-destructive',
                label === 'Low stock' && Number(value) > 0 && 'text-warning-foreground dark:text-warning',
              )}
            >
              {num(Number(value))}
            </span>
          </div>
        ))}
      </div>
      {h.topLowStock.length > 0 && (
        <ul className="flex flex-col divide-y border-t pt-2">
          {h.topLowStock.map((it) => (
            <li key={it.id} className="flex items-center justify-between py-2 text-sm">
              <span className="truncate">{it.name}</span>
              <span className="tabular text-muted-foreground">
                {num(it.quantity)} / {num(it.threshold)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── timeline summary ── */
function TimelineSummary({ stats, drivers }: { stats: PackageStats; drivers: DriverStats }) {
  const pct = (n: number) => (stats.total > 0 ? (n / stats.total) * 100 : 0)
  const cells = [
    { label: 'Today', value: stats.todayCount, color: 'var(--chart-3)', display: num(stats.todayCount) },
    { label: 'This week', value: stats.weeklyCount, color: 'var(--chart-1)', display: num(stats.weeklyCount) },
    { label: 'This month', value: stats.monthlyCount, color: 'var(--chart-2)', display: num(stats.monthlyCount) },
    {
      label: 'Collection rate',
      value: stats.completed,
      color: 'var(--chart-3)',
      display: `${Math.round(pct(stats.completed))}%`,
    },
    { label: 'Awaiting pickup', value: stats.readyForCollection, color: 'var(--chart-4)', display: num(stats.readyForCollection) },
    { label: 'On road', value: drivers.packagesInTransit, color: 'var(--chart-2)', display: num(drivers.packagesInTransit) },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-8 gap-y-5 sm:grid-cols-3">
      {cells.map((c) => (
        <div key={c.label} className="flex flex-col gap-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</span>
          <span className="tabular text-2xl font-semibold">{c.display}</span>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full" style={{ width: `${pct(c.value)}%`, background: c.color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── page ── */
export function OperationsDashboard({
  data,
  companyId,
  companyName,
  companyScoped,
}: {
  data: OperationsDashboardData
  /** Scopes the SLA export to one company; null = the whole network. */
  companyId?: string | null
  /** Used to name the exported file. */
  companyName?: string | null
  /** When scoped to a company, hide network-wide cards (driver roster, POD, inventory). */
  companyScoped?: boolean
}) {
  const navigate = useNavigate()
  const download = useDownloadSlaBreaches(companyId, companyName)

  const weekly: TimeSeriesDataPoint[] = data.weeklyTimeSeries
  const monthly: TimeSeriesDataPoint[] = data.monthlyTimeSeries
  const locations: LocationDistribution[] = data.locationDistribution
  const receivers: TopReceiver[] = data.topReceivers
  const items: TopShippedItem[] = data.topShippedItems

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
      {/* stats */}
      <div className="lg:col-span-12">
        <StatsRow stats={data.stats} drivers={data.driverStats} pod={data.podStats} companyScoped={companyScoped} />
      </div>

      {/* trend + status */}
      <DashboardCard title="Packages This Week" className="lg:col-span-8">
        <TrendAreaChart data={weekly} height={210} />
      </DashboardCard>
      <DashboardCard title="Status Distribution" className="lg:col-span-4">
        <StatusDonut data={data.statusDistribution} />
      </DashboardCard>

      {/* volume + driver (driver roster is network-wide → hidden when scoped) */}
      <DashboardCard title="30-Day Package Volume" className={cn('lg:col-span-8', companyScoped && 'lg:col-span-12')}>
        <VolumeBarChart data={monthly} height={230} />
      </DashboardCard>
      {!companyScoped && (
        <DashboardCard title="Driver Overview" className="lg:col-span-4">
          <DriverOverview d={data.driverStats} />
        </DashboardCard>
      )}

      {/* locations + pod (POD totals are network-wide → hidden when scoped) */}
      <DashboardCard title="Packages by Location" className={cn('lg:col-span-8', companyScoped && 'lg:col-span-12')}>
        <HorizontalBars data={locations.map((l) => ({ label: l.name, value: l.count }))} />
      </DashboardCard>
      {!companyScoped && (
        <DashboardCard title="Proof of Delivery" className="lg:col-span-4">
          <PodBlock p={data.podStats} />
        </DashboardCard>
      )}

      {/* cycle time + SLA */}
      <DashboardCard title="Cycle-Time Insights" className="lg:col-span-6">
        <CycleTime m={data.lifecycleMetrics} />
      </DashboardCard>
      <DashboardCard
        title="SLA Alerts"
        eyebrow="Live — all open orders"
        className="lg:col-span-6"
        action={
          <PermissionButton
            permission="sla.export"
            variant="outline"
            size="sm"
            onClick={() => download.mutate()}
            disabled={download.isPending || data.stuckTotal === 0}
            deniedReason="This export includes customer names, emails and phone numbers — ask an admin."
          >
            {download.isPending ? <Loader2 className="animate-spin" /> : <Download />}
            Download
          </PermissionButton>
        }
      >
        <StuckList
          items={data.stuckPackages}
          total={data.stuckTotal}
          onClick={(s) => navigate(`/orders?id=${s.id}`)}
        />
      </DashboardCard>

      {/* driver perf + top items */}
      <DashboardCard title="Driver Performance" className="lg:col-span-6">
        <DriverTable rows={data.driverPerformance} />
      </DashboardCard>
      <DashboardCard title="Top Items Shipped" className="lg:col-span-6">
        <RankedList
          items={items.map((it) => ({
            key: it.description,
            primary: it.description,
            secondary: `${num(it.packageCount)} packages`,
            value: it.totalQuantity,
          }))}
        />
      </DashboardCard>

      {/* delivery perf + inventory (inventory is network-wide → hidden when scoped) */}
      <DashboardCard title="Delivery Performance" className={cn('lg:col-span-6', companyScoped && 'lg:col-span-12')}>
        <DeliveryPerformance stats={data.stats} />
      </DashboardCard>
      {!companyScoped && (
        <DashboardCard title="Inventory Health" className="lg:col-span-6">
          <InventoryHealthBlock h={data.inventoryHealth} />
        </DashboardCard>
      )}

      {/* receivers + timeline */}
      <DashboardCard title="Top Receivers" className="lg:col-span-4">
        <RankedList
          items={receivers.map((r) => ({
            key: r.email,
            primary: r.name || r.email,
            secondary: r.name ? r.email : undefined,
            value: r.count,
          }))}
        />
      </DashboardCard>
      <DashboardCard title="Package Timeline Summary" className="lg:col-span-8">
        <TimelineSummary stats={data.stats} drivers={data.driverStats} />
      </DashboardCard>
    </div>
  )
}
