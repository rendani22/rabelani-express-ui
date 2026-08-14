/**
 * Operations Dashboard data module.
 *
 * Framework-agnostic port of the legacy Angular `DashboardService`
 * (`features/dashboard/services/dashboard.service.ts`). No Angular, no signals —
 * plain async functions over the shared Supabase client.
 *
 * The dashboard's live data path is a single server-side aggregation RPC,
 * `get_dashboard_metrics`, that returns every metric pre-computed across the
 * full tables (one round trip, no PostgREST 1000-row cap). `fetchOperationsDashboard`
 * calls that RPC and applies presentation concerns (labels, relative times, series
 * labelling) exactly as the Angular service's `applyMetrics` + build helpers did.
 *
 * The direct-query helpers (`fetchLocationDistribution`, `fetchDriverPerformance`,
 * `fetchLifecycleAndStuck`, `fetchInventoryHealth`, `fetchTopShippedItems`) are
 * faithful ports of the legacy service's private client-side aggregation methods.
 * The current RPC-based dashboard does not call them — they are kept here so the
 * exact table/column/filter query logic is preserved and available.
 */
import { supabase } from '@/lib/supabase'
import { logger } from '@/lib/logger'
import { PACKAGE_STATUS, type PackageStatus } from '@/lib/status'

// ============================================================================
// Minimal local models (ported fields only — no Angular core import)
// ============================================================================

/** Minimal staff profile shape as returned inside the dashboard metrics payload. */
export interface StaffProfile {
  id: string
  user_id: string
  email: string
  full_name: string
  role: string
  is_active: boolean
  avatar_url?: string
  phone?: string
  department?: string
  created_at: string
  updated_at: string
}

// ============================================================================
// Result interfaces (field names identical to the Angular service)
// ============================================================================

/**
 * Dashboard statistics for package overview.
 *
 * Every figure here except `drafts` counts *released* orders only — a draft is
 * captured but deliberately not sent to the receiver, so it has no pipeline
 * stage, no SLA clock and nothing to fulfil. `total` is therefore the exact sum
 * of the status buckets, and `drafts` sits alongside it as the count the
 * headline leaves out.
 */
export interface PackageStats {
  total: number
  pending: number
  inTransit: number
  readyForCollection: number
  completed: number
  returned: number
  todayCount: number
  weeklyCount: number
  monthlyCount: number
  /** Captured-but-unreleased orders. Excluded from every other field here. */
  drafts: number
}

/** Status distribution item for charts */
export interface StatusDistribution {
  label: string
  value: number
  color: string
  status: PackageStatus
}

/** Time series data point */
export interface TimeSeriesDataPoint {
  date: string
  label: string
  count: number
}

/** Recent package activity item */
export interface PackageActivity {
  id: string
  reference: string
  receiverEmail: string
  status: PackageStatus
  statusLabel: string
  createdAt: Date
  timeAgo: string
}

/** Driver statistics for dashboard */
export interface DriverStats {
  total: number
  active: number
  onDelivery: number
  packagesInTransit: number
  totalPackages: number
  drivers: StaffProfile[]
}

/** POD (Proof of Delivery) statistics */
export interface PodStats {
  total: number
  withPdf: number
  today: number
  thisWeek: number
}

/** Delivery location package count */
export interface LocationDistribution {
  id: string
  name: string
  count: number
  unassigned?: boolean
}

/** Top receiver by package count */
export interface TopReceiver {
  email: string
  name: string
  count: number
}

/** Per-driver delivery performance row. */
export interface DriverPerformance {
  driverUserId: string
  name: string
  pickups: number
  delivered: number
  inTransit: number
  /** Average hours from picked_up_at → received_at (or collected_at when no received) */
  avgDeliveryHours: number | null
  completionRate: number
  /**
   * Orders this driver still held at 20:00 SAST, sent back to `notified` by the
   * nightly revert. Sourced from `package_revert_events`, not from the packages
   * table — the revert clears `picked_up_by`, so a reverted order also drops out
   * of `pickups` above. Rolling 30 days; not affected by the date filter.
   */
  revertedLast30Days: number
  /** Same, over all recorded history. Only counts reverts since 2026-07-17 — earlier ones were never recorded. */
  revertedAllTime: number
}

