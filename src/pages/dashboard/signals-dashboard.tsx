import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronDown, Info, RefreshCw } from 'lucide-react'
import type { SignalsDashboardData, SignalWeek } from '@/lib/api/signals-dashboard'
import {
  evaluateSignals,
  formatHours,
  needsAttention,
  rankContributions,
  type EvaluatedSignal,
  type SignalHint,
  type SignalLevel,
  type SignalReading,
} from '@/lib/signals'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useSignalsDashboard } from '@/hooks/use-dashboard'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { SectionLabel } from '@/components/dispatch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_COLORS, formatZAR } from '@/lib/chart'
import { cn } from '@/lib/utils'

const num = (n: number) => new Intl.NumberFormat('en-ZA').format(n)

const LEVEL: Record<SignalLevel, { text: string; dot: string; border: string; bar: string }> = {
  good: { text: 'text-success', dot: 'bg-success', border: 'border-success/40', bar: 'var(--chart-3)' },
  watch: {
    text: 'text-warning-foreground dark:text-warning',
    dot: 'bg-warning',
    border: 'border-warning/40',
    bar: 'var(--chart-4)',
  },
  risk: { text: 'text-destructive', dot: 'bg-destructive', border: 'border-destructive/40', bar: 'var(--destructive)' },
  neutral: { text: 'text-muted-foreground', dot: 'bg-muted-foreground', border: 'border-border', bar: 'var(--chart-5)' },
}

/** Signed change in the metric's own unit, worded as the depot would say it. */
function formatDelta(s: EvaluatedSignal): string | null {
  if (s.delta == null) return null
  const sign = s.delta > 0 ? '+' : '−'
  const abs = Math.abs(s.delta)
  if (s.unit === 'percent') return `${sign}${abs.toFixed(1)} pts`
  if (s.unit === 'hours') return `${sign}${formatHours(abs)}`
  if (s.unit === 'currency') return `${sign}${formatZAR(abs, true)}`
  if (s.unit === 'ratio') return `${sign}${abs.toFixed(2)}×`
  return `${sign}${num(abs)}`
}

/**
 * The ⓘ beside a signal's name — what it counts, why it matters, what moves it.
 *
 * A popover rather than a tooltip, for two reasons. These run to three
 * sentences, which is past what a tooltip pill should hold; and the stated
 * design target is a phone held one-handed in the depot, where a hover-only
 * tooltip simply never opens. A popover works from a tap, a click and the
 * keyboard alike.
 */
