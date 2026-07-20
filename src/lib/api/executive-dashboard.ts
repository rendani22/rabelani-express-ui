import { supabase } from '@/lib/supabase'
import { PACKAGE_STATUS, type PackageStatus } from '@/lib/status'

// ============================================================================
// Revenue-layer types (the money)
// ============================================================================

/** Revenue + volume for a named reporting period, with period-over-period delta. */
export interface RevenueKpi {
  key: 'today' | 'week' | 'month' | 'year' | 'all'
  label: string
  /** Sub-label describing the comparison baseline (e.g. "vs yesterday"). */
  comparisonLabel: string | null
  value: number
  orders: number
  /** Average value per completed order in the period. */
  avgOrderValue: number
  /** Value change vs the previous comparable period, as a percentage. Null for all-time. */
  deltaPercent: number | null
  /** Whether the delta is an increase (for arrow direction/colour). */
  deltaUp: boolean
}

/** A point on a revenue-over-time series. */
export interface RevenueTrendPoint {
  key: string
  label: string
  value: number
  orders: number
}

/** All four granularities of the revenue trend, pre-bucketed. */
export interface RevenueTrends {
  day: RevenueTrendPoint[]
  week: RevenueTrendPoint[]
  month: RevenueTrendPoint[]
  year: RevenueTrendPoint[]
}

/** Top customer (receiver) ranked by completed-order value. */
export interface TopRevenueCustomer {
  email: string
  name: string
  value: number
  orders: number
}

/** Top inventory item ranked by completed-order value. */
export interface TopRevenueItem {
  description: string
  inventoryItemId: string | null
  value: number
  quantity: number
  orders: number
}

/** Headline figures across the collected-order book. */
export interface RevenueSummary {
  /** Realized value — orders the receiver has collected. */
  totalValue: number
  totalOrders: number
  avgOrderValue: number
  /** Value at the collection point, awaiting pickup (not yet collected). */
  pipelineValue: number
  pipelineOrders: number
  /**
   * True when the underlying query hit its row cap (figures may be partial).
   * Always false now that aggregation runs server-side, but retained so the
   * UI banner contract is stable.
   */
  truncated: boolean
}

// ============================================================================
// Story-layer types (the narrative around the money)
// ============================================================================

/** Traffic-light rating for a scorecard metric. */
export type HealthLevel = 'good' | 'watch' | 'risk' | 'neutral'

/** One tile in the executive health scorecard. */
export interface HealthMetric {
  key: string
  label: string
  /** Pre-formatted headline value (money/percent/duration already applied). */
  display: string
  /** One-line meaning — what this figure tells the executive. */
  meaning: string
  /** Optional secondary context (e.g. "142 orders", "vs last month"). */
  context: string | null
  level: HealthLevel
  /** Signed period-over-period change, when meaningful (revenue). */
  deltaPercent: number | null
  deltaUp: boolean
}

/** One stage of the order-to-collection funnel. */
export interface FunnelStage {
  key: string
  label: string
  orders: number
  /** Known ZAR value for this stage (only ready + collected are priced). */
  value: number | null
  /** Width relative to the widest stage, 0-100. */
  share: number
  /** Semantic colour token for the bar — map to token in UI. */
  colorClass: string
}

/** The order → collection conversion funnel. */
export interface FulfilmentFunnel {
  stages: FunnelStage[]
  /** Collected ÷ orders currently in the funnel, as %. */
  conversionRate: number
  totalInFunnel: number
}

/** Forward order book from purchase orders (booked, not yet realized). */
export interface OrderBook {
  /** Σ po_value across open (non-completed) POs. */
  openValue: number
  openCount: number
  completedValue: number
  completedCount: number
  /** Booked value by month, most-recent last. */
  monthly: Array<{ key: string; label: string; value: number; count: number }>
  /** False when there is no PO/po_value data to show. */
  available: boolean
}

/** Inventory position backing future fulfilment. */
export interface InventoryPosition {
  stockValue: number
  lowStock: number
  outOfStock: number
  activeItems: number
  topLowStock: Array<{ id: string; name: string; quantity: number; threshold: number }>
  available: boolean
}

/** Customer revenue concentration (dependency risk). */
export interface CustomerConcentration {
  /** Share of realized revenue from the top 5 customers, as %. */
  topFiveShare: number
  /** Share from the single largest customer, as %. */
  topCustomerShare: number
  level: HealthLevel
}

/** Auto-generated narrative briefing shown at the top of the view. */
export interface ExecutiveBriefing {
  headline: string
  paragraphs: string[]
  /** The single most important thing to watch, if any. */
  watchItem: string | null
  watchLevel: HealthLevel
}

/** The reporting window a briefing narrates. */
export type BriefingPeriod = 'today' | 'week' | 'month' | 'year'

/** One auto-written briefing per selectable period (day/week/month/year). */
export type ExecutiveBriefingSet = Record<BriefingPeriod, ExecutiveBriefing>

// ============================================================================
// Operations-layer types (the delivery side of the business)
// ============================================================================

/** One delivery location's share of order volume. */
export interface GeographyLocation {
  id: string
  name: string
  count: number
  /** Share of assigned volume, 0-100. */
  share: number
}

/** Where orders are delivered — concentration and the unassigned data gap. */
export interface DeliveryGeography {
  locations: GeographyLocation[]
  /** Orders with no delivery location — a routable-data defect, not a place. */
  unassigned: number
  totalAssigned: number
  /** Share held by the single largest location, 0-100. */
  topShare: number
  /** Concentration rating from topShare (>=50% risk, >=35% watch). */
  concentrationLevel: HealthLevel
  available: boolean
}

/**
 * Proof-of-delivery capture — a cash-protection metric (disputes need a POD).
 *
 * Everything is measured against orders *completed* in the window (`total`),
 * not against POD rows that happen to exist. An order finished with no POD is
 * the worst case the card exists to catch, so it has to sit in the denominator.
 */