/** Aggregated package lifecycle / cycle-time metrics across the period. */
export interface LifecycleMetrics {
  /** Average hours: created → picked up */
  avgCreateToPickupHours: number | null
  /** Average hours: picked up → received at collection point */
  avgPickupToReceiveHours: number | null
  /** Average hours: received at collection point → collected by receiver */
  avgReceiveToCollectHours: number | null
  /** Average hours: created → collected (full lifecycle) */
  avgTotalCycleHours: number | null
  /** Number of fully-completed packages used to compute totalCycle */
  completedSampleSize: number
  /** Average hours: created → completion, for orders the POD marks 'Delivered' */
  avgCreateToDeliveredHours: number | null
  /** Number of 'Delivered'-completion orders in the average */
  deliveredSampleSize: number
  /** Average hours: created → completion, for orders the POD marks 'Collected' */
  avgCreateToCollectedHours: number | null
  /** Number of 'Collected'-completion orders in the average */
  collectedSampleSize: number
}

/** A package that has been "stuck" in a status longer than the SLA threshold. */
export interface StuckPackage {
  id: string
  reference: string
  status: PackageStatus
  statusLabel: string
  hoursStuck: number
  thresholdHours: number
  receiverEmail: string
}

/**
 * A breaching package with the contact and timing detail needed to work the
 * list — the export shape, from the uncapped `get_sla_breaches` RPC. The
 * dashboard's `stuckPackages` is the same set, truncated to the worst 10.
 */
export interface SlaBreach extends StuckPackage {
  /** From receiver_profiles; null when the package has no linked profile. */
  receiverName: string | null
  receiverPhone: string | null
  /** hoursStuck − thresholdHours: how far past the SLA this order actually is. */
  hoursOverdue: number
  createdAt: string
  updatedAt: string
}

/** Inventory health snapshot for the dashboard. */
export interface InventoryHealth {
  totalItems: number
  activeItems: number
  lowStock: number
  outOfStock: number
  totalQuantity: number
  totalValue: number
  /** Items below threshold sorted by severity, top 5. */
  topLowStock: Array<{ id: string; name: string; quantity: number; threshold: number }>
}

/** A frequently-shipped item (joined from `package_items`). */
export interface TopShippedItem {
  description: string
  /** Sum of `quantity` across package_items rows in scope. */
  totalQuantity: number
  /** Number of packages this item appeared in. */
  packageCount: number
  /** Optional inventory item id, when linked. */
  inventoryItemId: string | null
  /** Matching package ids for deep-linking into Orders. */
  packageIds: string[]
}

/**
 * Hourly activity heatmap. 7 rows (Sun..Sat), 24 columns (00..23).
 * Values are package-creation counts.
 */
export interface HourlyHeatmap {
  /** counts[dayOfWeek0..6][hour0..23]. dayOfWeek 0=Sun … 6=Sat (matches Date#getDay()) */
  counts: number[][]
  max: number
  total: number
}

/**
 * Raw shape of the JSON document returned by the `get_dashboard_metrics`
 * Postgres RPC. All aggregation happens server-side; this module only maps
 * the payload onto the presentation shapes above.
 */
interface DashboardMetricsPayload {
  /** `drafts` is optional: it arrives only once the draft-split migration is deployed. */
  stats: Omit<PackageStats, 'drafts'> & { drafts?: number }
  statusCounts: Record<string, number>
  weeklyTimeSeries: Array<{ date: string; count: number }>
  monthlyTimeSeries: Array<{ date: string; count: number }>
  recentActivity: Array<{
    id: string
    reference: string
    receiverEmail: string
    status: PackageStatus
    createdAt: string
  }>
  topReceivers: Array<{ email: string; count: number }>
  hourlyBuckets: Array<{ dow: number; hour: number; count: number }>
  driverPerformance: DriverPerformance[]
  lifecycleMetrics: LifecycleMetrics
  stuckPackages: Array<Omit<StuckPackage, 'statusLabel'>>
  /** True count of breaching packages — `stuckPackages` is capped at 10. */
  stuckTotal: number
  driverStats: DriverStats
  podStats: PodStats
  locationDistribution: LocationDistribution[]
  inventoryHealth: InventoryHealth
  topShippedItems: Array<Omit<TopShippedItem, 'description'> & { description: string }>
}

/**
 * The complete bundle the dashboard component reads. One object per dashboard
 * load, assembled from the `get_dashboard_metrics` RPC payload.
 */