function Hint({ title, hint }: { title: string; hint: SignalHint }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What ${title} means`}
          // Generous hit area for a thumb, without the icon itself growing.
          className="-m-1.5 inline-flex shrink-0 rounded p-1.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {(
            [
              ['What it counts', hint.what],
              ['Why it matters', hint.why],
              ['What moves it', hint.moves],
            ] as const
          ).map(([label, body]) => (
            <div key={label} className="flex flex-col gap-1">
              <SectionLabel>{label}</SectionLabel>
              <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The same ⓘ for figures that are not signals and so have no target. */
function PlainHint({ title, body }: { title: string; body: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`What ${title} means`}
          className="-m-1.5 inline-flex shrink-0 rounded p-1.5 text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <Info className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 max-w-[calc(100vw-2rem)]">
        <h3 className="mb-1.5 text-sm font-semibold tracking-tight">{title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
      </PopoverContent>
    </Popover>
  )
}

function Delta({ s }: { s: EvaluatedSignal }) {
  const text = formatDelta(s)
  if (!text) return null
  return (
    <span className={cn('tabular text-xs font-medium', s.deltaGood ? 'text-success' : 'text-destructive')}>{text}</span>
  )
}

/**
 * Small trend line. Weeks with no orders are genuine gaps, so the line breaks
 * rather than joining across them — a continuous line over a missing week
 * asserts a value that was never measured.
 */
function Sparkline({ points, color, height = 34 }: { points: Array<number | null>; color: string; height?: number }) {
  const runs = useMemo(() => {
    const present = points.map((p, i) => ({ p, i })).filter((d): d is { p: number; i: number } => d.p != null)
    if (present.length < 2) return null
    const values = present.map((d) => d.p)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = max - min || 1
    const lastX = Math.max(points.length - 1, 1)
    const at = (d: { p: number; i: number }) => ({
      x: (d.i / lastX) * 100,
      y: height - 3 - ((d.p - min) / span) * (height - 6),
    })

    // Split into contiguous index runs so gaps stay gaps.
    const segments: string[] = []
    let run: Array<{ p: number; i: number }> = []
    for (const d of present) {
      if (run.length && d.i !== run[run.length - 1].i + 1) {
        if (run.length > 1) segments.push(run.map(at).map((c) => `${c.x},${c.y}`).join(' '))
        run = []
      }
      run.push(d)
    }
    if (run.length > 1) segments.push(run.map(at).map((c) => `${c.x},${c.y}`).join(' '))
    return segments
  }, [points, height])

  if (!runs?.length) return <div style={{ height }} aria-hidden />
  return (
    <svg
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ height }}
      className="w-full"
      role="img"
      aria-label="Trend over the charted weeks"
    >
      {runs.map((pts, i) => (
        <polyline key={i} points={pts} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

/* ── needs-you-today ── */
function AttentionList({ items }: { items: EvaluatedSignal[] }) {
  if (!items.length) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-success/40 bg-success/5 px-4 py-3.5">
        <span className="size-1.5 rounded-full bg-success" />
        <p className="text-sm">Every signal is on target. Nothing needs you today.</p>
      </div>
    )
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border bg-card">
      {items.map((s) => (
        <li key={s.key} className="flex flex-col gap-1.5 px-4 py-3.5">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={cn('mb-px size-1.5 self-center rounded-full', LEVEL[s.level].dot)} />
            <span className="flex items-center gap-1.5 self-center text-sm font-medium">
              {s.label}
              <Hint title={s.label} hint={s.hint} />
            </span>
            <span className={cn('tabular text-sm font-semibold', LEVEL[s.level].text)}>{s.display}</span>
            <Delta s={s} />
            <span className="tabular text-xs text-muted-foreground">target {s.targetDisplay}</span>
          </div>
          {s.context && <p className="text-sm text-muted-foreground">{s.context}</p>}
          {s.action && <p className="text-sm">→ {s.action}</p>}
        </li>
      ))}
    </ul>
  )
}

/* ── north star ── */
function NorthStarCard({ data, signal }: { data: SignalsDashboardData; signal: EvaluatedSignal }) {
  const ns = data.northStar
  const contributions = rankContributions([
    { key: 'late', label: 'Late', points: ns.lost.late },
    { key: 'pod', label: 'No POD on file', points: ns.lost.pod },
    { key: 'returned', label: 'Returned', points: ns.lost.returned },
    ...(data.companyScoped ? [] : [{ key: 'po', label: 'PO never recorded', points: ns.lost.poAccuracy }]),
  ])

  return (
    <DashboardCard
      eyebrow={`North star · last ${data.periodDays} days`}
      title="Perfect Order Rate"
      action={
        <div className="flex items-center gap-2">
          <span className="tabular text-xs text-muted-foreground">target {signal.targetDisplay}</span>
          <Hint title={signal.label} hint={signal.hint} />
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex flex-col gap-3 lg:col-span-5">
          <div className="flex items-baseline gap-3">
            <span className={cn('tabular text-5xl font-semibold tracking-tight', LEVEL[signal.level].text)}>
              {signal.display}
            </span>
            <Delta s={signal} />
          </div>
          <p className="text-sm text-muted-foreground">
            {num(ns.clean)} of {num(ns.denominator)} orders went through clean — on time, not returned, and with a
            proof of delivery on file.
            {ns.coupaDropped > 0 && (
              <>
                {' '}
                Includes {num(ns.coupaDropped)} purchase{' '}
                {ns.coupaDropped === 1 ? 'order that Coupa sent and this system never recorded' : 'orders Coupa sent and this system never recorded'}.
              </>
            )}
          </p>
          <Sparkline
            points={data.series.map((w) => w.rate)}
            color={LEVEL[signal.level].bar}
            height={56}
          />
          <span className="text-[11px] text-muted-foreground">Weekly, last {data.weeks} weeks</span>
        </div>

        <div className="flex flex-col gap-3 lg:col-span-7">
          <div className="flex items-center gap-1.5">
            <SectionLabel>Points lost to</SectionLabel>
            <PlainHint
              title="Points lost to"
              body="How many percentage points each problem cost the rate above. An order that failed several ways is counted once, against its most serious cause — returned first, then late, then a missing proof of delivery — so these add up to exactly what is missing from the rate rather than past it. The top bar is where fixing something pays most."
            />
          </div>
          {contributions.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">Nothing lost in this window.</p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {contributions.map((c, i) => (
                <div key={c.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className={i === 0 ? 'font-medium' : 'text-muted-foreground'}>{c.label}</span>
                    <span className="tabular font-medium">{c.points.toFixed(1)} pts</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${c.share}%`,
                        background: i === 0 ? 'var(--destructive)' : CHART_COLORS.steel,
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="mt-1 text-xs text-muted-foreground">
                Each failed order counts once, against its most serious cause — so these add up to the points missing
                from the rate rather than past it. The top bar is where the next fix pays most.
              </p>
            </div>
          )}
        </div>
      </div>
    </DashboardCard>
  )
}