export interface PodCompliance {
  /** Orders completed in the window — the denominator for every rate here. */
  total: number
  withPod: number
  withPdf: number
  locked: number
  /** Completed orders whose POD is a delivery (driver drop-off, not a pickup). */
  deliveries: number
  /** Deliveries carrying a photo — the rest cannot be evidenced beyond a signature. */
  deliveriesWithPhoto: number
  today: number
  thisWeek: number
  /** % of completed orders with a POD. The headline. */
  podRate: number
  /** % of completed orders whose POD has a captured PDF. */
  pdfRate: number
  /** % of completed orders finalized (locked). */
  lockedRate: number
  /** % of deliveries with a photo. Denominator is `deliveries`, not `total`. */
  photoRate: number
  /** Rating from podRate (>=90 good, >=75 watch, else risk). */
  level: HealthLevel
  /** Rating from photoRate, on the same bands. `neutral` when there are no deliveries. */
  photoLevel: HealthLevel
  available: boolean
}

/** Returns rate, trend, and worst locations. Root cause is not captured. */
export interface ReturnsReport {
  returnRate: number
  returnedTotal: number
  ordersTotal: number
  monthly: Array<{ key: string; label: string; count: number; rate: number }>
  byLocation: Array<{ id: string; name: string; count: number; rate: number }>
  /** True when the last three months' rate rose consecutively. */
  trendingUp: boolean
  /** A location returning at >=2x the overall rate, if any. */
  worstLocation: { id: string; name: string; count: number; rate: number } | null
  level: HealthLevel
  available: boolean
}

/** Everything the Executive dashboard view renders, in one payload. */
export interface ExecutiveDashboardData {
  summary: RevenueSummary
  kpis: RevenueKpi[]
  trends: RevenueTrends
  topCustomers: TopRevenueCustomer[]
  topItems: TopRevenueItem[]
  briefings: ExecutiveBriefingSet
  scorecard: HealthMetric[]
  funnel: FulfilmentFunnel
  orderBook: OrderBook
  inventory: InventoryPosition
  concentration: CustomerConcentration
  geography: DeliveryGeography
  podCompliance: PodCompliance
  returns: ReturnsReport
  /** Coupa email → Global PO ingestion. Never company-scoped; see `CoupaIngestion`. */
  coupaIngestion: CoupaIngestion
  /** Refresh time, for the "as of" label. */
  lastUpdated: Date
}

/** The ingestion report's window. Stated once; the RPC echoes it back for the label. */
const COUPA_WINDOW_DAYS = 30

// ============================================================================
// Internal raw-payload shapes (server-side RPC responses)
// ============================================================================

/**
 * Subset of the `get_dashboard_metrics` payload the executive story consumes.
 * The operational RPC returns far more; we map only what the narrative needs.
 */
interface DashboardOpsPayload {
  stats: {
    total: number
    completed: number
    readyForCollection: number
    inTransit: number
    pending: number
    returned: number
  }
  statusCounts: Record<string, number>
  lifecycleMetrics: {
    avgTotalCycleHours: number | null
    avgCreateToPickupHours: number | null
    avgPickupToReceiveHours: number | null
    avgReceiveToCollectHours: number | null
    completedSampleSize: number
  }
  /** The worst 10 breaches only — count with `stuckTotal`, never `.length`. */
  stuckPackages: Array<{ id: string }>
  /** True number of packages past their SLA threshold. */
  stuckTotal: number
  inventoryHealth: {
    totalValue: number
    lowStock: number
    outOfStock: number
    activeItems: number
    topLowStock: Array<{ id: string; name: string; quantity: number; threshold: number }>
  }
  /** Package volume by delivery location, plus the "unassigned" bucket. */
  locationDistribution: Array<{ id: string; name: string; count: number; unassigned?: boolean }>
  /** Proof-of-delivery capture stats. `total` is orders completed in the window. */
  podStats: {
    total: number
    withPod: number
    withPdf: number
    locked: number
    deliveries: number
    deliveriesWithPhoto: number
    today: number
    thisWeek: number
  }
  /** Returns analysis (present only once the returns migration is deployed). */
  returns?: {
    returnedTotal: number
    ordersTotal: number
    monthly: Array<{ key: string; returned: number; total: number }>
    byLocation: Array<{ id: string; name: string; returned: number; total: number }>
  }
}

/** Raw purchase-order row read directly for the order book. */
interface PurchaseOrderRow {
  status: string | null
  po_value: number | null
  po_date: string | null
  created_at: string | null
}

/** Current + prior-period value/volume, used to derive KPI deltas. */
interface PeriodFigure {
  value: number
  orders: number
}

/** A raw, unlabelled trend point as returned by the RPC. */
interface RawTrendPoint {
  key: string
  value: number
  orders: number
}

/**
 * Raw shape of the JSON document returned by the `get_executive_metrics`
 * Postgres RPC. All aggregation happens server-side; this module only maps the
 * payload onto the presentation shapes below and applies presentation concerns
 * (labels, customer display names).
 */
interface ExecutiveMetricsPayload {
  summary: RevenueSummary
  periods: {
    today: PeriodFigure
    yesterday: PeriodFigure
    week: PeriodFigure
    prevWeek: PeriodFigure
    month: PeriodFigure
    prevMonth: PeriodFigure
    year: PeriodFigure
    prevYear: PeriodFigure
    all: PeriodFigure
  }
  trends: {
    day: RawTrendPoint[]
    week: RawTrendPoint[]
    month: RawTrendPoint[]
    year: RawTrendPoint[]
  }
  topCustomers: Array<{ email: string; value: number; orders: number }>
  topItems: Array<{
    description: string
    inventoryItemId: string | null
    value: number
    quantity: number
    orders: number
  }>
}

// ============================================================================
// Empty-state defaults
// ============================================================================

