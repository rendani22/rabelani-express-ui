-- ============================================================================
-- Server-side executive (CEO) revenue aggregation
--
-- The executive dashboard previously pulled collected + ready-for-collection
-- orders (with their items) to the browser, priced them from inventory
-- `unit_price`, and aggregated client-side. PostgREST caps each response at
-- `db.max_rows`, so the figures silently truncated once the order book grew
-- past the cap.
--
-- This migration moves all executive aggregation into a single SECURITY
-- DEFINER RPC, `get_executive_metrics()`, which scans the full tables in
-- Postgres and returns one JSON document with every revenue metric the
-- executive view renders: the realized/pipeline summary, period KPIs
-- (today/week/month/year + prior-period baselines for deltas), value-over-time
-- trends (day/week/month/year), and the top customers/items by realized value.
--
-- Revenue is realized when the receiver **collects** an order. Order value is
-- Σ(item.quantity × inventory unit_price) — the same basis as the Purchase
-- Orders "delivered value", so figures reconcile across the app. Items with no
-- linked/priced inventory contribute zero.
--
-- Time-bucketed metrics use the `Africa/Johannesburg` wall-clock timezone to
-- match what local staff see; adjust the `tz` value below if operating in a
-- different region.
-- ============================================================================

-- Company filter (2026-07-08): optional `p_company_id` scopes the revenue base
-- to packages whose receiver belongs to that company (receiver_id →
-- receiver_profiles.company_id). NULL = whole network. The signature changes, so
-- the old no-arg function is dropped first to avoid an ambiguous overload.
DROP FUNCTION IF EXISTS public.get_executive_metrics();

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

GRANT EXECUTE ON FUNCTION public.get_executive_metrics(UUID) TO authenticated;
