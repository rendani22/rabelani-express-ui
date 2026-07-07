import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ArrowDownRight, ArrowUpRight, RefreshCw } from 'lucide-react'
import type {
  ExecutiveDashboardData,
  FunnelStage,
  HealthLevel,
  HealthMetric,
  RevenueKpi,
  RevenueSummary,
} from '@/lib/api/executive-dashboard'
import { useExecutiveDashboard } from '@/hooks/use-dashboard'
import { DashboardCard } from '@/components/dashboard/dashboard-card'
import { DonutChart, HorizontalBars, TrendAreaChart } from '@/components/dashboard/charts'
import { SectionLabel } from '@/components/dispatch'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CHART_COLORS, formatZAR } from '@/lib/chart'
import { cn } from '@/lib/utils'

const num = (n: number) => new Intl.NumberFormat('en-ZA').format(n)

const LEVEL: Record<HealthLevel, { text: string; dot: string; border: string }> = {
  good: { text: 'text-success', dot: 'bg-success', border: 'border-success/40' },
  watch: { text: 'text-warning-foreground dark:text-warning', dot: 'bg-warning', border: 'border-warning/40' },
  risk: { text: 'text-destructive', dot: 'bg-destructive', border: 'border-destructive/40' },
  neutral: { text: 'text-muted-foreground', dot: 'bg-muted-foreground', border: 'border-border' },
}

const FUNNEL_COLOR: Record<string, string> = {
  warning: CHART_COLORS.warning,
  info: CHART_COLORS.route,
  accent: CHART_COLORS.primary,
  success: CHART_COLORS.success,
  neutral: CHART_COLORS.steel,
}

function Delta({ pct, up }: { pct: number | null; up: boolean }) {
  if (pct == null) return null
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium tabular', up ? 'text-success' : 'text-destructive')}>
      {up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {Math.abs(pct).toFixed(1)}%
    </span>
  )
}

/* ── KPIs ── */
function KpiTile({ kpi }: { kpi: RevenueKpi }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <SectionLabel>{kpi.label}</SectionLabel>
        <Delta pct={kpi.deltaPercent} up={kpi.deltaUp} />
      </div>
      <span className="tabular text-[1.6rem] font-semibold leading-none tracking-tight">
        {formatZAR(kpi.value, true)}
      </span>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="tabular">{num(kpi.orders)} orders</span>
        <span className="text-border">·</span>
        <span className="tabular">{formatZAR(kpi.avgOrderValue, true)} avg</span>
      </div>
      {kpi.comparisonLabel && <span className="text-[11px] text-muted-foreground">{kpi.comparisonLabel}</span>}
    </div>
  )
}

/* ── scorecard ── */
function ScorecardTile({ m }: { m: HealthMetric }) {
  const lv = LEVEL[m.level]
  return (
    <div className={cn('flex flex-col gap-1.5 rounded-lg border bg-card p-4', lv.border)}>
      <div className="flex items-center gap-1.5">
        <span className={cn('size-1.5 rounded-full', lv.dot)} />
        <SectionLabel>{m.label}</SectionLabel>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('tabular text-xl font-semibold tracking-tight', lv.text)}>{m.display}</span>
        <Delta pct={m.deltaPercent} up={m.deltaUp} />
      </div>
      <p className="text-xs text-muted-foreground">{m.meaning}</p>
      {m.context && <p className="text-[11px] text-muted-foreground/80">{m.context}</p>}
    </div>
  )
}