const EMPTY_SUMMARY: RevenueSummary = {
  totalValue: 0,
  totalOrders: 0,
  avgOrderValue: 0,
  pipelineValue: 0,
  pipelineOrders: 0,
  truncated: false,
}

const EMPTY_ORDER_BOOK: OrderBook = {
  openValue: 0,
  openCount: 0,
  completedValue: 0,
  completedCount: 0,
  monthly: [],
  available: false,
}

const EMPTY_INVENTORY: InventoryPosition = {
  stockValue: 0,
  lowStock: 0,
  outOfStock: 0,
  activeItems: 0,
  topLowStock: [],
  available: false,
}

const EMPTY_CONCENTRATION: CustomerConcentration = {
  topFiveShare: 0,
  topCustomerShare: 0,
  level: 'neutral',
}

const EMPTY_GEOGRAPHY: DeliveryGeography = {
  locations: [],
  unassigned: 0,
  totalAssigned: 0,
  topShare: 0,
  concentrationLevel: 'neutral',
  available: false,
}

const EMPTY_POD: PodCompliance = {
  total: 0,
  withPod: 0,
  withPdf: 0,
  locked: 0,
  deliveries: 0,
  deliveriesWithPhoto: 0,
  today: 0,
  thisWeek: 0,
  podRate: 0,
  pdfRate: 0,
  lockedRate: 0,
  photoRate: 0,
  level: 'neutral',
  photoLevel: 'neutral',
  available: false,
}

/** One reason Coupa emails were rejected, with how often. */
export interface CoupaFailureBreakdown {
  /** The raw code the edge function wrote (`unknown_customer`, ...). */
  reason: string
  /** Human label; falls back to a humanised code for reasons added later. */
  label: string
  count: number
}

/**
 * Coupa email → Global PO ingestion health.
 *
 * Network-wide, never company-scoped: a failed ingestion has no purchase order
 * and so no customer — often that IS the failure — so a company-scoped figure
 * could only show successes and would report 0% failures however much was being
 * dropped. See `20260717130000_coupa_ingestion_report.sql`.
 */
export interface CoupaIngestion {
  /** Attempts that became a Global PO. */
  processed: number
  /** Attempts that did not. Each one is an order a human must key in by hand. */
  failed: number
  /** Percentage of attempts that failed. 0 when nothing was attempted. */
  failureRate: number
  /** Worst-first; empty when nothing failed. */
  reasons: CoupaFailureBreakdown[]
  lastFailureAt: Date | null
  /** The window the counts cover, as the RPC applied it. */
  windowDays: number
  level: HealthLevel
  /** False when the RPC is absent (migration not yet deployed) or errored. */
  available: boolean
}

const EMPTY_COUPA_INGESTION: CoupaIngestion = {
  processed: 0,
  failed: 0,
  failureRate: 0,
  reasons: [],
  lastFailureAt: null,
  windowDays: 30,
  level: 'neutral',
  available: false,
}

/**
 * Labels for the closed set of reason codes in
 * `supabase/functions/_shared/coupa-audit.ts`.
 *
 * Duplicated across the edge/app boundary on purpose — an edge function cannot
 * import from `src/`, and the codes travel through the database as data. The
 * fallback below means a code added there and not here degrades to a humanised
 * string rather than an empty bar.
 */
const COUPA_REASON_LABELS: Record<string, string> = {
  unreadable_email: 'Email could not be read',
  unknown_item_codes: 'Item code not in inventory',
  unknown_customer: 'Customer not identified',
  already_recorded: 'Already recorded',
  unexpected_error: 'Unexpected error',
}

const EMPTY_RETURNS: ReturnsReport = {
  returnRate: 0,
  returnedTotal: 0,
  ordersTotal: 0,
  monthly: [],
  byLocation: [],
  trendingUp: false,
  worstLocation: null,
  level: 'neutral',
  available: false,
}

// ============================================================================
// Public entry point
// ============================================================================

/**
 * Loads executive (CEO) revenue analytics.
 *
 * Fetches pre-aggregated revenue metrics from the `get_executive_metrics`
 * Postgres RPC, enriches them with operational metrics (`get_dashboard_metrics`)
 * and the forward order book (`purchase_orders`), and returns the full payload
 * the Executive dashboard renders. Revenue is realized when the receiver
 * **collects** an order; the RPC prices each order from inventory `unit_price`
 * (qty × unit_price) across the full tables — one round trip, no PostgREST row
 * cap. This module only maps the payload and applies presentation concerns
 * (labels, display names).
 *
 * Admin-only: the Executive tab that consumes this is gated on `isAdmin`, and
 * the underlying RPC/tables are additionally protected by Supabase RLS.
 */
/** Raw `get_coupa_ingestion_report` payload. */
interface CoupaIngestionPayload {
  windowDays: number
  processed: number
  failed: number
  reasons: Array<{ reason: string; count: number }>
  lastFailureAt: string | null
}

/**
 * Maps the ingestion report, rating it by failure rate.
 *
 * Any failure at all is at least a "watch": each one is a real purchase order
 * that Exxaro issued and this system did not record, sitting in someone's inbox
 * waiting to be typed in. The thresholds only decide how loudly to say so.
 */
function buildCoupaIngestion(payload: CoupaIngestionPayload | null): CoupaIngestion {
  if (!payload) return EMPTY_COUPA_INGESTION

  const processed = payload.processed ?? 0
  const failed = payload.failed ?? 0
  const total = processed + failed
  const failureRate = total > 0 ? round1((failed / total) * 100) : 0

  const level: HealthLevel =
    total === 0 ? 'neutral' : failed === 0 ? 'good' : failureRate >= 20 ? 'risk' : 'watch'

  return {
    processed,
    failed,
    failureRate,
    reasons: (payload.reasons ?? []).map((r) => ({
      reason: r.reason,
      label: COUPA_REASON_LABELS[r.reason] ?? titleCase(r.reason.replace(/_/g, ' ')),
      count: r.count,
    })),
    lastFailureAt: payload.lastFailureAt ? new Date(payload.lastFailureAt) : null,
    windowDays: payload.windowDays ?? 30,
    level,
    available: true,
  }
}