/* ── input levers ── */
function LeverTile({ s, series, footer }: { s: EvaluatedSignal; series: Array<number | null>; footer?: string }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-lg border bg-card p-4', LEVEL[s.level].border)}>
      <div className="flex items-center gap-1.5">
        <span className={cn('size-1.5 shrink-0 rounded-full', LEVEL[s.level].dot)} />
        <SectionLabel className="truncate">{s.label}</SectionLabel>
        <Hint title={s.label} hint={s.hint} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('tabular text-2xl font-semibold tracking-tight', LEVEL[s.level].text)}>{s.display}</span>
        <Delta s={s} />
      </div>
      <Sparkline points={series} color={LEVEL[s.level].bar} />
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>{footer ?? s.context}</span>
        <span className="tabular">target {s.targetDisplay}</span>
      </div>
    </div>
  )
}

/* ── guardrails ── */
function GuardrailStrip({ items }: { items: EvaluatedSignal[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((s) => (
        <div key={s.key} className="flex flex-col gap-1.5 rounded-lg border bg-card p-3.5">
          <div className="flex items-center gap-1.5">
            <span className={cn('size-1.5 shrink-0 rounded-full', LEVEL[s.level].dot)} />
            <span className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</span>
            <Hint title={s.label} hint={s.hint} />
          </div>
          <span className={cn('tabular text-xl font-semibold', LEVEL[s.level].text)}>{s.display}</span>
          {s.context && <span className="text-[11px] text-muted-foreground">{s.context}</span>}
        </div>
      ))}
    </div>
  )
}

/* ── stop-looking-at panel ── */
const VANITY: Array<[string, string, string]> = [
  ['Total Packages', 'Cumulative — only ever goes up, and no action hangs off it.', 'Orders completed this period, vs last'],
  ['PODs Signed', 'An absolute count. 400 signed is bad if 500 completed.', 'POD compliance rate'],
  ['Total handled (driver)', 'Rewards tenure, not performance.', 'Completion rate and overnight reverts'],
  ['Active Drivers', 'A roster fact, not a measure of anything.', 'Packages on road per active driver'],
  ['Items (inventory)', 'Catalogue size.', 'Stock-outs blocking an open order'],
  [
    'Collection rate',
    'Completed ÷ all-time total, so it drifts toward 100% forever as history accumulates, whatever this week was like.',
    'On-time rate, windowed',
  ],
]

