-- Phase 0 — access control hardening.
--
-- Prerequisite for the policy/permission system (docs/access-control-policy-design.md).
-- These are live holes today; a permission UI layered on top of them would be
-- decoration. No legitimate staff workflow changes here — everything below either
-- closes a hole that only non-staff (or deactivated staff) could walk through, or
-- revokes a grant nothing calls.
--
--   1. TRUNCATE granted to anon/authenticated on every public table
--   2. SECURITY DEFINER dashboard RPCs callable by any authenticated user (incl. customers)
--   3. SECURITY DEFINER write RPCs with no caller check
--   4. Legacy pods SELECT policies that ignore is_active
--   5. Admin write policies that ignore is_active
--   6. Storage write policies open to any authenticated user

-- ---------------------------------------------------------------------------
-- 1. Revoke TRUNCATE from client roles.
--
-- The base schema granted TRUNCATE on every public table to anon and
-- authenticated. TRUNCATE is not filtered by RLS, so an authenticated client
-- could empty audit_logs — which RLS otherwise makes immutable (UPDATE/DELETE
-- USING (false)).
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE TRUNCATE ON TABLE public.%I FROM anon, authenticated', r.tablename);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Dashboard RPCs: require active staff.
--
-- get_dashboard_metrics, get_executive_metrics and get_sla_breaches are
-- SECURITY DEFINER with GRANT EXECUTE TO authenticated and no caller check. A
-- logged-in portal *customer* could call them directly and pull the whole
-- revenue picture plus every breaching order's receiver email and phone.
--
-- Bodies below are unchanged from their previous definitions; the only edit is
-- the is_active_staff() guard at the top. Phase 2 replaces these guards with
-- has_permission('dashboard.exec.view') / has_permission('sla.export').
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_dashboard_metrics(
  p_date_from  TIMESTAMPTZ DEFAULT NULL,
  p_date_to    TIMESTAMPTZ DEFAULT NULL,
  p_company_id UUID DEFAULT NULL
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
  v_month0       TIMESTAMP;     -- local first-of-this-month
  v_result       JSONB;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_today_date  := (v_now AT TIME ZONE tz)::date;
  v_today_start := (date_trunc('day', v_now AT TIME ZONE tz)) AT TIME ZONE tz;
  v_week_start  := v_today_start - INTERVAL '7 days';
  v_month_start := v_today_start - INTERVAL '30 days';
  v_month0      := date_trunc('month', v_now AT TIME ZONE tz);

  WITH
  -- Date-filtered, non-deleted packages: the working set for most metrics.
  pkg AS (
    SELECT *
    FROM public.packages
    WHERE deleted_at IS NULL
      AND (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to   IS NULL OR created_at <= p_date_to)
      AND (
        p_company_id IS NULL
        OR receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
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

  -- ── Returns analysis (rate, by-month, by-location) ─────────────────────
  returns_totals AS (
    SELECT
      count(*) FILTER (WHERE status = 'returned') AS returned_total,
      count(*)                                    AS orders_total
    FROM pkg
  ),
  returns_by_month AS (
    SELECT
      to_char(g.d, 'YYYY-MM')                                       AS key,
      count(p.id) FILTER (WHERE p.status = 'returned')              AS returned,
      count(p.id)                                                   AS total
    FROM generate_series(v_month0 - INTERVAL '5 months', v_month0, INTERVAL '1 month') AS g(d)
    LEFT JOIN pkg p
      ON to_char(p.created_at AT TIME ZONE tz, 'YYYY-MM') = to_char(g.d, 'YYYY-MM')
    GROUP BY g.d
    ORDER BY g.d
  ),
  returns_by_loc AS (
    SELECT
      dl.id::text                                       AS id,
      dl.name                                           AS name,
      count(p.id) FILTER (WHERE p.status = 'returned')  AS returned,
      count(p.id)                                       AS total
    FROM pkg p
    JOIN public.delivery_locations dl ON dl.id = p.delivery_location_id
    WHERE p.delivery_location_id IS NOT NULL
    GROUP BY dl.id, dl.name
    HAVING count(p.id) FILTER (WHERE p.status = 'returned') > 0
    ORDER BY count(p.id) FILTER (WHERE p.status = 'returned') DESC
    LIMIT 8
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

  -- ── Per-package stage instants, derived from status history ────────────
  --   The packages.picked_up_at / received_at columns are never populated, so
  --   read the transition times from package_status_history instead (first time
  --   each status was entered). Collected still prefers the stored timestamp.
  pkg_transitions AS (
    SELECT
      package_id,
      min(changed_at) FILTER (WHERE status = 'in_transit')           AS picked_up_at,
      min(changed_at) FILTER (WHERE status = 'ready_for_collection') AS received_at,
      min(changed_at) FILTER (WHERE status = 'collected')            AS collected_at
    FROM public.package_status_history
    WHERE package_id IN (SELECT id FROM pkg)
    GROUP BY package_id
  ),

  -- ── How each order completed (POD label): 'Delivered' | 'Collected' ────
  --   One row per package (latest POD wins if several exist).
  pod_completion AS (
    SELECT DISTINCT ON (package_id)
      package_id,
      completion_status
    FROM public.pods
    WHERE package_id IN (SELECT id FROM pkg)
    ORDER BY package_id, completed_at DESC NULLS LAST
  ),

  -- ── Lifecycle / cycle-time metrics ─────────────────────────────────────
  lifecycle AS (
    SELECT
      avg(EXTRACT(epoch FROM (t.picked_up_at - p.created_at)) / 3600.0)
        FILTER (WHERE t.picked_up_at IS NOT NULL AND t.picked_up_at >= p.created_at) AS c2p,
      avg(EXTRACT(epoch FROM (t.received_at - t.picked_up_at)) / 3600.0)
        FILTER (WHERE t.picked_up_at IS NOT NULL AND t.received_at IS NOT NULL
                  AND t.received_at >= t.picked_up_at)                               AS p2r,
      avg(EXTRACT(epoch FROM (COALESCE(p.collected_at, t.collected_at) - t.received_at)) / 3600.0)
        FILTER (WHERE t.received_at IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= t.received_at)     AS r2c,
      avg(EXTRACT(epoch FROM (COALESCE(p.collected_at, t.collected_at) - p.created_at)) / 3600.0)
        FILTER (WHERE COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= p.created_at
                  AND p.status = 'collected')                                        AS total,
      count(*) FILTER (WHERE COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= p.created_at
                  AND p.status = 'collected')                                        AS completed_sample,

      -- Created → fulfilment, split by POD completion type.
      avg(EXTRACT(epoch FROM (COALESCE(p.collected_at, t.collected_at) - p.created_at)) / 3600.0)
        FILTER (WHERE COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= p.created_at
                  AND p.status = 'collected'
                  AND pc.completion_status = 'Delivered')                            AS to_delivered,
      count(*) FILTER (WHERE COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= p.created_at
                  AND p.status = 'collected'
                  AND pc.completion_status = 'Delivered')                            AS delivered_sample,
      avg(EXTRACT(epoch FROM (COALESCE(p.collected_at, t.collected_at) - p.created_at)) / 3600.0)
        FILTER (WHERE COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= p.created_at
                  AND p.status = 'collected'
                  AND pc.completion_status = 'Collected')                            AS to_collected,
      count(*) FILTER (WHERE COALESCE(p.collected_at, t.collected_at) IS NOT NULL
                  AND COALESCE(p.collected_at, t.collected_at) >= p.created_at
                  AND p.status = 'collected'
                  AND pc.completion_status = 'Collected')                            AS collected_sample
    FROM pkg p
    LEFT JOIN pkg_transitions t ON t.package_id = p.id
    LEFT JOIN pod_completion  pc ON pc.package_id = p.id
  ),

  -- ── Open packages: deliberately NOT date-filtered ──────────────────────
  --   A breach is measured from updated_at against now(), so filtering by
  --   created_at would hide the oldest — i.e. worst — breaches. Company scope
  --   still applies, since that is a "whose orders am I looking at" question.
  open_pkg AS (
    SELECT id, reference, status, receiver_email, updated_at
    FROM public.packages
    WHERE deleted_at IS NULL
      AND status IN ('pending','notified','in_transit','ready_for_collection')
      AND (
        p_company_id IS NULL
        OR receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
  ),
  breaching AS (
    SELECT
      id,
      reference,
      status,
      receiver_email                                                AS "receiverEmail",
      floor(EXTRACT(epoch FROM (v_now - updated_at)) / 3600.0)::int AS "hoursStuck",
      public.sla_threshold_hours(status)                            AS "thresholdHours"
    FROM open_pkg
    WHERE floor(EXTRACT(epoch FROM (v_now - updated_at)) / 3600.0)::int
          > public.sla_threshold_hours(status)
  ),
  -- The card shows the worst 10; stuckTotal reports how many there really are.
  stuck AS (
    SELECT * FROM breaching
    ORDER BY "hoursStuck" DESC
    LIMIT 10
  ),
  stuck_total AS (
    SELECT count(*)::int AS total FROM breaching
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
        'avgCreateToPickupHours',   CASE WHEN c2p          IS NULL THEN NULL ELSE round(c2p::numeric, 1) END,
        'avgPickupToReceiveHours',  CASE WHEN p2r          IS NULL THEN NULL ELSE round(p2r::numeric, 1) END,
        'avgReceiveToCollectHours', CASE WHEN r2c          IS NULL THEN NULL ELSE round(r2c::numeric, 1) END,
        'avgTotalCycleHours',       CASE WHEN total        IS NULL THEN NULL ELSE round(total::numeric, 1) END,
        'completedSampleSize', completed_sample,
        'avgCreateToDeliveredHours',CASE WHEN to_delivered IS NULL THEN NULL ELSE round(to_delivered::numeric, 1) END,
        'deliveredSampleSize', delivered_sample,
        'avgCreateToCollectedHours',CASE WHEN to_collected IS NULL THEN NULL ELSE round(to_collected::numeric, 1) END,
        'collectedSampleSize', collected_sample
      ) FROM lifecycle),
    'stuckPackages', (SELECT COALESCE(jsonb_agg(to_jsonb(stuck)), '[]'::jsonb) FROM stuck),
    'stuckTotal', (SELECT total FROM stuck_total),
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
    'returns', (SELECT jsonb_build_object(
        'returnedTotal', returned_total,
        'ordersTotal', orders_total,
        'monthly', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'key', key, 'returned', returned, 'total', total)), '[]'::jsonb) FROM returns_by_month),
        'byLocation', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', id, 'name', name, 'returned', returned, 'total', total)), '[]'::jsonb) FROM returns_by_loc)
      ) FROM returns_totals),
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