export interface OperationsDashboardData {
  stats: PackageStats
  statusDistribution: StatusDistribution[]
  weeklyTimeSeries: TimeSeriesDataPoint[]
  monthlyTimeSeries: TimeSeriesDataPoint[]
  /** recentActivity is no longer read by the component; included for completeness. */
  recentActivity: PackageActivity[]
  driverStats: DriverStats
  podStats: PodStats
  locationDistribution: LocationDistribution[]
  topReceivers: TopReceiver[]
  driverPerformance: DriverPerformance[]
  lifecycleMetrics: LifecycleMetrics
  /** The worst 10 breaches — the SLA card's list. */
  stuckPackages: StuckPackage[]
  /** How many breaches there are in total; `stuckPackages.length` is capped at 10. */
  stuckTotal: number
  inventoryHealth: InventoryHealth
  topShippedItems: TopShippedItem[]
  hourlyHeatmap: HourlyHeatmap
}

// ============================================================================
// Empty defaults (mirror the Angular service's initial signal values)
// ============================================================================

const EMPTY_STATS: PackageStats = {
  total: 0,
  pending: 0,
  inTransit: 0,
  readyForCollection: 0,
  completed: 0,
  returned: 0,
  todayCount: 0,
  weeklyCount: 0,
  monthlyCount: 0,
  drafts: 0,
}

const EMPTY_DRIVER_STATS: DriverStats = {
  total: 0,
  active: 0,
  onDelivery: 0,
  packagesInTransit: 0,
  totalPackages: 0,
  drivers: [],
}

const EMPTY_POD_STATS: PodStats = {
  total: 0,
  withPdf: 0,
  today: 0,
  thisWeek: 0,
}

const EMPTY_LIFECYCLE: LifecycleMetrics = {
  avgCreateToPickupHours: null,
  avgPickupToReceiveHours: null,
  avgReceiveToCollectHours: null,
  avgTotalCycleHours: null,
  completedSampleSize: 0,
  avgCreateToDeliveredHours: null,
  deliveredSampleSize: 0,
  avgCreateToCollectedHours: null,
  collectedSampleSize: 0,
}

const EMPTY_INVENTORY: InventoryHealth = {
  totalItems: 0,
  activeItems: 0,
  lowStock: 0,
  outOfStock: 0,
  totalQuantity: 0,
  totalValue: 0,
  topLowStock: [],
}

function emptyHeatmap(): HourlyHeatmap {
  return {
    counts: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0)),
    max: 0,
    total: 0,
  }
}

function emptyDashboard(): OperationsDashboardData {
  return {
    stats: EMPTY_STATS,
    statusDistribution: [],
    weeklyTimeSeries: [],
    monthlyTimeSeries: [],
    recentActivity: [],
    driverStats: EMPTY_DRIVER_STATS,
    podStats: EMPTY_POD_STATS,
    locationDistribution: [],
    topReceivers: [],
    driverPerformance: [],
    lifecycleMetrics: EMPTY_LIFECYCLE,
    stuckPackages: [],
    stuckTotal: 0,
    inventoryHealth: EMPTY_INVENTORY,
    topShippedItems: [],
    hourlyHeatmap: emptyHeatmap(),
  }
}

// ============================================================================
// Public: load all dashboard data via the server-side aggregation RPC
// ============================================================================

/**
 * Load all dashboard data via the `get_dashboard_metrics` RPC.
 *
 * A single call returns every metric the dashboard renders, computed across the
 * full tables in Postgres. On failure an empty (zeroed) bundle is returned so a
 * transient error doesn't throw into the caller — mirrors the Angular service,
 * which left its signals untouched on error.
 */
export async function fetchOperationsDashboard(
  dateRange?: { start: Date; end?: Date },
  companyId?: string | null,
): Promise<OperationsDashboardData> {
  const dateFrom = dateRange?.start?.toISOString() ?? null
  const dateTo = dateRange?.end
    ? toEndOfDay(dateRange.end)
    : dateRange?.start
      ? toEndOfDay(dateRange.start)
      : null

  try {
    // Only send p_company_id when a company is chosen, so the default call still
    // matches the pre-company-filter RPC signature (backward-compatible until the
    // company-filter migration is deployed).
    const args: Record<string, unknown> = { p_date_from: dateFrom, p_date_to: dateTo }
    if (companyId) args.p_company_id = companyId
    const { data, error } = await supabase.rpc('get_dashboard_metrics', args)

    if (error || !data) {
      logger.error(error, { op: 'operationsDashboard.get_dashboard_metrics' })
      return emptyDashboard()
    }

    return mapMetrics(data as DashboardMetricsPayload)
  } catch (err) {
    logger.error(err, { op: 'operationsDashboard.metrics' })
    return emptyDashboard()
  }
}