/* ── revenue mix ── */
function RevenueMix({ s }: { s: RevenueSummary }) {
  const slices = [
    { label: 'Realized', value: s.totalValue, color: CHART_COLORS.success },
    { label: 'Pipeline', value: s.pipelineValue, color: CHART_COLORS.warning },
  ]
  return (
    <div className="flex flex-col gap-4">
      <DonutChart data={slices} height={180} centerLabel="realized" centerValue={formatZAR(s.totalValue, true)} />
      <div className="flex flex-col gap-2">
        {slices.map((sl, i) => (
          <div key={sl.label} className="flex items-center gap-2 text-sm">
            <span className="size-2.5 rounded-full" style={{ background: sl.color }} />
            <span className="flex-1 text-muted-foreground">{sl.label}</span>
            <span className="tabular font-medium">{formatZAR(sl.value, true)}</span>
            <span className="tabular w-16 text-right text-xs text-muted-foreground">
              {num(i === 0 ? s.totalOrders : s.pipelineOrders)} ord
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── funnel ── */
function Funnel({ stages, conversionRate }: { stages: FunnelStage[]; conversionRate: number }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {stages.map((st) => (
          <div key={st.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>{st.label}</span>
              <span className="flex items-baseline gap-2">
                <span className="tabular font-medium">{num(st.orders)}</span>
                {st.value != null && (
                  <span className="tabular text-xs text-muted-foreground">{formatZAR(st.value, true)}</span>
                )}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${st.share}%`, background: FUNNEL_COLOR[st.colorClass] ?? CHART_COLORS.steel }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t pt-3 text-sm">
        <span className="text-muted-foreground">Order-to-cash conversion</span>
        <span className="tabular text-lg font-semibold text-success">{conversionRate.toFixed(1)}%</span>
      </div>
    </div>
  )
}

/* ── ranked money list ── */
function MoneyList({
  rows,
  onClick,
}: {
  rows: { key: string; primary: string; secondary?: string; value: number; onClick?: () => void }[]
  onClick?: (key: string) => void
}) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted-foreground">No data yet.</p>
  return (
    <ul className="flex flex-col divide-y">
      {rows.map((r, i) => (
        <li key={r.key}>
          <button
            onClick={() => onClick?.(r.key)}
            disabled={!onClick}
            className="flex w-full items-center gap-3 py-2.5 text-left enabled:hover:bg-accent/40 disabled:cursor-default"
          >
            <span className="tabular w-5 text-sm text-muted-foreground">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{r.primary}</span>
              {r.secondary && <span className="truncate text-xs text-muted-foreground">{r.secondary}</span>}
            </div>
            <span className="tabular text-sm font-semibold">{formatZAR(r.value, true)}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ── content ── */
function ExecutiveContent({ data }: { data: ExecutiveDashboardData }) {
  const navigate = useNavigate()
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month')
  const briefing = data.briefings[period]

  const trendData = (data.trends[period === 'today' ? 'day' : period] ?? []).map((p) => ({
    label: p.label,
    count: p.value,
  }))

  return (
    <div className="flex flex-col gap-4 lg:gap-6">
      {data.summary.truncated && (
        <div className="flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-warning-foreground dark:text-warning">
          <AlertCircle className="size-4" /> Showing the most recent collected orders only — totals may be partial.
        </div>
      )}

      {/* briefing lede */}
      <DashboardCard
        eyebrow="Executive briefing"
        title={briefing.headline}
        action={
          <div className="flex rounded-md border p-0.5">
            {(['today', 'week', 'month', 'year'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                  period === p ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {p}
              </button>
            ))}
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          {briefing.paragraphs.map((para, i) => (
            <p key={i} className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {para}
            </p>
          ))}
          {briefing.watchItem && (
            <div className={cn('mt-1 flex items-start gap-2 rounded-md border bg-muted/40 px-3.5 py-2.5 text-sm', LEVEL[briefing.watchLevel].border)}>
              <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', LEVEL[briefing.watchLevel].dot)} />
              <span>{briefing.watchItem}</span>
            </div>
          )}
        </div>
      </DashboardCard>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {data.kpis.map((k) => (
          <KpiTile key={k.key} kpi={k} />
        ))}
      </div>

      {/* scorecard */}
      <div>
        <SectionLabel className="mb-3 block">Business health</SectionLabel>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.scorecard.map((m) => (
            <ScorecardTile key={m.key} m={m} />
          ))}
        </div>
      </div>

      {/* trend + mix */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <DashboardCard title="Revenue Over Time" eyebrow={period} className="lg:col-span-8">
          <TrendAreaChart
            data={trendData}
            color={CHART_COLORS.success}
            height={230}
            valueFormatter={(v) => formatZAR(v, true)}
            yTickFormatter={(v) => formatZAR(v, true)}
          />
        </DashboardCard>
        <DashboardCard title="Revenue Status" className="lg:col-span-4">
          <RevenueMix s={data.summary} />
        </DashboardCard>
      </div>

      {/* funnel + order book */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <DashboardCard title="Order to Cash" className="lg:col-span-8">
          <Funnel stages={data.funnel.stages} conversionRate={data.funnel.conversionRate} />
        </DashboardCard>
        <DashboardCard title="Forward Order Book" className="lg:col-span-4">
          {data.orderBook.available ? (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <SectionLabel>Open</SectionLabel>
                  <span className="tabular text-2xl font-semibold">{formatZAR(data.orderBook.openValue, true)}</span>
                  <span className="text-xs text-muted-foreground">{num(data.orderBook.openCount)} POs</span>
                </div>
                <div className="flex flex-col gap-1">
                  <SectionLabel>Completed</SectionLabel>
                  <span className="tabular text-2xl font-semibold">{formatZAR(data.orderBook.completedValue, true)}</span>
                  <span className="text-xs text-muted-foreground">{num(data.orderBook.completedCount)} POs</span>
                </div>
              </div>
              <HorizontalBars
                data={data.orderBook.monthly.map((m) => ({ label: m.label, value: m.value }))}
                color={CHART_COLORS.route}
                valueFormatter={(v) => formatZAR(v, true)}
              />
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No purchase-order data.</p>
          )}
        </DashboardCard>
      </div>

      {/* top customers + items */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <DashboardCard
          title="Top Customers by Value"
          eyebrow={`Top 5 = ${data.concentration.topFiveShare.toFixed(0)}% of revenue`}
          className="lg:col-span-6"
        >
          <MoneyList
            rows={data.topCustomers.map((c) => ({
              key: c.email,
              primary: c.name || c.email,
              secondary: `${num(c.orders)} orders`,
              value: c.value,
            }))}
            onClick={(email) => navigate(`/customers?search=${encodeURIComponent(email)}`)}
          />
        </DashboardCard>
        <DashboardCard title="Top Items by Value" className="lg:col-span-6">
          <MoneyList
            rows={data.topItems.map((it) => ({
              key: it.description,
              primary: it.description,
              secondary: `${num(it.quantity)} units · ${num(it.orders)} orders`,
              value: it.value,
            }))}
          />
        </DashboardCard>
      </div>

      {/* operations band */}
      <div className="mt-2 flex items-center gap-4">
        <SectionLabel>Operations</SectionLabel>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-6">
        <DashboardCard title="Returns" eyebrow={`${data.returns.returnRate.toFixed(1)}% return rate`} className="lg:col-span-8">
          {data.returns.available ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-baseline gap-3">
                <span className={cn('tabular text-4xl font-semibold', LEVEL[data.returns.level].text)}>
                  {data.returns.returnRate.toFixed(1)}%
                </span>
                <span className="text-sm text-muted-foreground">
                  {num(data.returns.returnedTotal)} of {num(data.returns.ordersTotal)} orders
                </span>
              </div>
              <HorizontalBars
                data={data.returns.monthly.map((m) => ({ label: m.label, value: m.count }))}
                color="var(--destructive)"
              />
              {data.returns.worstLocation && (
                <p className="text-xs text-muted-foreground">
                  Highest: <span className="font-medium text-foreground">{data.returns.worstLocation.name}</span> at{' '}
                  {data.returns.worstLocation.rate.toFixed(1)}%
                </p>
              )}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No returns data.</p>
          )}
        </DashboardCard>

        <DashboardCard title="POD Compliance" className="lg:col-span-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-baseline gap-2">
              <span className={cn('tabular text-4xl font-semibold', LEVEL[data.podCompliance.level].text)}>
                {data.podCompliance.pdfRate.toFixed(0)}%
              </span>
              <span className="text-sm text-muted-foreground">with PDF</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                ['Total', data.podCompliance.total],
                ['With PDF', data.podCompliance.withPdf],
                ['Locked', data.podCompliance.locked],
                ['This week', data.podCompliance.thisWeek],
              ].map(([l, v]) => (
                <div key={l} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{l}</span>
                  <span className="tabular font-medium">{num(Number(v))}</span>
                </div>
              ))}
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Delivery Geography" className="lg:col-span-12">
          {data.geography.available ? (
            <HorizontalBars
              data={data.geography.locations.map((l) => ({ label: l.name, value: l.count }))}
              color={CHART_COLORS.route}
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No geography data.</p>
          )}
        </DashboardCard>
      </div>
    </div>
  )
}

/* ── entry ── */
export function ExecutiveDashboard() {
  const exec = useExecutiveDashboard()

  if (exec.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-40 rounded-lg" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-lg" />
      </div>
    )
  }

  if (exec.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm font-medium">Couldn&apos;t load the executive report</p>
        <p className="max-w-md text-sm text-muted-foreground">{(exec.error as Error)?.message}</p>
        <Button variant="outline" size="sm" onClick={() => exec.refetch()}>
          <RefreshCw /> Retry
        </Button>
      </div>
    )
  }

  return exec.data ? <ExecutiveContent data={exec.data} /> : null
}
