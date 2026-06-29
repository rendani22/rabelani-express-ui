-- ============================================================================
-- Server-side dashboard aggregation
--
-- The dashboard previously pulled every package row to the browser and
-- aggregated client-side. PostgREST caps each response at `db.max_rows`
-- (1000), so the dashboard silently only ever saw the most recent 1000 orders.
--
-- This migration moves all dashboard aggregation into a single SECURITY
-- DEFINER RPC, `get_dashboard_metrics(p_date_from, p_date_to)`, which scans the
-- full tables in Postgres and returns one JSON document with every metric the
-- dashboard renders. One round trip, no row cap, and the heavy lifting happens
-- next to the data.
--
-- Time-bucketed metrics (today/week/month counts, daily series, hourly
-- heatmap) are computed in the `Africa/Johannesburg` wall-clock timezone to
-- match what local staff see; adjust the `tz` value below if operating in a
-- different region.
-- ============================================================================

-- Index to keep date-range scans over live orders fast. (idx_packages_live
-- from the soft-delete migration already covers created_at DESC for live rows.)
CREATE INDEX IF NOT EXISTS idx_packages_live_status
  ON public.packages (status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pods_completed_at
  ON public.pods (completed_at);

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_date_from TIMESTAMPTZ DEFAULT NULL,
  p_date_to   TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz             CONSTANT TEXT = 'Africa/Johannesburg';
  v_now          TIMESTAMPTZ := now();
  v_today_start  TIMESTAMPTZ;   -- local midnight today, as an absolute instant
  v_week_start   TIMESTAMPTZ;   -- today - 7d (matches client weekly window)
  v_month_start  TIMESTAMPTZ;   -- today - 30d
  v_today_date   DATE;          -- local calendar date "today"
  v_result       JSONB;
BEGIN
  v_today_date  := (v_now AT TIME ZONE tz)::date;
  v_today_start := (date_trunc('day', v_now AT TIME ZONE tz)) AT TIME ZONE tz;
  v_week_start  := v_today_start - INTERVAL '7 days';
  v_month_start := v_today_start - INTERVAL '30 days';

  WITH
  -- Date-filtered, non-deleted packages: the working set for most metrics.
  pkg AS (
    SELECT *
    FROM public.packages
    WHERE deleted_at IS NULL
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <= p_date_to)
  ),

  -- ── Headline stats + status counts ──────────────────────────────────────
  stats AS (
    SELECT
      count(*)                                                              AS total,
      count(*) FILTER (WHERE status IN ('pending','notified'))             AS pending,
      count(*) FILTER (WHERE status = 'in_transit')                       AS in_transit,
      count(*) FILTER (WHERE status = 'ready_for_collection')            AS ready_for_collection,
      count(*) FILTER (WHERE status = 'collected')                       AS completed,
      count(*) FILTER (WHERE status = 'returned')                        AS returned,
      count(*) FILTER (WHERE created_at >= v_today_start)                 AS today_count,
      count(*) FILTER (WHERE created_at >= v_week_start)                  AS weekly_count,
      count(*) FILTER (WHERE created_at >= v_month_start)                 AS monthly_count,
      -- raw per-status counts for the distribution chart (labels/colours
      -- are applied client-side)
      count(*) FILTER (WHERE status = 'pending')                          AS s_pending,
      count(*) FILTER (WHERE status = 'notified')                         AS s_notified,
      count(*) FILTER (WHERE status = 'in_transit')                       AS s_in_transit,
      count(*) FILTER (WHERE status = 'ready_for_collection')            AS s_ready,
      count(*) FILTER (WHERE status = 'collected')                       AS s_collected,
      count(*) FILTER (WHERE status = 'returned')                        AS s_returned
    FROM pkg
  ),

  -- ── Daily series: last 7 and last 30 local days (zero-filled) ──────────
  weekly AS (
    SELECT to_char(g.d, 'YYYY-MM-DD') AS date,
           count(p.id)                AS count
    FROM generate_series(v_today_date - 6, v_today_date, INTERVAL '1 day') AS g(d)
    LEFT JOIN pkg p
      ON (p.created_at AT TIME ZONE tz)::date = g.d::date
    GROUP BY g.d
    ORDER BY g.d
  ),
  monthly AS (
    SELECT to_char(g.d, 'YYYY-MM-DD') AS date,
           count(p.id)                AS count
    FROM generate_series(v_today_date - 29, v_today_date, INTERVAL '1 day') AS g(d)
    LEFT JOIN pkg p
      ON (p.created_at AT TIME ZONE tz)::date = g.d::date
    GROUP BY g.d
    ORDER BY g.d
  ),

  -- ── Recent activity (10 newest) ────────────────────────────────────────
  recent AS (
    SELECT id, reference, receiver_email, status, created_at
    FROM pkg
    ORDER BY created_at DESC
    LIMIT 10
  ),

  -- ── Top receivers by package count ─────────────────────────────────────
  receivers AS (
    SELECT receiver_email AS email, count(*) AS count
    FROM pkg
    GROUP BY receiver_email
    ORDER BY count(*) DESC
    LIMIT 7
  ),

  -- ── Hourly heatmap buckets (day-of-week 0=Sun..6=Sat × hour 0..23) ─────
  heatmap AS (
    SELECT EXTRACT(dow  FROM created_at AT TIME ZONE tz)::int AS dow,
           EXTRACT(hour FROM created_at AT TIME ZONE tz)::int AS hour,
           count(*)                                           AS count
    FROM pkg
    GROUP BY 1, 2
  ),

  -- ── Location distribution ──────────────────────────────────────────────
  loc_counts AS (
    SELECT delivery_location_id, count(*) AS count
    FROM pkg
    WHERE delivery_location_id IS NOT NULL
    GROUP BY delivery_location_id
  ),
  loc_top AS (
    SELECT dl.id, dl.name, lc.count
    FROM loc_counts lc
    JOIN public.delivery_locations dl ON dl.id = lc.delivery_location_id
    WHERE dl.is_active = true
    ORDER BY lc.count DESC
    LIMIT 8
  ),
  loc_unassigned AS (
    SELECT count(*) AS count FROM pkg WHERE delivery_location_id IS NULL
  ),

  -- ── Driver performance (per picked_up_by) ──────────────────────────────
  perf_raw AS (
    SELECT
      picked_up_by AS uid,
      count(*)                                                                   AS pickups,
      count(*) FILTER (WHERE status IN ('ready_for_collection','collected'))   AS delivered,
      count(*) FILTER (WHERE status = 'in_transit')                           AS in_transit,
      avg(EXTRACT(epoch FROM (COALESCE(received_at, collected_at) - picked_up_at)) / 3600.0)
        FILTER (
          WHERE picked_up_at IS NOT NULL
            AND COALESCE(received_at, collected_at) IS NOT NULL
            AND EXTRACT(epoch FROM (COALESCE(received_at, collected_at) - picked_up_at)) / 3600.0
                BETWEEN 0 AND (24 * 30)
        )                                                                        AS avg_hours
    FROM pkg
    WHERE picked_up_by IS NOT NULL
    GROUP BY picked_up_by
  ),
  perf_total AS (
    SELECT COALESCE(sum(delivered), 0) AS total_delivered FROM perf_raw
  ),
  perf AS (
    SELECT
      pr.uid                                                       AS "driverUserId",
      COALESCE(sp.full_name, 'Unknown driver')                    AS name,
      pr.pickups,
      pr.delivered,
      pr.in_transit                                               AS "inTransit",
      CASE WHEN pr.avg_hours IS NULL THEN NULL
           ELSE round(pr.avg_hours::numeric, 1) END               AS "avgDeliveryHours",
      CASE WHEN pt.total_delivered > 0
           THEN round((pr.delivered::numeric / pt.total_delivered) * 100)::int
           ELSE 0 END                                             AS "completionRate"
    FROM perf_raw pr
    CROSS JOIN perf_total pt
    LEFT JOIN public.staff_profiles sp ON sp.user_id = pr.uid AND sp.role = 'driver'
    ORDER BY pr.delivered DESC, pr.pickups DESC
    LIMIT 8
  ),

  -- ── Lifecycle / cycle-time metrics ─────────────────────────────────────
  lifecycle AS (
    SELECT
      avg(EXTRACT(epoch FROM (picked_up_at - created_at)) / 3600.0)
        FILTER (WHERE picked_up_at IS NOT NULL AND picked_up_at >= created_at)        AS c2p,
      avg(EXTRACT(epoch FROM (received_at - picked_up_at)) / 3600.0)
        FILTER (WHERE picked_up_at IS NOT NULL AND received_at IS NOT NULL
                  AND received_at >= picked_up_at)                                    AS p2r,
      avg(EXTRACT(epoch FROM (collected_at - received_at)) / 3600.0)
        FILTER (WHERE received_at IS NOT NULL AND collected_at IS NOT NULL
                  AND collected_at >= received_at)                                    AS r2c,
      avg(EXTRACT(epoch FROM (collected_at - created_at)) / 3600.0)
        FILTER (WHERE collected_at IS NOT NULL AND collected_at >= created_at
                  AND status = 'collected')                                          AS total,
      count(*) FILTER (WHERE collected_at IS NOT NULL AND collected_at >= created_at
                  AND status = 'collected')                                          AS completed_sample
    FROM pkg
  ),

  -- ── Stuck packages (past per-status SLA, by updated_at) ────────────────
  stuck AS (
    SELECT
      id,
      reference,
      status,
      receiver_email                                            AS "receiverEmail",
      floor(EXTRACT(epoch FROM (v_now - updated_at)) / 3600.0)::int AS "hoursStuck",
      CASE
        WHEN status IN ('pending','notified','in_transit') THEN 24
        WHEN status = 'ready_for_collection'               THEN 72
      END                                                       AS "thresholdHours"
    FROM pkg
    WHERE status IN ('pending','notified','in_transit','ready_for_collection')
      AND floor(EXTRACT(epoch FROM (v_now - updated_at)) / 3600.0)::int >
          CASE
            WHEN status IN ('pending','notified','in_transit') THEN 24
            WHEN status = 'ready_for_collection'               THEN 72
          END
    ORDER BY "hoursStuck" DESC
    LIMIT 10
  ),

  -- ── Driver stats (all-time, not date filtered) ─────────────────────────
  drivers_all AS (
    SELECT id, user_id, email, full_name, role, is_active, phone, created_at, updated_at
    FROM public.staff_profiles
    WHERE role = 'driver'
    ORDER BY full_name ASC
  ),
  driver_counts AS (
    SELECT
      (SELECT count(*) FROM drivers_all)                                  AS total,
      (SELECT count(*) FROM drivers_all WHERE is_active)                  AS active,
      (SELECT count(*) FROM public.packages
         WHERE status = 'in_transit' AND deleted_at IS NULL)             AS in_transit,
      (SELECT count(*) FROM public.packages WHERE deleted_at IS NULL)    AS total_packages
  ),

  -- ── POD stats (date filtered on completed_at) ──────────────────────────
  pod AS (
    SELECT
      count(*)                                                  AS total,
      count(*) FILTER (WHERE pdf_url IS NOT NULL)              AS with_pdf,
      count(*) FILTER (WHERE is_locked)                       AS locked,
      count(*) FILTER (WHERE completed_at >= v_today_start)   AS today,
      count(*) FILTER (WHERE completed_at >= v_now - INTERVAL '7 days') AS this_week
    FROM public.pods
    WHERE (p_date_from IS NULL OR completed_at >= p_date_from)
      AND (p_date_to   IS NULL OR completed_at <= p_date_to)
  ),

  -- ── Inventory health (all-time) ────────────────────────────────────────
  inv AS (
    SELECT
      count(*)                                                              AS total_items,
      count(*) FILTER (WHERE is_active)                                    AS active_items,
      count(*) FILTER (WHERE is_active AND quantity > 0
                         AND quantity <= low_stock_threshold)             AS low_stock,
      count(*) FILTER (WHERE is_active AND quantity = 0)                  AS out_of_stock,
      COALESCE(sum(quantity) FILTER (WHERE is_active), 0)                 AS total_quantity,
      round(COALESCE(sum(quantity * COALESCE(unit_price, 0))
              FILTER (WHERE is_active), 0)::numeric, 2)                   AS total_value
    FROM public.inventory_items
  ),
  inv_low AS (
    SELECT id, name, quantity, low_stock_threshold AS threshold
    FROM public.inventory_items
    WHERE is_active
      AND (quantity = 0 OR (quantity > 0 AND quantity <= low_stock_threshold))
    ORDER BY quantity ASC
    LIMIT 5
  ),

  -- ── Top shipped items (package_items joined to in-scope packages) ──────
  items AS (
    SELECT
      COALESCE(NULLIF(lower(trim(pi.description)), ''), '(unnamed)')        AS description,
      sum(pi.quantity)                                                      AS "totalQuantity",
      count(DISTINCT pi.package_id)                                         AS "packageCount",
      (array_agg(pi.inventory_item_id) FILTER (WHERE pi.inventory_item_id IS NOT NULL))[1]
                                                                           AS "inventoryItemId"
    FROM public.package_items pi
    JOIN pkg p ON p.id = pi.package_id
    GROUP BY COALESCE(NULLIF(lower(trim(pi.description)), ''), '(unnamed)')
    ORDER BY sum(pi.quantity) DESC
    LIMIT 8
  )

  SELECT jsonb_build_object(
    'stats', (SELECT jsonb_build_object(
        'total', total, 'pending', pending, 'inTransit', in_transit,
        'readyForCollection', ready_for_collection, 'completed', completed,
        'returned', returned, 'todayCount', today_count,
        'weeklyCount', weekly_count, 'monthlyCount', monthly_count
      ) FROM stats),
    'statusCounts', (SELECT jsonb_build_object(
        'pending', s_pending, 'notified', s_notified, 'in_transit', s_in_transit,
        'ready_for_collection', s_ready, 'collected', s_collected, 'returned', s_returned
      ) FROM stats),
    'weeklyTimeSeries', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('date', date, 'count', count) ), '[]'::jsonb) FROM weekly),
    'monthlyTimeSeries', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('date', date, 'count', count) ), '[]'::jsonb) FROM monthly),
    'recentActivity', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('id', id, 'reference', reference,
          'receiverEmail', receiver_email, 'status', status, 'createdAt', created_at)
      ), '[]'::jsonb) FROM recent),
    'topReceivers', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('email', email, 'count', count) ), '[]'::jsonb) FROM receivers),
    'hourlyBuckets', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('dow', dow, 'hour', hour, 'count', count) ), '[]'::jsonb) FROM heatmap),
    'driverPerformance', (SELECT COALESCE(jsonb_agg(to_jsonb(perf)), '[]'::jsonb) FROM perf),
    'lifecycleMetrics', (SELECT jsonb_build_object(
        'avgCreateToPickupHours',  CASE WHEN c2p   IS NULL THEN NULL ELSE round(c2p::numeric, 1) END,
        'avgPickupToReceiveHours', CASE WHEN p2r   IS NULL THEN NULL ELSE round(p2r::numeric, 1) END,
        'avgReceiveToCollectHours',CASE WHEN r2c   IS NULL THEN NULL ELSE round(r2c::numeric, 1) END,
        'avgTotalCycleHours',      CASE WHEN total IS NULL THEN NULL ELSE round(total::numeric, 1) END,
        'completedSampleSize', completed_sample
      ) FROM lifecycle),
    'stuckPackages', (SELECT COALESCE(jsonb_agg(to_jsonb(stuck)), '[]'::jsonb) FROM stuck),
    'driverStats', (SELECT jsonb_build_object(
        'total', dc.total, 'active', dc.active, 'onDelivery', 0,
        'packagesInTransit', dc.in_transit, 'totalPackages', dc.total_packages,
        'drivers', (SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.full_name), '[]'::jsonb)
                    FROM (SELECT * FROM drivers_all LIMIT 8) d)
      ) FROM driver_counts dc),
    'podStats', (SELECT jsonb_build_object(
        'total', total, 'withPdf', with_pdf, 'locked', locked,
        'today', today, 'thisWeek', this_week) FROM pod),
    'locationDistribution', (
      SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', id, 'name', name, 'count', count) AS x
        FROM loc_top
        UNION ALL
        SELECT jsonb_build_object('id', 'unassigned', 'name', 'No Location',
                 'count', count, 'unassigned', true)
        FROM loc_unassigned WHERE count > 0
      ) u),
    'inventoryHealth', (SELECT jsonb_build_object(
        'totalItems', total_items, 'activeItems', active_items,
        'lowStock', low_stock, 'outOfStock', out_of_stock,
        'totalQuantity', total_quantity, 'totalValue', total_value,
        'topLowStock', (SELECT COALESCE(jsonb_agg(to_jsonb(inv_low)), '[]'::jsonb) FROM inv_low)
      ) FROM inv),
    'topShippedItems', (SELECT COALESCE(jsonb_agg(to_jsonb(items)), '[]'::jsonb) FROM items)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