/**
 * Every package currently past its SLA threshold — the full list behind the
 * dashboard's top-10 card, for the CSV export.
 *
 * No date range: a breach is measured from `updated_at` against now(), so it is
 * always "as of this moment". Company scope still applies. Unlike
 * `fetchOperationsDashboard` this throws on failure, because it is called from a
 * user-initiated download that must surface an error rather than silently hand
 * back an empty file.
 */
export async function fetchSlaBreaches(companyId?: string | null): Promise<SlaBreach[]> {
  const { data, error } = await supabase.rpc('get_sla_breaches', {
    p_company_id: companyId ?? null,
  })

  if (error) {
    logger.error(error, { op: 'operationsDashboard.get_sla_breaches' })
    throw error
  }

  return buildStuckPackages((data ?? []) as Array<Omit<SlaBreach, 'statusLabel'>>)
}

/** Maps the RPC payload onto the presentation bundle (port of `applyMetrics`). */
function mapMetrics(m: DashboardMetricsPayload): OperationsDashboardData {
  return {
    // Pre-migration payloads have no `drafts`; 0 is honest there — drafts were
    // folded into the other counts, so there is no separate figure to report.
    stats: { ...m.stats, drafts: m.stats.drafts ?? 0 },
    statusDistribution: buildStatusDistribution(m.statusCounts),
    weeklyTimeSeries: buildWeeklySeries(m.weeklyTimeSeries),
    monthlyTimeSeries: buildMonthlySeries(m.monthlyTimeSeries),
    recentActivity: buildRecentActivity(m.recentActivity),
    topReceivers: buildTopReceivers(m.topReceivers),
    hourlyHeatmap: buildHeatmap(m.hourlyBuckets, m.stats.total),
    driverPerformance: m.driverPerformance ?? [],
    lifecycleMetrics: m.lifecycleMetrics,
    stuckPackages: buildStuckPackages(m.stuckPackages),
    // Falls back to the (capped) list length if the RPC predates stuckTotal.
    stuckTotal: m.stuckTotal ?? m.stuckPackages?.length ?? 0,
    driverStats: {
      ...m.driverStats,
      drivers: (m.driverStats?.drivers ?? []) as StaffProfile[],
    },
    podStats: m.podStats,
    locationDistribution: m.locationDistribution ?? [],
    inventoryHealth: m.inventoryHealth,
    topShippedItems: (m.topShippedItems ?? []).map(item => ({
      ...item,
      description: titleCase(item.description),
    })),
  }
}

// ============================================================================
// Payload -> presentation builders (ported verbatim)
// ============================================================================

function buildStatusDistribution(counts: Record<string, number>): StatusDistribution[] {
  const c = (key: string) => counts?.[key] ?? 0
  return [
    {
      label: 'Pending',
      value: c(PACKAGE_STATUS.PENDING) + c(PACKAGE_STATUS.NOTIFIED),
      color: PACKAGE_STATUS.PENDING, // map to token in UI
      status: PACKAGE_STATUS.PENDING,
    },
    {
      label: 'In Transit',
      value: c(PACKAGE_STATUS.IN_TRANSIT),
      color: PACKAGE_STATUS.IN_TRANSIT, // map to token in UI
      status: PACKAGE_STATUS.IN_TRANSIT,
    },
    {
      label: 'Ready',
      value: c(PACKAGE_STATUS.READY_FOR_COLLECTION),
      color: PACKAGE_STATUS.READY_FOR_COLLECTION, // map to token in UI
      status: PACKAGE_STATUS.READY_FOR_COLLECTION,
    },
    {
      label: 'Completed',
      value: c(PACKAGE_STATUS.DELIVERED) + c(PACKAGE_STATUS.COLLECTED),
      color: PACKAGE_STATUS.COLLECTED, // map to token in UI
      status: PACKAGE_STATUS.COLLECTED,
    },
    {
      label: 'Canceled',
      value: c(PACKAGE_STATUS.RETURNED),
      color: PACKAGE_STATUS.RETURNED, // map to token in UI
      status: PACKAGE_STATUS.RETURNED,
    },
  ].filter(item => item.value > 0)
}

function buildWeeklySeries(rows: Array<{ date: string; count: number }>): TimeSeriesDataPoint[] {
  return (rows ?? []).map(r => ({
    date: r.date,
    label: formatDayLabel(parseLocalDate(r.date)),
    count: r.count,
  }))
}