export async function fetchExecutiveDashboard(
  dateRange?: { start: Date; end?: Date },
  companyId?: string | null,
): Promise<ExecutiveDashboardData> {
  const pDateFrom = dateRange?.start ? dateRange.start.toISOString() : null
  const pDateTo = dateRange?.end ? dateRange.end.toISOString() : null
  // Only send p_company_id when a company is chosen, so the default calls still
  // match the pre-company-filter RPC signatures (backward-compatible until the
  // company-filter migration is deployed).
  const execArgs = companyId ? { p_company_id: companyId } : undefined
  const opsArgs: Record<string, unknown> = { p_date_from: pDateFrom, p_date_to: pDateTo }
  if (companyId) opsArgs.p_company_id = companyId

  // Revenue is the primary payload; operational metrics and the PO order book
  // enrich the story but must never block or blank the revenue view, so they
  // degrade gracefully.
  const [revenueRes, opsRes, poRes, coupaRes] = await Promise.all([
    supabase.rpc('get_executive_metrics', execArgs),
    supabase.rpc('get_dashboard_metrics', opsArgs),
    supabase.from('purchase_orders').select('status, po_value, po_date, created_at'),
    // Network-wide only. A failed ingestion has no customer to scope by, so
    // asking for it while company-scoped would return successes alone — a
    // failure rate that reads 0% because the failures are unattributable, not
    // because they didn't happen. Skipped rather than shown wrong.
    companyId
      ? Promise.resolve(null)
      : supabase.rpc('get_coupa_ingestion_report', { p_days: COUPA_WINDOW_DAYS }),
  ])

  const { data, error } = revenueRes
  if (error || !data) {
    throw new Error(error?.message ?? 'Failed to load executive analytics.')
  }

  const revenue = data as ExecutiveMetricsPayload

  // Operational metrics (efficiency, risk, inventory). Optional.
  const ops = !opsRes.error && opsRes.data ? (opsRes.data as DashboardOpsPayload) : null

  // Forward order book from purchase orders. Optional.
  const poRows = !poRes.error && Array.isArray(poRes.data) ? (poRes.data as PurchaseOrderRow[]) : []

  // Coupa ingestion health. Optional, and absent entirely while company-scoped
  // or before its migration is deployed — the card hides rather than lies.
  const coupa = coupaRes && !coupaRes.error && coupaRes.data ? (coupaRes.data as CoupaIngestionPayload) : null

  // Revenue presentation mapping.
  const summary: RevenueSummary = { ...EMPTY_SUMMARY, ...revenue.summary }
  const kpis = buildKpis(revenue.periods)
  const trends = buildTrends(revenue.trends)
  const topCustomers: TopRevenueCustomer[] = (revenue.topCustomers ?? []).map((c) => ({
    email: c.email,
    name: prettifyEmail(c.email),
    value: c.value,
    orders: c.orders,
  }))
  const topItems: TopRevenueItem[] = (revenue.topItems ?? []).map((i) => ({
    description: titleCase(i.description),
    inventoryItemId: i.inventoryItemId,
    value: i.value,
    quantity: i.quantity,
    orders: i.orders,
  }))

  // Story + operations layers.
  const funnel = buildFunnel(revenue, ops)
  const inventory = buildInventory(ops)
  const orderBook = buildOrderBook(poRows)

  // Operations band — built before the narrative so the briefing can cite the
  // returns trend.
  const geography = buildGeography(ops)
  const podCompliance = buildPodCompliance(ops)
  const returns = buildReturns(ops)
  const coupaIngestion = buildCoupaIngestion(coupa)

  // Concentration + the derived scorecard and narrative need both payloads.
  const concentration = buildConcentration(revenue)
  const scorecard = buildScorecard(revenue, ops)
  const briefings = buildBriefings(revenue, ops, orderBook, concentration, returns)

  return {
    summary,
    kpis,
    trends,
    topCustomers,
    topItems,
    briefings,
    scorecard,
    funnel,
    orderBook,
    inventory,
    concentration,
    geography,
    podCompliance,
    returns,
    coupaIngestion,
    lastUpdated: new Date(),
  }
}

// ============================================================================
// Revenue-layer builders
// ============================================================================

function buildKpis(p: ExecutiveMetricsPayload['periods']): RevenueKpi[] {
  return [
    toKpi('today', 'Today', 'vs yesterday', p.today, p.yesterday),
    toKpi('week', 'This Week', 'vs last week', p.week, p.prevWeek),
    toKpi('month', 'This Month', 'vs last month', p.month, p.prevMonth),
    toKpi('year', 'This Year', 'vs last year', p.year, p.prevYear),
    toKpi('all', 'All Time', null, p.all, null),
  ]
}

function toKpi(
  key: RevenueKpi['key'],
  label: string,
  comparisonLabel: string | null,
  current: PeriodFigure,
  previous: PeriodFigure | null,
): RevenueKpi {
  let deltaPercentValue: number | null = null
  if (previous) {
    if (previous.value > 0) {
      deltaPercentValue = ((current.value - previous.value) / previous.value) * 100
    } else {
      deltaPercentValue = current.value > 0 ? 100 : 0
    }
  }
  return {
    key,
    label,
    comparisonLabel,
    value: current.value,
    orders: current.orders,
    avgOrderValue: current.orders > 0 ? current.value / current.orders : 0,
    deltaPercent: deltaPercentValue,
    deltaUp: (deltaPercentValue ?? 0) >= 0,
  }
}