CREATE OR REPLACE FUNCTION public.get_executive_metrics(
  p_company_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz                 CONSTANT TEXT = 'Africa/Johannesburg';
  v_now              TIMESTAMPTZ := now();
  v_now_local        TIMESTAMP;          -- local wall clock "now"
  v_today_start      TIMESTAMP;
  v_yesterday_start  TIMESTAMP;
  v_week_start       TIMESTAMP;          -- Monday-based ISO week start
  v_prev_week_start  TIMESTAMP;
  v_month_start      TIMESTAMP;
  v_prev_month_start TIMESTAMP;
  v_year_start       TIMESTAMP;
  v_prev_year_start  TIMESTAMP;
  v_today_date       DATE;
  v_result           JSONB;
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  v_now_local        := v_now AT TIME ZONE tz;
  v_today_date       := v_now_local::date;
  v_today_start      := date_trunc('day',   v_now_local);
  v_yesterday_start  := v_today_start - INTERVAL '1 day';
  v_week_start       := date_trunc('week',  v_now_local);     -- Monday 00:00
  v_prev_week_start  := v_week_start - INTERVAL '7 days';
  v_month_start      := date_trunc('month', v_now_local);
  v_prev_month_start := v_month_start - INTERVAL '1 month';
  v_year_start       := date_trunc('year',  v_now_local);
  v_prev_year_start  := v_year_start - INTERVAL '1 year';

  WITH
  -- Realized (collected) + pipeline (ready-for-collection) orders, non-deleted.
  base AS (
    SELECT
      p.id,
      p.reference,
      p.receiver_email,
      p.status,
      COALESCE(p.collected_at, p.received_at, p.updated_at, p.created_at) AS completed_at
    FROM public.packages p
    WHERE p.deleted_at IS NULL
      AND p.status IN ('collected', 'ready_for_collection')
      AND (
        p_company_id IS NULL
        OR p.receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
  ),

  -- Per-item line value: quantity × inventory unit_price (0 when unlinked/unpriced).
  all_items AS (
    SELECT
      pi.package_id,
      pi.quantity * COALESCE(ii.unit_price, 0) AS line_value
    FROM public.package_items pi
    JOIN base b ON b.id = pi.package_id
    LEFT JOIN public.inventory_items ii ON ii.id = pi.inventory_item_id
  ),
  order_value AS (
    SELECT package_id, COALESCE(sum(line_value), 0) AS value
    FROM all_items
    GROUP BY package_id
  ),
  orders AS (
    SELECT
      b.id,
      b.receiver_email,
      b.status,
      COALESCE(ov.value, 0)            AS value,
      (b.completed_at AT TIME ZONE tz) AS completed_local
    FROM base b
    LEFT JOIN order_value ov ON ov.package_id = b.id
  ),
  collected AS (SELECT * FROM orders WHERE status = 'collected'),
  pipeline  AS (SELECT * FROM orders WHERE status = 'ready_for_collection'),

  -- ── Headline summary ────────────────────────────────────────────────────
  summary AS (
    SELECT
      (SELECT round(COALESCE(sum(value), 0)::numeric, 2) FROM collected) AS total_value,
      (SELECT count(*)                                   FROM collected) AS total_orders,
      (SELECT round(COALESCE(sum(value), 0)::numeric, 2) FROM pipeline)  AS pipeline_value,
      (SELECT count(*)                                   FROM pipeline)  AS pipeline_orders
  ),

  -- ── Period windows over realized (collected) revenue ───────────────────
  -- Current + prior-period baselines so the client can compute deltas.
  kpi AS (
    SELECT
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_today_start), 0)::numeric, 2)        AS today_v,
      count(*)                  FILTER (WHERE completed_local >= v_today_start)                          AS today_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_yesterday_start
                                          AND completed_local <  v_today_start), 0)::numeric, 2)         AS yest_v,
      count(*)                  FILTER (WHERE completed_local >= v_yesterday_start
                                          AND completed_local <  v_today_start)                          AS yest_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_week_start), 0)::numeric, 2)         AS week_v,
      count(*)                  FILTER (WHERE completed_local >= v_week_start)                           AS week_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_prev_week_start
                                          AND completed_local <  v_week_start), 0)::numeric, 2)          AS pweek_v,
      count(*)                  FILTER (WHERE completed_local >= v_prev_week_start
                                          AND completed_local <  v_week_start)                           AS pweek_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_month_start), 0)::numeric, 2)        AS month_v,
      count(*)                  FILTER (WHERE completed_local >= v_month_start)                          AS month_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_prev_month_start
                                          AND completed_local <  v_month_start), 0)::numeric, 2)         AS pmonth_v,
      count(*)                  FILTER (WHERE completed_local >= v_prev_month_start
                                          AND completed_local <  v_month_start)                          AS pmonth_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_year_start), 0)::numeric, 2)         AS year_v,
      count(*)                  FILTER (WHERE completed_local >= v_year_start)                           AS year_o,
      round(COALESCE(sum(value) FILTER (WHERE completed_local >= v_prev_year_start
                                          AND completed_local <  v_year_start), 0)::numeric, 2)          AS pyear_v,
      count(*)                  FILTER (WHERE completed_local >= v_prev_year_start
                                          AND completed_local <  v_year_start)                           AS pyear_o,
      round(COALESCE(sum(value), 0)::numeric, 2)                                                        AS all_v,
      count(*)                                                                                          AS all_o
    FROM collected
  ),

  -- ── Trends: zero-filled value-over-time over realized revenue ──────────
  day_series AS (
    SELECT g.d::date AS k
    FROM generate_series(v_today_date - 29, v_today_date, INTERVAL '1 day') AS g(d)
  ),
  day_trend AS (
    SELECT to_char(s.k, 'YYYY-MM-DD') AS key,
           round(COALESCE(sum(c.value), 0)::numeric, 2) AS value,
           count(c.id) AS orders
    FROM day_series s
    LEFT JOIN collected c ON c.completed_local::date = s.k
    GROUP BY s.k
    ORDER BY s.k
  ),
  week_series AS (
    SELECT g.d::date AS k
    FROM generate_series(v_week_start - INTERVAL '11 weeks', v_week_start, INTERVAL '1 week') AS g(d)
  ),
  week_trend AS (
    SELECT to_char(s.k, 'YYYY-MM-DD') AS key,
           round(COALESCE(sum(c.value), 0)::numeric, 2) AS value,
           count(c.id) AS orders
    FROM week_series s
    LEFT JOIN collected c ON date_trunc('week', c.completed_local)::date = s.k
    GROUP BY s.k
    ORDER BY s.k
  ),
  month_series AS (
    SELECT g.d AS k
    FROM generate_series(v_month_start - INTERVAL '11 months', v_month_start, INTERVAL '1 month') AS g(d)
  ),
  month_trend AS (
    SELECT to_char(s.k, 'YYYY-MM') AS key,
           round(COALESCE(sum(c.value), 0)::numeric, 2) AS value,
           count(c.id) AS orders
    FROM month_series s
    LEFT JOIN collected c ON to_char(c.completed_local, 'YYYY-MM') = to_char(s.k, 'YYYY-MM')
    GROUP BY s.k
    ORDER BY s.k
  ),
  year_series AS (
    SELECT generate_series(EXTRACT(year FROM v_now_local)::int - 4,
                           EXTRACT(year FROM v_now_local)::int, 1) AS y
  ),
  year_trend AS (
    SELECT s.y::text AS key,
           round(COALESCE(sum(c.value), 0)::numeric, 2) AS value,
           count(c.id) AS orders
    FROM year_series s
    LEFT JOIN collected c ON EXTRACT(year FROM c.completed_local)::int = s.y
    GROUP BY s.y
    ORDER BY s.y
  ),

  -- ── Top customers by realized value ────────────────────────────────────
  top_customers AS (
    SELECT
      COALESCE(receiver_email, '(unknown)')      AS email,
      round(sum(value)::numeric, 2)              AS value,
      count(*)                                   AS orders
    FROM collected
    GROUP BY COALESCE(receiver_email, '(unknown)')
    ORDER BY sum(value) DESC
    LIMIT 8
  ),

  -- ── Top items by realized value (collected orders, priced lines only) ──
  collected_items AS (
    SELECT
      COALESCE(NULLIF(lower(trim(pi.description)), ''), '(unnamed)') AS description,
      pi.package_id,
      pi.inventory_item_id,
      pi.quantity                                  AS quantity,
      pi.quantity * COALESCE(ii.unit_price, 0)     AS line_value
    FROM public.package_items pi
    JOIN collected c ON c.id = pi.package_id
    LEFT JOIN public.inventory_items ii ON ii.id = pi.inventory_item_id
  ),
  top_items AS (
    SELECT
      description,
      round(sum(line_value)::numeric, 2)                                                  AS value,
      sum(quantity)                                                                       AS quantity,
      count(DISTINCT package_id)                                                          AS orders,
      (array_agg(inventory_item_id) FILTER (WHERE inventory_item_id IS NOT NULL))[1]      AS "inventoryItemId"
    FROM collected_items
    WHERE line_value > 0
    GROUP BY description
    ORDER BY sum(line_value) DESC
    LIMIT 8
  )

  SELECT jsonb_build_object(
    'summary', (SELECT jsonb_build_object(
        'totalValue', total_value,
        'totalOrders', total_orders,
        'avgOrderValue', CASE WHEN total_orders > 0
                              THEN round((total_value / total_orders)::numeric, 2)
                              ELSE 0 END,
        'pipelineValue', pipeline_value,
        'pipelineOrders', pipeline_orders,
        'truncated', false
      ) FROM summary),
    'periods', (SELECT jsonb_build_object(
        'today',     jsonb_build_object('value', today_v,  'orders', today_o),
        'yesterday', jsonb_build_object('value', yest_v,   'orders', yest_o),
        'week',      jsonb_build_object('value', week_v,   'orders', week_o),
        'prevWeek',  jsonb_build_object('value', pweek_v,  'orders', pweek_o),
        'month',     jsonb_build_object('value', month_v,  'orders', month_o),
        'prevMonth', jsonb_build_object('value', pmonth_v, 'orders', pmonth_o),
        'year',      jsonb_build_object('value', year_v,   'orders', year_o),
        'prevYear',  jsonb_build_object('value', pyear_v,  'orders', pyear_o),
        'all',       jsonb_build_object('value', all_v,    'orders', all_o)
      ) FROM kpi),
    'trends', jsonb_build_object(
      'day',   (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'orders', orders)), '[]'::jsonb) FROM day_trend),
      'week',  (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'orders', orders)), '[]'::jsonb) FROM week_trend),
      'month', (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'orders', orders)), '[]'::jsonb) FROM month_trend),
      'year',  (SELECT COALESCE(jsonb_agg(jsonb_build_object('key', key, 'value', value, 'orders', orders)), '[]'::jsonb) FROM year_trend)
    ),
    'topCustomers', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('email', email, 'value', value, 'orders', orders)), '[]'::jsonb) FROM top_customers),
    'topItems', (SELECT COALESCE(jsonb_agg(
        jsonb_build_object('description', description, 'inventoryItemId', "inventoryItemId",
          'value', value, 'quantity', quantity, 'orders', orders)), '[]'::jsonb) FROM top_items)
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