function buildMonthlySeries(rows: Array<{ date: string; count: number }>): TimeSeriesDataPoint[] {
  const list = rows ?? []
  const lastIndex = list.length - 1
  return list.map((r, i) => {
    // Show a label roughly every 5 days (and always on the most recent day)
    // to avoid clutter — mirrors the original 30-day chart.
    const daysAgo = lastIndex - i
    const showLabel = daysAgo % 5 === 0 || i === lastIndex
    return {
      date: r.date,
      label: showLabel ? formatShortDate(parseLocalDate(r.date)) : '',
      count: r.count,
    }
  })
}

function buildRecentActivity(
  rows: DashboardMetricsPayload['recentActivity'],
): PackageActivity[] {
  return (rows ?? []).map(r => {
    const createdAt = new Date(r.createdAt)
    return {
      id: r.id,
      reference: r.reference,
      receiverEmail: r.receiverEmail,
      status: r.status,
      statusLabel: getStatusLabel(r.status),
      createdAt,
      timeAgo: getTimeAgo(createdAt),
    }
  })
}

function buildTopReceivers(rows: Array<{ email: string; count: number }>): TopReceiver[] {
  return (rows ?? []).map(r => ({
    email: r.email,
    name: r.email.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    count: r.count,
  }))
}

function buildHeatmap(
  buckets: Array<{ dow: number; hour: number; count: number }>,
  total: number,
): HourlyHeatmap {
  const counts = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
  for (const b of buckets ?? []) {
    if (b.dow >= 0 && b.dow < 7 && b.hour >= 0 && b.hour < 24) {
      counts[b.dow][b.hour] = b.count
    }
  }
  const max = Math.max(0, ...counts.flat())
  return { counts, max, total }
}

/** Adds the display label to any stuck/breaching row, preserving its extra fields. */
function buildStuckPackages<T extends Omit<StuckPackage, 'statusLabel'>>(
  rows: T[],
): Array<T & { statusLabel: string }> {
  return (rows ?? []).map(r => ({
    ...r,
    statusLabel: getStatusLabel(r.status),
  }))
}

// ============================================================================
// Direct-query helpers — faithful ports of the legacy private methods.
// Not used by `fetchOperationsDashboard` (the RPC returns these pre-aggregated),
// but preserved so the exact table/column/filter/aggregation logic is available.
// ============================================================================

/** Port of `loadLocationDistribution`. */
export async function fetchLocationDistribution(
  dateFrom?: string,
  dateTo?: string,
): Promise<LocationDistribution[]> {
  try {
    // Load active delivery locations
    const { data: locations } = await supabase
      .from('delivery_locations')
      .select('id, name')
      .eq('is_active', true)
      .order('name')

    // Load packages with their delivery_location_id, optionally filtered by date
    let pkgQuery = supabase
      .from('packages')
      .select('delivery_location_id')
      .is('deleted_at', null)

    if (dateFrom) pkgQuery = pkgQuery.gte('created_at', dateFrom)
    if (dateTo) pkgQuery = pkgQuery.lte('created_at', dateTo)

    const { data: packages } = await pkgQuery

    if (!packages) return []

    // Count packages per location
    const countMap = new Map<string, number>()
    let unassignedCount = 0

    for (const pkg of packages as Array<{ delivery_location_id: string | null }>) {
      if (pkg.delivery_location_id) {
        countMap.set(pkg.delivery_location_id, (countMap.get(pkg.delivery_location_id) ?? 0) + 1)
      } else {
        unassignedCount++
      }
    }

    const locationList: LocationDistribution[] = ((locations ?? []) as Array<{ id: string; name: string }>)
      .map(loc => ({
        id: loc.id,
        name: loc.name,
        count: countMap.get(loc.id) ?? 0,
      }))
      .filter(l => l.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)

    if (unassignedCount > 0) {
      locationList.push({ id: 'unassigned', name: 'No Location', count: unassignedCount, unassigned: true })
    }

    return locationList
  } catch (err) {
    logger.warn(err, { op: 'operationsDashboard.locationDistribution' })
    return []
  }
}