function buildTrends(t: ExecutiveMetricsPayload['trends']): RevenueTrends {
  return {
    day: (t?.day ?? []).map((p) => ({ ...p, label: shortDate(parseLocalDate(p.key)) })),
    week: (t?.week ?? []).map((p) => ({ ...p, label: shortDate(parseLocalDate(p.key)) })),
    month: (t?.month ?? []).map((p) => ({ ...p, label: monthLabel(parseMonthKey(p.key)) })),
    year: (t?.year ?? []).map((p) => ({ ...p, label: p.key })),
  }
}

// ============================================================================
// Story-layer builders
// ============================================================================

/**
 * Builds the order → collection funnel. Counts come from the operational status
 * distribution; ZAR value is only known for the two stages the revenue RPC
 * prices (ready-for-collection and collected).
 */
function buildFunnel(m: ExecutiveMetricsPayload, ops: DashboardOpsPayload | null): FulfilmentFunnel {
  const sc = ops?.statusCounts ?? {}
  const n = (k: PackageStatus) => Math.max(0, Math.round(Number(sc[k] ?? 0)))

  const pending = n(PACKAGE_STATUS.PENDING) + n(PACKAGE_STATUS.NOTIFIED)
  const transit = n(PACKAGE_STATUS.IN_TRANSIT)
  const ready = n(PACKAGE_STATUS.READY_FOR_COLLECTION)
  const collected = n(PACKAGE_STATUS.COLLECTED)

  const raw: Array<Omit<FunnelStage, 'share'>> = [
    // colorClass values are semantic tokens — map to token in UI.
    { key: 'pending', label: 'Pending', orders: pending, value: null, colorClass: 'warning' },
    { key: 'transit', label: 'In Transit', orders: transit, value: null, colorClass: 'info' },
    { key: 'ready', label: 'Ready to Collect', orders: ready, value: m.summary?.pipelineValue ?? null, colorClass: 'accent' },
    { key: 'collected', label: 'Collected', orders: collected, value: m.summary?.totalValue ?? null, colorClass: 'success' },
  ]

  const maxOrders = Math.max(1, ...raw.map((s) => s.orders))
  const stages: FunnelStage[] = raw.map((s) => ({ ...s, share: (s.orders / maxOrders) * 100 }))

  const totalInFunnel = pending + transit + ready + collected
  const conversionRate = totalInFunnel > 0 ? round1((collected / totalInFunnel) * 100) : 0

  return { stages, conversionRate, totalInFunnel }
}

/** Maps the operational inventory-health block onto the executive position card. */
function buildInventory(ops: DashboardOpsPayload | null): InventoryPosition {
  const ih = ops?.inventoryHealth
  if (!ih) return EMPTY_INVENTORY
  return {
    stockValue: ih.totalValue ?? 0,
    lowStock: ih.lowStock ?? 0,
    outOfStock: ih.outOfStock ?? 0,
    activeItems: ih.activeItems ?? 0,
    topLowStock: (ih.topLowStock ?? []).slice(0, 5),
    available: true,
  }
}

/**
 * Builds the delivery-geography position: order volume by location, the
 * unassigned (no-location) data gap, and a concentration rating from the
 * largest location's share.
 */
