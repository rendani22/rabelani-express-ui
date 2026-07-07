import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { CHART_COLORS, formatCompact } from '@/lib/chart'

const axisTick = { fontSize: 11, fill: 'var(--muted-foreground)' }
const AXIS_LINE = { stroke: 'var(--border)' }

/** Shared themed tooltip. */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; color?: string; payload?: Record<string, unknown> }>
  label?: string | number
  valueFormatter?: (v: number) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {label != null && <div className="mb-1 font-medium text-foreground">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="tabular text-foreground">
            {valueFormatter ? valueFormatter(p.value ?? 0) : p.value}
          </span>
          {p.name && <span>{p.name}</span>}
        </div>
      ))}
    </div>
  )
}

export interface SeriesPoint {
  label: string
  count: number
}

/** Area/line trend — e.g. packages this week. */
export function TrendAreaChart({
  data,
  height = 200,
  color = CHART_COLORS.primary,
  valueFormatter,
  yTickFormatter = formatCompact,
}: {
  data: SeriesPoint[]
  height?: number
  color?: string
  valueFormatter?: (v: number) => string
  yTickFormatter?: (v: number) => string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={axisTick} axisLine={AXIS_LINE} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={yTickFormatter}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          content={<ChartTooltip valueFormatter={valueFormatter} />}
        />
        <Area
          type="monotone"
          dataKey="count"
          name="packages"
          stroke={color}
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={false}
          activeDot={{ r: 4, fill: color }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

/** Vertical bar volume — e.g. 30-day package volume. */
export function VolumeBarChart({
  data,
  height = 220,
  color = CHART_COLORS.primary,
}: {
  data: SeriesPoint[]
  height?: number
  color?: string
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <XAxis dataKey="label" tick={axisTick} axisLine={AXIS_LINE} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={40} tickFormatter={formatCompact} />
        <Tooltip cursor={{ fill: 'var(--muted)', opacity: 0.4 }} content={<ChartTooltip />} />
        <Bar dataKey="count" name="packages" fill={color} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  )
}

export interface DonutSlice {
  label: string
  value: number
  color: string
}

/** Donut — e.g. status distribution / revenue mix. Renders a centered total. */
export function DonutChart({
  data,
  height = 220,
  centerLabel,
  centerValue,
}: {
  data: DonutSlice[]
  height?: number
  centerLabel?: string
  centerValue?: string | number
}) {
  return (
    <div className="relative" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip content={<ChartTooltip />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="62%"
            outerRadius="92%"
            paddingAngle={2}
            strokeWidth={0}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      {centerValue != null && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold tracking-tight">{centerValue}</span>
          {centerLabel && (
            <span className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {centerLabel}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Horizontal bars — e.g. packages by location. */
export function HorizontalBars({
  data,
  color = CHART_COLORS.route,
  valueFormatter,
}: {
  data: { label: string; value: number }[]
  color?: string
  valueFormatter?: (v: number) => string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => (
        <li key={d.label} className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{d.label}</span>
            <span className="tabular font-medium">
              {valueFormatter ? valueFormatter(d.value) : d.value}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.value / max) * 100}%`, background: color }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}