/** Port of `loadDriverPerformance`. Aggregations are client-side (no GROUP BY in PostgREST). */
export async function fetchDriverPerformance(
  dateFrom?: string,
  dateTo?: string,
): Promise<DriverPerformance[]> {
  try {
    // 1. Load all drivers for name resolution
    const { data: driversData } = await supabase
      .from('staff_profiles')
      .select('user_id, full_name, is_active')
      .eq('role', 'driver')

    const drivers = (driversData ?? []) as Array<{ user_id: string; full_name: string; is_active: boolean }>
    const nameByUserId = new Map(drivers.map(d => [d.user_id, d.full_name]))

    // 2. Load packages with driver assignment within the date range
    let pkgQuery = supabase
      .from('packages')
      .select('id, status, picked_up_by, picked_up_at, received_at, collected_at')
      .not('picked_up_by', 'is', null)
      .is('deleted_at', null)

    if (dateFrom) pkgQuery = pkgQuery.gte('created_at', dateFrom)
    if (dateTo) pkgQuery = pkgQuery.lte('created_at', dateTo)

    const { data: pkgs, error } = await pkgQuery
    if (error || !pkgs) return []

    // 3. Revert events. Deliberately not date-filtered — the windows (rolling
    //    30 days, all-time) are intrinsic to the metric, matching the RPC.
    const { data: revertRows } = await supabase
      .from('package_revert_events')
      .select('driver_user_id, reverted_at')
      .not('driver_user_id', 'is', null)

    const cutoff30d = Date.now() - 30 * 24 * 3600_000
    const revertsByDriver = new Map<string, { last30: number; allTime: number }>()
    ;(revertRows ?? []).forEach(r => {
      const row = r as { driver_user_id: string; reverted_at: string }
      const bucket = revertsByDriver.get(row.driver_user_id) ?? { last30: 0, allTime: 0 }
      bucket.allTime++
      if (new Date(row.reverted_at).getTime() >= cutoff30d) bucket.last30++
      revertsByDriver.set(row.driver_user_id, bucket)
    })

    type Row = {
      id: string
      status: PackageStatus
      picked_up_by: string
      picked_up_at: string | null
      received_at: string | null
      collected_at: string | null
    }

    const byDriver = new Map<string, { pickups: number; delivered: number; inTransit: number; hours: number[] }>()

    ;(pkgs as Row[]).forEach(p => {
      const bucket = byDriver.get(p.picked_up_by) ?? { pickups: 0, delivered: 0, inTransit: 0, hours: [] }
      bucket.pickups++

      if (p.status === PACKAGE_STATUS.IN_TRANSIT) bucket.inTransit++
      const isDelivered =
        p.status === PACKAGE_STATUS.READY_FOR_COLLECTION ||
        p.status === PACKAGE_STATUS.COLLECTED ||
        p.status === PACKAGE_STATUS.DELIVERED
      if (isDelivered) bucket.delivered++

      // pickup → received (or collected when received_at missing)
      const endIso = p.received_at ?? p.collected_at
      if (p.picked_up_at && endIso) {
        const hrs = (new Date(endIso).getTime() - new Date(p.picked_up_at).getTime()) / 3600000
        if (hrs >= 0 && hrs < 24 * 30) bucket.hours.push(hrs) // sanity cap
      }

      byDriver.set(p.picked_up_by, bucket)
    })

    const totalDelivered = Array.from(byDriver.values()).reduce((s, b) => s + b.delivered, 0)

    // A driver whose every order was reverted has no packages carrying their
    // picked_up_by, so they are absent from byDriver — add them back, or the
    // worst performer is the one who disappears.
    revertsByDriver.forEach((_, userId) => {
      if (!byDriver.has(userId)) {
        byDriver.set(userId, { pickups: 0, delivered: 0, inTransit: 0, hours: [] })
      }
    })

    return Array.from(byDriver.entries())
      .map(([userId, b]) => ({
        driverUserId: userId,
        name: nameByUserId.get(userId) ?? 'Unknown driver',
        pickups: b.pickups,
        delivered: b.delivered,
        inTransit: b.inTransit,
        avgDeliveryHours:
          b.hours.length > 0
            ? Math.round((b.hours.reduce((s, h) => s + h, 0) / b.hours.length) * 10) / 10
            : null,
        completionRate: totalDelivered > 0 ? Math.round((b.delivered / totalDelivered) * 100) : 0,
        revertedLast30Days: revertsByDriver.get(userId)?.last30 ?? 0,
        revertedAllTime: revertsByDriver.get(userId)?.allTime ?? 0,
      }))
      .sort((a, b) => b.delivered - a.delivered || b.pickups - a.pickups)
      .slice(0, 8)
  } catch (err) {
    logger.warn(err, { op: 'operationsDashboard.driverPerformance' })
    return []
  }
}