function buildGeography(ops: DashboardOpsPayload | null): DeliveryGeography {
  const dist = ops?.locationDistribution
  if (!ops || !Array.isArray(dist) || dist.length === 0) return EMPTY_GEOGRAPHY

  const unassigned = dist.find((d) => d.unassigned)?.count ?? 0
  const assigned = dist.filter((d) => !d.unassigned)
  const totalAssigned = assigned.reduce((s, d) => s + (d.count ?? 0), 0)

  const locations: GeographyLocation[] = assigned
    .map((d) => ({
      id: d.id,
      name: d.name,
      count: d.count,
      share: totalAssigned > 0 ? round1((d.count / totalAssigned) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  const topShare = locations[0]?.share ?? 0
  let concentrationLevel: HealthLevel = 'good'
  if (topShare >= 50) concentrationLevel = 'risk'
  else if (topShare >= 35) concentrationLevel = 'watch'

  return { locations, unassigned, totalAssigned, topShare, concentrationLevel, available: true }
}

/**
 * Builds proof-of-delivery compliance. A missing POD means a completed order
 * can't be proven in a dispute, so a low capture rate is a cash-collection risk.
 *
 * Rates divide by orders completed in the window — except `photoRate`, which
 * divides by deliveries: a photo is only expected where a driver dropped the
 * order off, so counting collections against it would invent non-compliance.
 */
function buildPodCompliance(ops: DashboardOpsPayload | null): PodCompliance {
  const pod = ops?.podStats
  if (!ops || !pod) return EMPTY_POD

  const rate = (n: number, d: number) => (d > 0 ? round1((n / d) * 100) : 0)
  const band = (r: number): HealthLevel => (r >= 90 ? 'good' : r >= 75 ? 'watch' : 'risk')

  const podRate = rate(pod.withPod, pod.total)
  const photoRate = rate(pod.deliveriesWithPhoto, pod.deliveries)

  // `neutral` (not 'risk') on an empty window: nothing completed means nothing
  // was missed, and a red 0% would read as a compliance failure that never
  // happened. Same for photoRate when no deliveries occurred.
  return {
    ...pod,
    podRate,
    pdfRate: rate(pod.withPdf, pod.total),
    lockedRate: rate(pod.locked, pod.total),
    photoRate,
    level: pod.total > 0 ? band(podRate) : 'neutral',
    photoLevel: pod.deliveries > 0 ? band(photoRate) : 'neutral',
    available: true,
  }
}

/**
 * Builds the returns report: overall rate, a monthly trend, and the worst
 * locations. Present only once the returns RPC extension is deployed; falls back
 * to unavailable so the card can explain itself. Root cause is not captured
 * (return reasons live in free-text notes only).
 */
function buildReturns(ops: DashboardOpsPayload | null): ReturnsReport {
  const r = ops?.returns
  if (!ops || !r) return EMPTY_RETURNS

  const returnRate = r.ordersTotal > 0 ? round1((r.returnedTotal / r.ordersTotal) * 100) : 0

  const monthly = (r.monthly ?? []).map((m) => ({
    key: m.key,
    label: monthLabel(parseMonthKey(m.key)),
    count: m.returned,
    rate: m.total > 0 ? round1((m.returned / m.total) * 100) : 0,
  }))

  const byLocation = (r.byLocation ?? [])
    .map((l) => ({
      id: l.id,
      name: l.name,
      count: l.returned,
      rate: l.total > 0 ? round1((l.returned / l.total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)

  // Trending up = last three consecutive months of rising rate.
  const rates = monthly.map((m) => m.rate)
  const n = rates.length
  const trendingUp = n >= 3 && rates[n - 1] > rates[n - 2] && rates[n - 2] > rates[n - 3]

  // A location returning at >=2x the overall rate is the one to investigate.
  const worstLocation =
    returnRate > 0 ? byLocation.find((l) => l.rate >= 2 * returnRate) ?? null : null

  let level: HealthLevel = 'good'
  if (trendingUp || worstLocation) level = 'watch'
  if (returnRate >= 15) level = 'risk'

  return {
    returnRate,
    returnedTotal: r.returnedTotal,
    ordersTotal: r.ordersTotal,
    monthly,
    byLocation,
    trendingUp,
    worstLocation,
    level,
    available: true,
  }
}

/**
 * Builds the forward order book from purchase orders. Open POs (any status
 * other than 'completed') carry committed value not yet realized; the monthly
 * series buckets booked value by `po_date` (falling back to `created_at`).
 */
function buildOrderBook(rows: PurchaseOrderRow[]): OrderBook {
  const priced = rows.filter((r) => r.po_value !== null && Number(r.po_value) > 0)
  if (priced.length === 0) return EMPTY_ORDER_BOOK

  let openValue = 0
  let openCount = 0
  let completedValue = 0
  let completedCount = 0
  const byMonth = new Map<string, { value: number; count: number }>()

  for (const r of priced) {
    const value = Number(r.po_value) || 0
    const completed = (r.status ?? '').toLowerCase() === 'completed'
    if (completed) {
      completedValue += value
      completedCount++
    } else {
      openValue += value
      openCount++
    }

    const dateStr = r.po_date ?? r.created_at
    if (dateStr) {
      const key = dateStr.slice(0, 7) // YYYY-MM
      const bucket = byMonth.get(key) ?? { value: 0, count: 0 }
      bucket.value += value
      bucket.count++
      byMonth.set(key, bucket)
    }
  }

  const monthly = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([key, b]) => ({
      key,
      label: monthLabel(parseMonthKey(key)),
      value: round2(b.value),
      count: b.count,
    }))

  return {
    openValue: round2(openValue),
    openCount,
    completedValue: round2(completedValue),
    completedCount,
    monthly,
    available: true,
  }
}

/** Share of realized revenue concentrated in the top 5 / top customer. */
function buildConcentration(m: ExecutiveMetricsPayload): CustomerConcentration {
  const total = m.summary?.totalValue ?? 0
  const customers = m.topCustomers ?? []
  if (total <= 0 || customers.length === 0) return EMPTY_CONCENTRATION

  const topFive = customers.slice(0, 5).reduce((s, c) => s + (c.value ?? 0), 0)
  const topOne = customers[0]?.value ?? 0
  const topFiveShare = round1((topFive / total) * 100)
  const topCustomerShare = round1((topOne / total) * 100)

  // A single customer > 40%, or top-5 > 75%, is a dependency risk.
  let level: HealthLevel = 'good'
  if (topCustomerShare >= 40 || topFiveShare >= 75) level = 'risk'
  else if (topCustomerShare >= 25 || topFiveShare >= 60) level = 'watch'

  return { topFiveShare, topCustomerShare, level }
}

/**
 * Builds the 5-tile health scorecard spanning money and operations: revenue
 * (MTD Δ), awaiting-collection pipeline, fulfilment time, revenue at risk (SLA
 * breaches), and the collection (conversion) rate.
 */
function buildScorecard(m: ExecutiveMetricsPayload, ops: DashboardOpsPayload | null): HealthMetric[] {
  const p = m.periods
  const summary = m.summary
  const tiles: HealthMetric[] = []

  // 1. Revenue this month + period-over-period delta.
  const monthDelta = deltaPercent(p?.month?.value ?? 0, p?.prevMonth?.value ?? 0)
  tiles.push({
    key: 'revenue',
    label: 'Revenue · This Month',
    display: formatZar(p?.month?.value ?? 0),
    meaning: 'Value collected and realized so far this month.',
    context: `${p?.month?.orders ?? 0} orders · vs last month`,
    level: monthDelta === null ? 'neutral' : monthDelta >= 0 ? 'good' : 'watch',
    deltaPercent: monthDelta,
    deltaUp: (monthDelta ?? 0) >= 0,
  })

  // 2. Pipeline value awaiting collection.
  tiles.push({
    key: 'pipeline',
    label: 'Awaiting Collection',
    display: formatZar(summary?.pipelineValue ?? 0),
    meaning: 'Revenue one step from the bank — ready, not yet picked up.',
    context: `${summary?.pipelineOrders ?? 0} orders ready`,
    level: 'neutral',
    deltaPercent: null,
    deltaUp: true,
  })

  // 3. Average fulfilment time (create → collect).
  const cycle = ops?.lifecycleMetrics?.avgTotalCycleHours ?? null
  tiles.push({
    key: 'cycle',
    label: 'Avg Fulfilment Time',
    display: formatDuration(cycle),
    meaning: 'How long an order takes from creation to collection.',
    context: ops ? `${ops.lifecycleMetrics?.completedSampleSize ?? 0} completed orders` : 'unavailable',
    level: cycleLevel(cycle),
    deltaPercent: null,
    deltaUp: true,
  })

  // 4. Revenue at risk — orders past their SLA threshold.
  const stuck = ops?.stuckTotal ?? 0
  tiles.push({
    key: 'risk',
    label: 'Revenue at Risk',
    display: `${stuck}`,
    meaning: 'Orders past their SLA window that may stall or churn.',
    context: stuck === 1 ? 'order past SLA' : 'orders past SLA',
    level: stuck === 0 ? 'good' : stuck <= 3 ? 'watch' : 'risk',
    deltaPercent: null,
    deltaUp: true,
  })

  // 5. Collection (conversion) rate.
  const total = ops?.stats?.total ?? 0
  const completed = ops?.stats?.completed ?? 0
  const rate = total > 0 ? round1((completed / total) * 100) : 0
  tiles.push({
    key: 'conversion',
    label: 'Collection Rate',
    display: ops ? `${rate}%` : '—',
    meaning: 'Share of all orders that reach the customer.',
    context: ops ? `${completed} of ${total} orders` : 'unavailable',
    level: !ops ? 'neutral' : rate >= 70 ? 'good' : rate >= 40 ? 'watch' : 'risk',
    deltaPercent: null,
    deltaUp: true,
  })

  return tiles
}

/**
 * Composes the auto-written narrative briefing (the "hook") for every
 * selectable window. Each period tells its own story — its revenue and trend,
 * the momentum behind it, and the single risk to watch — so the reader can
 * switch between day, week, month and year.
 */
function buildBriefings(
  m: ExecutiveMetricsPayload,
  ops: DashboardOpsPayload | null,
  orderBook: OrderBook,
  concentration: CustomerConcentration,
  returns: ReturnsReport,
): ExecutiveBriefingSet {
  const set = {} as ExecutiveBriefingSet
  for (const spec of BRIEFING_PERIODS) {
    set[spec.key] = buildPeriodBriefing(spec, m, ops, orderBook, concentration, returns)
  }
  return set
}

/**
 * Writes one period's briefing: a revenue headline, several supporting stories
 * (period-specific momentum first, then standing business context), and the
 * highest-priority watch item for that window.
 */
function buildPeriodBriefing(
  spec: PeriodSpec,
  m: ExecutiveMetricsPayload,
  ops: DashboardOpsPayload | null,
  orderBook: OrderBook,
  concentration: CustomerConcentration,
  returns: ReturnsReport,
): ExecutiveBriefing {
  const summary = m.summary
  const current = m.periods?.[spec.key] ?? { value: 0, orders: 0 }
  const previous = m.periods?.[spec.prevKey] ?? { value: 0, orders: 0 }
  const value = current.value ?? 0
  const orders = current.orders ?? 0
  const delta = deltaPercent(value, previous.value ?? 0)

  // Headline — revenue + direction against the comparable prior period.
  let headline: string
  if (value <= 0) {
    headline = `No revenue has been realized ${spec.thisNoun}.`
  } else if (delta === null || delta === 0) {
    headline = `${formatZar(value)} realized ${spec.thisNoun} across ${orders} ${plural(orders, 'order')}.`
  } else {
    const dir = delta > 0 ? 'up' : 'down'
    headline = `Revenue is ${formatZar(value)} ${spec.thisNoun} — ${dir} ${formatPct(Math.abs(delta))} on ${spec.prevNoun}.`
  }

  const stories: string[] = []

  // 1. Volume + average order value, with the period-over-period volume move.
  if (orders > 0) {
    const orderDelta = deltaPercent(orders, previous.orders ?? 0)
    let s = `${orders} ${plural(orders, 'order')} collected ${spec.thisNoun}, averaging ${formatZar(value / orders)} each`
    if (orderDelta !== null && orderDelta !== 0) {
      s += ` — ${orderDelta > 0 ? 'up' : 'down'} ${formatPct(Math.abs(orderDelta))} by volume`
    }
    stories.push(`${s}.`)
  }

  // 2 & 3. Momentum and a high-water mark from the period's trend series.
  const series = (m.trends?.[spec.trendKey] ?? []).map((pt) => pt.value ?? 0)
  const n = series.length
  if (value > 0 && n >= 2) {
    // Consecutive rising periods ending now (each higher than the last).
    let streak = 0
    for (let i = n - 1; i > 0; i--) {
      if (series[i] > series[i - 1]) streak++
      else break
    }
    if (streak >= 2) {
      stories.push(`That's the ${ordinal(streak)} consecutive ${spec.unit} of growth.`)
    } else {
      const prior = series.slice(0, n - 1).filter((v) => v > 0)
      if (prior.length >= 2) {
        const avg = prior.reduce((a, b) => a + b, 0) / prior.length
        const vsAvg = deltaPercent(value, avg)
        if (vsAvg !== null && Math.abs(vsAvg) >= 5) {
          stories.push(
            `Revenue runs ${formatPct(Math.abs(vsAvg))} ${vsAvg > 0 ? 'above' : 'below'} the trailing ${prior.length}-${spec.unit} average of ${formatZar(avg)}.`,
          )
        }
      }
    }

    // High-water mark: either this period is the peak, or name the peak.
    if (n >= 3) {
      const peak = Math.max(...series)
      if (value >= peak - 0.005) {
        stories.push(`This is the strongest ${spec.unit} in the trailing ${n} ${spec.units}.`)
      } else {
        stories.push(`The strongest ${spec.unit} in this window brought ${formatZar(peak)}.`)
      }
    }
  }

  // 4. Pipeline — revenue one step from the bank (standing context).
  if ((summary?.pipelineValue ?? 0) > 0) {
    stories.push(
      `${formatZar(summary.pipelineValue)} across ${summary.pipelineOrders} ${plural(summary.pipelineOrders, 'order')} is ready for collection — revenue one step from the bank.`,
    )
  }

  // 5. Forward order book, when present.
  const ob = orderBook
  if (ob.available && ob.openValue > 0) {
    stories.push(
      `${formatZar(ob.openValue)} sits in the forward order book across ${ob.openCount} open ${plural(ob.openCount, 'purchase order')}.`,
    )
  }

  // 6. The largest customer's share — a dependency story.
  const conc = concentration
  const topCustomer = m.topCustomers?.[0]
  if (topCustomer && conc.topCustomerShare > 0) {
    stories.push(
      `${prettifyEmail(topCustomer.email)} is the largest customer, driving ${formatPct(conc.topCustomerShare)} of all realized revenue.`,
    )
  }

  // 7. Fulfilment efficiency.
  const cycle = ops?.lifecycleMetrics?.avgTotalCycleHours ?? null
  if (cycle !== null) {
    stories.push(`Orders take on average ${formatDuration(cycle)} from creation to collection.`)
  }

  // Keep the ledger readable — the strongest stories first, capped.
  const paragraphs = stories.slice(0, 6)

  // The single most important watch item, in priority order. A steep revenue
  // fall is period-specific and ranks above standing concentration risk.
  const stuck = ops?.stuckTotal ?? 0
  const outOfStock = ops?.inventoryHealth?.outOfStock ?? 0
  const ret = returns

  let watchItem: string | null = null
  let watchLevel: HealthLevel = 'good'
  if (stuck > 0) {
    watchItem = `${stuck} ${plural(stuck, 'order')} ${stuck === 1 ? 'has' : 'have'} breached SLA and need attention.`
    watchLevel = stuck > 3 ? 'risk' : 'watch'
  } else if (outOfStock > 0) {
    watchItem = `${outOfStock} inventory ${plural(outOfStock, 'item')} out of stock — a threat to fulfilment.`
    watchLevel = 'risk'
  } else if (delta !== null && delta <= -15) {
    watchItem = `Revenue is down ${formatPct(Math.abs(delta))} ${spec.thisNoun} against ${spec.prevNoun}.`
    watchLevel = delta <= -30 ? 'risk' : 'watch'
  } else if (ret.available && ret.trendingUp) {
    watchItem = `Returns have risen three months running, now ${formatPct(ret.returnRate)}.`
    watchLevel = ret.level === 'risk' ? 'risk' : 'watch'
  } else if (conc.level !== 'good' && conc.level !== 'neutral') {
    watchItem = `The top 5 customers drive ${formatPct(conc.topFiveShare)} of revenue — a concentration risk.`
    watchLevel = conc.level
  } else if (value > 0) {
    watchItem = 'Operations are healthy — no SLA breaches, stockouts, or concentration flags.'
    watchLevel = 'good'
  }

  return { headline, paragraphs, watchItem, watchLevel }
}

/** Per-period narrative wiring: which payload figures and nouns to use. */
interface PeriodSpec {
  key: BriefingPeriod
  /** The comparable prior-period key on the payload. */
  prevKey: 'yesterday' | 'prevWeek' | 'prevMonth' | 'prevYear'
  /** Which pre-bucketed trend series carries this period's momentum. */
  trendKey: keyof RevenueTrends
  /** "today" / "this week" — for the current period in prose. */
  thisNoun: string
  /** "yesterday" / "last week" — for the comparison baseline in prose. */
  prevNoun: string
  /** Singular unit noun ("day", "week") for streak/average phrasing. */
  unit: string
  /** Plural unit noun ("days", "weeks"). */
  units: string
}

const BRIEFING_PERIODS: readonly PeriodSpec[] = [
  { key: 'today', prevKey: 'yesterday', trendKey: 'day', thisNoun: 'today', prevNoun: 'yesterday', unit: 'day', units: 'days' },
  { key: 'week', prevKey: 'prevWeek', trendKey: 'week', thisNoun: 'this week', prevNoun: 'last week', unit: 'week', units: 'weeks' },
  { key: 'month', prevKey: 'prevMonth', trendKey: 'month', thisNoun: 'this month', prevNoun: 'last month', unit: 'month', units: 'months' },
  { key: 'year', prevKey: 'prevYear', trendKey: 'year', thisNoun: 'this year', prevNoun: 'last year', unit: 'year', units: 'years' },
]

// ============================================================================
// Pure date/format helpers
// ============================================================================

/** Parse a `YYYY-MM-DD` key as a local date (avoids UTC-midnight day shift). */
function parseLocalDate(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** Parse a `YYYY-MM` month key to the first of that month, local time. */
function parseMonthKey(key: string): Date {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, 1)
}

function shortDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', { month: 'short', day: 'numeric' })
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString('en-ZA', { month: 'short', year: '2-digit' })
}

function prettifyEmail(email: string): string {
  const local = email.split('@')[0] ?? email
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (c) => c.toUpperCase())
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Percentage change of `current` vs `previous`. Null when no prior baseline. */
function deltaPercent(current: number, previous: number): number | null {
  if (previous > 0) return round1(((current - previous) / previous) * 100)
  if (current > 0) return 100
  return null
}

/** Health rating for the average fulfilment cycle time (hours). */
function cycleLevel(hours: number | null): HealthLevel {
  if (hours === null) return 'neutral'
  if (hours <= 48) return 'good'
  if (hours <= 96) return 'watch'
  return 'risk'
}

/** Compact ZAR for narrative strings (the UI handles template display). */
function formatZar(value: number): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

/** Humanises an hours figure as "20h" or "1.8 days". */
function formatDuration(hours: number | null): string {
  if (hours === null || Number.isNaN(hours)) return '—'
  if (hours < 48) return `${Math.round(hours)}h`
  return `${round1(hours / 24)} days`
}

function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`
}

/** Formats a percentage, dropping a trailing ".0" (e.g. "12%", "7.5%"). */
function formatPct(n: number): string {
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)}%`
}

/** Ordinal suffix for small counts: 2 → "2nd", 3 → "3rd", 4 → "4th". */
function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}