-- get_sla_breaches was LANGUAGE sql, which cannot RAISE; it becomes plpgsql so
-- it can reject non-staff callers. The query is otherwise unchanged.
CREATE OR REPLACE FUNCTION public.get_sla_breaches(p_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN (
    WITH breaching AS (
      SELECT
        p.id,
        p.reference,
        p.status,
        p.receiver_email                                                  AS "receiverEmail",
        NULLIF(trim(concat_ws(' ', rp.name, rp.surname)), '')             AS "receiverName",
        rp.phone                                                          AS "receiverPhone",
        floor(EXTRACT(epoch FROM (now() - p.updated_at)) / 3600.0)::int   AS "hoursStuck",
        public.sla_threshold_hours(p.status)                              AS "thresholdHours",
        floor(EXTRACT(epoch FROM (now() - p.updated_at)) / 3600.0)::int
          - public.sla_threshold_hours(p.status)                          AS "hoursOverdue",
        p.created_at                                                      AS "createdAt",
        p.updated_at                                                      AS "updatedAt"
      FROM public.packages p
      LEFT JOIN public.receiver_profiles rp ON rp.id = p.receiver_id
      WHERE p.deleted_at IS NULL
        AND p.status IN ('pending','notified','in_transit','ready_for_collection')
        AND floor(EXTRACT(epoch FROM (now() - p.updated_at)) / 3600.0)::int
            > public.sla_threshold_hours(p.status)
        AND (
          p_company_id IS NULL
          OR p.receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
        )
    )
    SELECT COALESCE(jsonb_agg(to_jsonb(b) ORDER BY b."hoursOverdue" DESC), '[]'::jsonb)
    FROM breaching b
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_executive_metrics(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.get_sla_breaches(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_executive_metrics(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_sla_breaches(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3a. decrement_inventory_quantity: require active staff.
--
-- SECURITY DEFINER wrapping a bare UPDATE with no caller check. Called from the
-- browser (src/lib/api/inventory.ts, src/lib/api/packages.ts), so it keeps its
-- authenticated grant and gains a guard rather than being revoked.
-- Phase 2 tightens this to has_permission('inventory.update').
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.decrement_inventory_quantity(item_id uuid, decrement_by integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_active_staff() THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_items
  SET quantity = quantity - decrement_by
  WHERE id = item_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3b. Service-role-only RPCs: revoke the client grants.
--
-- create_package_with_items_and_allocations takes p_created_by as a *parameter*
-- and never compares it to auth.uid(), so any authenticated caller could forge
-- authorship. allocate_purchase_order_item_allocations validates payload shape
-- only. Neither is called from the browser — create-package (edge function)
-- calls the first with a service-role client, and the second is only reached
-- from inside other SECURITY DEFINER functions, where the grant is irrelevant.
-- Revoked by name so a signature typo cannot silently no-op.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_package_with_items_and_allocations',
        'allocate_purchase_order_item_allocations'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. pods: drop the legacy SELECT policies that ignore is_active.
--
-- RLS policies are permissive (OR'd), so these two kept every POD readable by a
-- *deactivated* staff member — and by anyone who had created the package —
-- regardless of the "Active staff can view pods" policy added in
-- 20260707140000_customer_portal_rls.sql, which is the one we keep.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can read PODs" ON public.pods;
DROP POLICY IF EXISTS "staff_or_owner_can_select_pods" ON public.pods;

-- ---------------------------------------------------------------------------
-- 5. Admin write policies: require is_active.
--
-- Nine policies check role = 'admin' but not is_active, so a deactivated admin
-- kept write access to delivery locations, customers and staff — including the
-- ability to reactivate their own account.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid()
      AND sp.is_active
      AND sp.role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_active_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can create delivery locations" ON public.delivery_locations;
CREATE POLICY "Admins can create delivery locations" ON public.delivery_locations
  FOR INSERT TO authenticated WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can update delivery locations" ON public.delivery_locations;
CREATE POLICY "Admins can update delivery locations" ON public.delivery_locations
  FOR UPDATE TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can delete delivery locations" ON public.delivery_locations;
CREATE POLICY "Admins can delete delivery locations" ON public.delivery_locations
  FOR DELETE TO authenticated USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can create receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Admins can create receiver profiles" ON public.receiver_profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can update receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Admins can update receiver profiles" ON public.receiver_profiles
  FOR UPDATE TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can delete receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Admins can delete receiver profiles" ON public.receiver_profiles
  FOR DELETE TO authenticated USING (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can create staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can create staff profiles" ON public.staff_profiles
  FOR INSERT TO authenticated WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can update staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can update staff profiles" ON public.staff_profiles
  FOR UPDATE TO authenticated USING (public.is_active_admin()) WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can delete staff profiles" ON public.staff_profiles;
CREATE POLICY "Admins can delete staff profiles" ON public.staff_profiles
  FOR DELETE TO authenticated USING (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- 6. Storage writes: require active staff.
--
-- delivery-photos and signatures accepted uploads from ANY authenticated user,
-- including portal customers. Drivers are staff (staff_profiles.role='driver'),
-- so the driver app is unaffected.
--
-- NOT changed here: pod-documents, signatures and delivery-photos are all
-- public-read buckets. Anyone with (or guessing) an object URL can read a POD
-- PDF or a signature image without authenticating. Closing that means making
-- the buckets private and moving every reader to signed URLs — a behaviour
-- change that touches POD PDF rendering and possibly the driver app, so it is
-- deliberately left for a follow-up rather than smuggled into a hardening pass.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "delivery_photos_insert" ON storage.objects;
CREATE POLICY "delivery_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'delivery-photos' AND public.is_active_staff());

DROP POLICY IF EXISTS "delivery_photos_update" ON storage.objects;
CREATE POLICY "delivery_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'delivery-photos' AND public.is_active_staff())
  WITH CHECK (bucket_id = 'delivery-photos' AND public.is_active_staff());

DROP POLICY IF EXISTS "Driver insert dn3fju_0" ON storage.objects;

DROP POLICY IF EXISTS "Authenticated users can upload signatures" ON storage.objects;
CREATE POLICY "Active staff can upload signatures" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'signatures' AND public.is_active_staff());