/** Port of `loadLifecycleAndStuck`. Returns both the lifecycle metrics and the stuck-package list. */
export async function fetchLifecycleAndStuck(
  dateFrom?: string,
  dateTo?: string,
): Promise<{ lifecycleMetrics: LifecycleMetrics; stuckPackages: StuckPackage[] }> {
  try {
    // Pull lifecycle timestamps for all in-scope packages
    let q = supabase
      .from('packages')
      .select('id, reference, status, receiver_email, created_at, updated_at, picked_up_at, received_at, collected_at')
      .is('deleted_at', null)

    if (dateFrom) q = q.gte('created_at', dateFrom)
    if (dateTo) q = q.lte('created_at', dateTo)

    const { data, error } = await q
    if (error || !data) return { lifecycleMetrics: EMPTY_LIFECYCLE, stuckPackages: [] }

    type Row = {
      id: string
      reference: string
      status: PackageStatus
      receiver_email: string
      created_at: string
      updated_at: string
      picked_up_at: string | null
      received_at: string | null
      collected_at: string | null
    }

    const rows = data as Row[]

    const c2pSamples: number[] = []
    const p2rSamples: number[] = []
    const r2cSamples: number[] = []
    const totalSamples: number[] = []

    for (const r of rows) {
      const created = new Date(r.created_at).getTime()
      const pickedUp = r.picked_up_at ? new Date(r.picked_up_at).getTime() : null
      const received = r.received_at ? new Date(r.received_at).getTime() : null
      const collected = r.collected_at ? new Date(r.collected_at).getTime() : null

      if (pickedUp && pickedUp >= created) c2pSamples.push((pickedUp - created) / 3600000)
      if (pickedUp && received && received >= pickedUp) p2rSamples.push((received - pickedUp) / 3600000)
      if (received && collected && collected >= received) r2cSamples.push((collected - received) / 3600000)
      if (collected && collected >= created && r.status === PACKAGE_STATUS.COLLECTED) {
        totalSamples.push((collected - created) / 3600000)
      }
    }

    const avg = (xs: number[]) =>
      xs.length === 0 ? null : Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10

    const lifecycleMetrics: LifecycleMetrics = {
      avgCreateToPickupHours: avg(c2pSamples),
      avgPickupToReceiveHours: avg(p2rSamples),
      avgReceiveToCollectHours: avg(r2cSamples),
      avgTotalCycleHours: avg(totalSamples),
      completedSampleSize: totalSamples.length,
      // The Delivered/Collected split needs the pods join — only the RPC path
      // (get_dashboard_metrics) computes it; this legacy fallback leaves it empty.
      avgCreateToDeliveredHours: null,
      deliveredSampleSize: 0,
      avgCreateToCollectedHours: null,
      collectedSampleSize: 0,
    }

    // Per-status SLA thresholds (hours). Tune as needed.
    const slaHours: Record<string, number> = {
      [PACKAGE_STATUS.PENDING]: 24,
      [PACKAGE_STATUS.NOTIFIED]: 24,
      [PACKAGE_STATUS.IN_TRANSIT]: 24,
      [PACKAGE_STATUS.READY_FOR_COLLECTION]: 72,
    }

    const now = Date.now()
    const stuckPackages: StuckPackage[] = rows
      .filter(r => slaHours[r.status] !== undefined)
      .map(r => {
        const reference = new Date(r.updated_at).getTime()
        const hoursStuck = Math.floor((now - reference) / 3600000)
        return { row: r, hoursStuck, threshold: slaHours[r.status] }
      })
      .filter(({ hoursStuck, threshold }) => hoursStuck > threshold)
      .sort((a, b) => b.hoursStuck - a.hoursStuck)
      .slice(0, 10)
      .map(({ row, hoursStuck, threshold }) => ({
        id: row.id,
        reference: row.reference,
        status: row.status,
        statusLabel: getStatusLabel(row.status),
        hoursStuck,
        thresholdHours: threshold,
        receiverEmail: row.receiver_email,
      }))

    return { lifecycleMetrics, stuckPackages }
  } catch (err) {
    logger.warn(err, { op: 'operationsDashboard.lifecycleStuck' })
    return { lifecycleMetrics: EMPTY_LIFECYCLE, stuckPackages: [] }
  }
}