function VanityPanel() {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border bg-card">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
      >
        <div className="flex flex-col gap-0.5">
          <SectionLabel>Calibration</SectionLabel>
          <h2 className="text-sm font-semibold tracking-tight">What to stop looking at</h2>
        </div>
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="border-t px-5 py-4">
          <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
            Six numbers on the other two tabs cannot change what anyone does tomorrow. They are worth reading once so
            they stop competing for attention with the ones above.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Metric</th>
                  <th className="pb-2 pr-4 font-medium">Why it can&apos;t move you</th>
                  <th className="pb-2 font-medium">Read instead</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {VANITY.map(([metric, why, instead]) => (
                  <tr key={metric}>
                    <td className="py-2.5 pr-4 align-top font-medium">{metric}</td>
                    <td className="py-2.5 pr-4 align-top text-muted-foreground">{why}</td>
                    <td className="py-2.5 align-top">{instead}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── content ── */
function SignalsContent({ data }: { data: SignalsDashboardData }) {
  const navigate = useNavigate()
  const { northStar: ns, inputs: inp, guardrails: g, business: b } = data

  const signals = useMemo(() => {
    const readings: SignalReading[] = [
      {
        key: 'perfectOrderRate',
        value: ns.rate,
        prior: ns.priorRate,
        context: `${num(ns.clean)} of ${num(ns.denominator)} orders clean`,
        action: 'Start with the largest bar in the leak breakdown below.',
      },
      {
        key: 'onTime',
        value: inp.onTime.rate,
        prior: inp.onTime.priorRate,
        context: `${num(inp.onTime.late)} of ${num(inp.onTime.total)} orders breached a status SLA before finishing`,
        action:
          g.reverts7d > 0
            ? `Check dispatch cadence — ${num(g.reverts7d)} ${g.reverts7d === 1 ? 'order was' : 'orders were'} still with a driver at the 20:00 cutoff this week.`
            : 'Check where the dwell is: pending, in transit, or waiting at the collection point.',
      },
      {
        key: 'firstTimeRight',
        value: inp.firstTimeRight.rate,
        prior: inp.firstTimeRight.priorRate,
        context: `${num(inp.firstTimeRight.returned)} of ${num(inp.firstTimeRight.total)} orders came back`,
        action: 'Returns have no recorded root cause — check the worst location on the Executive tab.',
      },
      {
        key: 'podCompliance',
        value: inp.podCompliance.rate,
        prior: inp.podCompliance.priorRate,
        context: `${num(inp.podCompliance.total - inp.podCompliance.compliant)} of ${num(inp.podCompliance.total)} completed orders have no POD on file`,
        action: 'A completed order with no POD is an order you cannot prove you delivered.',
      },
      {
        key: 'cycleP90',
        value: inp.cycleTime.p90,
        prior: inp.cycleTime.priorP90,
        context: `Median ${formatHours(inp.cycleTime.p50)} · slowest tenth ${formatHours(inp.cycleTime.p90)} · ${num(inp.cycleTime.sample)} orders`,
        action: 'The slowest tenth is what generates the phone calls, not the average.',
      },
      {
        key: 'tailRatio',
        value: inp.cycleTime.tailRatio,
        context: 'Slowest tenth ÷ median — how consistent the operation is, not how fast',
        action: 'A wide gap means the problem is a handful of stalled orders, not general slowness.',
      },
      {
        key: 'openBreaches',
        value: g.openBreaches,
        context:
          g.worstBreachHours != null
            ? `Worst is ${formatHours(g.worstBreachHours)} past its threshold · ${num(g.openOrders)} orders open`
            : `${num(g.openOrders)} orders open`,
        action: 'Work the SLA list on the Operations tab, oldest first.',
      },
      {
        key: 'valueAtRisk',
        value: g.valueAtRisk,
        context: 'Gross value of the orders currently breaching — money standing still',
        action: 'These are billable orders that have stopped moving.',
      },
      {
        key: 'reverts',
        value: g.reverts7d,
        context:
          g.worstDriverName && g.worstDriverReverts
            ? `Last 7 days · most from ${g.worstDriverName} (${num(g.worstDriverReverts)})`
            : 'Orders still held by a driver at the 20:00 cutoff, last 7 days',
        action: "Today's revert is next week's breach — this one leads the on-time rate.",
      },
      {
        key: 'unassignedLocation',
        value: g.unassignedLocation,
        context: 'Open orders with no delivery location — a data defect, not a place',
        action: 'These cannot be routed or reported on until someone sets a location.',
      },
      {
        key: 'stockOuts',
        value: g.stockOutsBlocking,
        context: 'Out-of-stock items that appear on an open order',
        action: 'Restock or the orders holding them cannot be fulfilled.',
      },
      {
        key: 'topCustomerShare',
        value: b.topCustomerShare,
        context: `Share of the last ${data.periodDays} days' gross revenue from the single largest customer`,
        action: 'Dependency risk. Worth a quarterly conversation, not a daily one.',
      },
    ]

    // Coupa ingestion is network-wide by construction: a failed ingestion has
    // no customer to scope by, so under a company filter it would report 0%
    // however much was being dropped. Absent beats reassuringly wrong.
    if (g.coupaAvailable) {
      readings.push({
        key: 'coupaFailureRate',
        value: g.coupaFailureRate,
        context: `${num(g.coupaFailed)} purchase ${g.coupaFailed === 1 ? 'order' : 'orders'} never reached the system, last ${g.coupaWindowDays} days`,
        action: 'Each one is sitting in support’s inbox waiting to be keyed in by hand.',
      })
    }

    return evaluateSignals(readings)
  }, [ns, inp, g, b, data.periodDays])

  const byKey = useMemo(() => new Map(signals.map((s) => [s.key, s])), [signals])
  const get = (k: EvaluatedSignal['key']) => byKey.get(k)!

  // The North Star is deliberately excluded from the worklist: it is the score,
  // not a thing to go and do. Acting on it means acting on one of its levers.
  const attention = useMemo(
    () => needsAttention(signals.filter((s) => s.key !== 'perfectOrderRate')).slice(0, 4),
    [signals],
  )

  const guardrailKeys = [
    'openBreaches',
    'valueAtRisk',
    'reverts',
    'unassignedLocation',
    'stockOuts',
    ...(g.coupaAvailable ? (['coupaFailureRate'] as const) : []),
  ] as const

  const series = (pick: (w: SignalWeek) => number | null) => data.series.map(pick)
  const revenueDelta = b.priorRevenue > 0 ? ((b.revenue - b.priorRevenue) / b.priorRevenue) * 100 : null

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      <div className="flex flex-col gap-3">
        <SectionLabel>Needs you today</SectionLabel>
        <AttentionList items={attention} />
      </div>

      <NorthStarCard data={data} signal={get('perfectOrderRate')} />

      <div>
        <SectionLabel className="mb-3 block">The levers under it</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <LeverTile
            s={get('onTime')}
            series={series((w) => w.onTime)}
            footer={`${num(inp.onTime.late)} late of ${num(inp.onTime.total)}`}
          />
          <LeverTile
            s={get('firstTimeRight')}
            series={series((w) => w.firstTimeRight)}
            footer={`${num(inp.firstTimeRight.returned)} returned of ${num(inp.firstTimeRight.total)}`}
          />
          <LeverTile
            s={get('podCompliance')}
            series={series((w) => w.pod)}
            footer={
              inp.podCompliance.deliveries > 0
                ? `${num(inp.podCompliance.deliveriesWithPhoto)}/${num(inp.podCompliance.deliveries)} deliveries pictured`
                : 'No driver deliveries in window'
            }
          />
          <LeverTile
            s={get('cycleP90')}
            series={series((w) => w.p90)}
            footer={`Median ${formatHours(inp.cycleTime.p50)} · ${get('tailRatio').display} tail`}
          />
        </div>
      </div>

      <div>
        <SectionLabel className="mb-3 block">Guardrails</SectionLabel>
        <GuardrailStrip items={guardrailKeys.map(get)} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <DashboardCard
          title="Business"
          eyebrow={`Gross revenue · last ${data.periodDays} days`}
          className="lg:col-span-12"
        >
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <SectionLabel>Revenue</SectionLabel>
                <PlainHint
                  title="Revenue"
                  body="The gross value of everything collected in the last 28 days, against the 28 days before it. Gross, not profit: the system records no cost price anywhere, so margin cannot be worked out on any screen in this product."
                />
              </div>
              <span className="tabular text-2xl font-semibold">{formatZAR(b.revenue, true)}</span>
              <span className="text-xs text-muted-foreground">
                {revenueDelta == null ? (
                  `${num(b.orders)} orders`
                ) : (
                  <>
                    <span className={revenueDelta >= 0 ? 'text-success' : 'text-destructive'}>
                      {revenueDelta >= 0 ? '+' : '−'}
                      {Math.abs(revenueDelta).toFixed(1)}%
                    </span>{' '}
                    vs previous {data.periodDays} days
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <SectionLabel>Per perfect order</SectionLabel>
                <PlainHint
                  title="Per perfect order"
                  body="Revenue divided by the number of orders that went through clean. It rises when the work gets better even if volume stays flat, which is something raw revenue can never show you — a busy month of messy orders and a quiet month of clean ones can bill the same."
                />
              </div>
              <span className="tabular text-2xl font-semibold">
                {b.perPerfectOrder == null ? '—' : formatZAR(b.perPerfectOrder, true)}
              </span>
              <span className="text-xs text-muted-foreground">Rises when quality rises at flat volume</span>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <SectionLabel>Top customer share</SectionLabel>
                <Hint title={get('topCustomerShare').label} hint={get('topCustomerShare').hint} />
              </div>
              <span className={cn('tabular text-2xl font-semibold', LEVEL[get('topCustomerShare').level].text)}>
                {get('topCustomerShare').display}
              </span>
              <span className="text-xs text-muted-foreground">Dependency risk</span>
            </div>
            {/* Network-wide only — a PO has no customer to scope by, and
                showing the whole book beside one company's revenue would read
                as that company's. */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <SectionLabel>Forward order book</SectionLabel>
                <PlainHint
                  title="Forward order book"
                  body="The value of purchase orders that are still open — work you have been promised but not yet delivered. It is network-wide only: a purchase order has no customer attached to it, so it cannot be filtered to one company."
                />
              </div>
              <span className="tabular text-2xl font-semibold">
                {b.orderBookAvailable ? formatZAR(b.orderBookValue, true) : '—'}
              </span>
              <span className="text-xs text-muted-foreground">
                {b.orderBookAvailable ? `${num(b.orderBookCount)} open POs` : 'Network-wide only'}
              </span>
            </div>
          </div>
          <p className="mt-5 border-t pt-3 text-xs text-muted-foreground">
            Gross revenue throughout. There is no cost price recorded anywhere in the system, so nothing on any
            dashboard is margin or profit.
          </p>
        </DashboardCard>
      </div>

      <VanityPanel />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          Headlines compare the last {data.periodDays} days against the {data.periodDays} before, so both sides of every
          comparison are the same length.
        </span>
        <button className="underline underline-offset-2 hover:text-foreground" onClick={() => navigate('/orders')}>
          Open orders
        </button>
      </div>
    </div>
  )
}

/* ── entry ── */
export function SignalsDashboard({ companyId }: { companyId?: string | null }) {
  const signals = useSignalsDashboard(companyId)

  if (signals.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (signals.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm font-medium">Couldn&apos;t load the signals</p>
        <p className="max-w-md text-sm text-muted-foreground">{(signals.error as Error)?.message}</p>
        <Button variant="outline" size="sm" onClick={() => signals.refetch()}>
          <RefreshCw /> Retry
        </Button>
      </div>
    )
  }

  return signals.data ? <SignalsContent data={signals.data} /> : null
}