/** Port of `loadInventoryHealth`. All aggregations client-side. */
export async function fetchInventoryHealth(): Promise<InventoryHealth> {
  try {
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, name, quantity, low_stock_threshold, unit_price, is_active')

    if (error || !data) return EMPTY_INVENTORY

    type Row = {
      id: string
      name: string
      quantity: number
      low_stock_threshold: number
      unit_price: number | null
      is_active: boolean
    }

    const rows = data as Row[]
    const active = rows.filter(r => r.is_active)

    const totalQuantity = active.reduce((s, r) => s + (r.quantity ?? 0), 0)
    const totalValue = active.reduce((s, r) => s + (r.quantity ?? 0) * (r.unit_price ?? 0), 0)

    const lowStock = active.filter(r => r.quantity > 0 && r.quantity <= (r.low_stock_threshold ?? 0))
    const outOfStock = active.filter(r => r.quantity === 0)

    const topLowStock = [...lowStock, ...outOfStock]
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5)
      .map(r => ({
        id: r.id,
        name: r.name,
        quantity: r.quantity,
        threshold: r.low_stock_threshold ?? 0,
      }))

    return {
      totalItems: rows.length,
      activeItems: active.length,
      lowStock: lowStock.length,
      outOfStock: outOfStock.length,
      totalQuantity,
      totalValue: Math.round(totalValue * 100) / 100,
      topLowStock,
    }
  } catch (err) {
    logger.warn(err, { op: 'operationsDashboard.inventoryHealth' })
    return EMPTY_INVENTORY
  }
}

/** Port of `loadTopShippedItems`. Joins package_items → packages for the date filter. */
export async function fetchTopShippedItems(
  dateFrom?: string,
  dateTo?: string,
): Promise<TopShippedItem[]> {
  try {
    // Use embedded select: package_items joined with packages for date filter.
    // When no date range, just pull the latest 1000 package_items.
    let query = supabase
      .from('package_items')
      .select('package_id, quantity, description, inventory_item_id, packages!inner(created_at, deleted_at)')
      .is('packages.deleted_at', null)
      .limit(2000)

    if (dateFrom) query = query.gte('packages.created_at', dateFrom)
    if (dateTo) query = query.lte('packages.created_at', dateTo)

    const { data, error } = await query
    if (error || !data) return []

    type Row = {
      package_id: string
      quantity: number
      description: string
      inventory_item_id: string | null
    }

    const grouped = new Map<string, { qty: number; pkgIds: Set<string>; invId: string | null }>()
    for (const r of data as unknown as Row[]) {
      const key = (r.description ?? '').trim().toLowerCase() || '(unnamed)'
      const bucket = grouped.get(key) ?? { qty: 0, pkgIds: new Set<string>(), invId: r.inventory_item_id }
      bucket.qty += r.quantity ?? 0
      bucket.pkgIds.add(r.package_id)
      if (!bucket.invId && r.inventory_item_id) bucket.invId = r.inventory_item_id
      grouped.set(key, bucket)
    }

    return Array.from(grouped.entries())
      .map(([key, b]) => ({
        description: titleCase(key),
        totalQuantity: b.qty,
        packageCount: b.pkgIds.size,
        inventoryItemId: b.invId,
        packageIds: Array.from(b.pkgIds),
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity)
      .slice(0, 8)
  } catch (err) {
    logger.warn(err, { op: 'operationsDashboard.topShippedItems' })
    return []
  }
}

// ============================================================================
// Presentation helpers (ported verbatim)
// ============================================================================

function titleCase(s: string): string {
  return s.replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Parse a `YYYY-MM-DD` date string as local time. `new Date('YYYY-MM-DD')`
 * parses as UTC midnight, which can shift the weekday/label across the date
 * boundary; constructing from parts keeps it in the local day.
 */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function formatDayLabel(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  return days[date.getDay()]
}

function formatShortDate(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getStatusLabel(status: PackageStatus): string {
  switch (status) {
    case PACKAGE_STATUS.DRAFT:
      return 'Draft'
    case PACKAGE_STATUS.PENDING:
      return 'Pending'
    case PACKAGE_STATUS.NOTIFIED:
      return 'Notified'
    case PACKAGE_STATUS.IN_TRANSIT:
      return 'In Transit'
    case PACKAGE_STATUS.READY_FOR_COLLECTION:
      return 'Ready'
    case PACKAGE_STATUS.DELIVERED:
      return 'Delivered'
    case PACKAGE_STATUS.COLLECTED:
      return 'Collected'
    case PACKAGE_STATUS.RETURNED:
      return 'Canceled'
    default:
      return 'Unknown'
  }
}

function getTimeAgo(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function toEndOfDay(date: Date): string {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).toISOString()
}
