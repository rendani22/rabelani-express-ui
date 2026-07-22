-- Signals dashboard: drop the orphaned `pp.locked` projection
--
-- 20260721170000_drop_pod_lock.sql removed `pods.is_locked` from the schema and
-- from the `pod_pkg` CTE, but left `pp.locked` in the `verdict` CTE that reads
-- from it. plpgsql does not plan the query body at CREATE time, so the function
-- was created cleanly and only failed when the dashboard actually called it:
--
--   ERROR:  column pp.locked does not exist
--
-- Nothing downstream consumed the column -- POD compliance is document-exists
-- (`NOT pp.has_pod`) and the photo is reported separately as photoRate. So this
-- is the same function with that one dead line removed.

CREATE OR REPLACE FUNCTION public.get_signal_metrics(
  p_weeks      INTEGER DEFAULT 12,
  p_company_id UUID    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tz              CONSTANT TEXT = 'Africa/Johannesburg';
  v_now           TIMESTAMPTZ := now();
  v_weeks         INTEGER;
  v_series_start  TIMESTAMPTZ;  -- start of the earliest week bucket, local
  v_cur_start     TIMESTAMPTZ;  -- now − 28d
  v_prior_start   TIMESTAMPTZ;  -- now − 56d
  v_coupa_days    CONSTANT INTEGER = 30;
  v_scoped        BOOLEAN := p_company_id IS NOT NULL;
  v_result        JSONB;
BEGIN
  IF NOT public.has_permission('dashboard.signals.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Clamp rather than reject: this feeds a dashboard, and a nonsense window
  -- should give a sane default, not a red error where a figure belongs.
  v_weeks        := LEAST(GREATEST(COALESCE(p_weeks, 12), 4), 52);
  v_series_start := (date_trunc('week', v_now AT TIME ZONE tz)
                       - ((v_weeks - 1) || ' weeks')::INTERVAL) AT TIME ZONE tz;
  v_cur_start    := v_now - INTERVAL '28 days';
  v_prior_start  := v_now - INTERVAL '56 days';

  WITH
  -- ── Terminal orders: the Perfect Order Rate population ──────────────────
  --   Both endings, not just the happy one. A returned order must sit in the
  --   denominator or the first-time-right leg measures nothing.
  term_base AS (
    SELECT p.id, p.status, p.created_at, p.collected_at, p.updated_at, p.receiver_id
    FROM public.packages p
    WHERE p.deleted_at IS NULL
      AND p.status IN ('collected', 'returned')
      -- Coarse prune before the history aggregate below, which is the
      -- expensive part. Safe as a superset: updated_at is bumped by every
      -- change including the terminal transition, so updated_at >= terminal_at
      -- always holds and nothing inside the window can be excluded here.
      AND p.updated_at >= v_series_start
      AND (
        p_company_id IS NULL
        OR p.receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
  ),
  -- collected_at is written for collections but never for returns, so the
  -- terminal instant falls back to the history row and then to updated_at.
  term_hist AS (
    SELECT package_id, min(changed_at) AS terminal_at
    FROM public.package_status_history
    WHERE status IN ('collected', 'returned')
      AND package_id IN (SELECT id FROM term_base)
    GROUP BY package_id
  ),
  term AS (
    SELECT
      b.id,
      b.status,
      b.created_at,
      COALESCE(b.collected_at, th.terminal_at, b.updated_at) AS finished_at
    FROM term_base b
    LEFT JOIN term_hist th ON th.package_id = b.id
  ),
  term_win AS (
    SELECT * FROM term WHERE finished_at >= v_series_start
  ),

  -- ── Per-status dwell, and therefore lateness ───────────────────────────
  --   The time an order spent in each status is the gap between consecutive
  --   history rows; the last row runs to the terminal instant. Compared against
  --   sla_threshold_hours() -- the same function the SLA card and the export
  --   use, so "late" here can never drift from "breaching" there.
  hist AS (
    SELECT
      sh.package_id,
      sh.status,
      sh.changed_at,
      lead(sh.changed_at) OVER (PARTITION BY sh.package_id ORDER BY sh.changed_at) AS next_at
    FROM public.package_status_history sh
    WHERE sh.package_id IN (SELECT id FROM term_win)
  ),
  dwell AS (
    SELECT
      h.package_id,
      EXTRACT(epoch FROM (COALESCE(h.next_at, t.finished_at) - h.changed_at)) / 3600.0 AS hours,
      public.sla_threshold_hours(h.status::public.package_status)                       AS threshold
    FROM hist h
    JOIN term_win t ON t.id = h.package_id
    -- Guard the cast: package_status_history.status is text, and a value that
    -- is not in the enum would raise on cast. Deriving the list from the enum
    -- itself means a new status is picked up without editing this line.
    WHERE h.status = ANY (enum_range(NULL::public.package_status)::text[])
  ),
  late_pkg AS (
    SELECT DISTINCT package_id
    FROM dwell
    WHERE threshold IS NOT NULL
      AND hours > threshold
  ),

  -- ── POD compliance, per order ──────────────────────────────────────────
  --   Compliant = a POD exists. The photo is carried alongside for photoRate,
  --   which is only meaningful for driver deliveries: a receiver collecting at
  --   the counter has no photo to take.
  pod_pkg AS (
    SELECT
      t.id,
      (d.id IS NOT NULL)                                    AS has_pod,
      COALESCE(d.completion_status = 'Delivered', false)    AS is_delivery,
      (d.delivery_photo_url IS NOT NULL)                    AS has_photo
    FROM term_win t
    LEFT JOIN public.pods d ON d.package_id = t.id
  ),

  -- ── One verdict row per order ──────────────────────────────────────────
  verdict AS (
    SELECT
      t.id,
      t.finished_at,
      (date_trunc('week', t.finished_at AT TIME ZONE tz))::date          AS wk,
      EXTRACT(epoch FROM (t.finished_at - t.created_at)) / 3600.0        AS cycle_hours,
      (t.status = 'returned')                                            AS returned,
      (lp.package_id IS NOT NULL)                                        AS late,
      -- A POD counts when the document exists. The photo is measured
      -- separately as photoRate rather than folded in here -- a delivery
      -- evidenced by signature alone is weak evidence, not no POD.
      NOT pp.has_pod                                                          AS pod_gap,
      pp.is_delivery,
      pp.has_photo
    FROM term_win t
    JOIN pod_pkg pp ON pp.id = t.id
    LEFT JOIN late_pkg lp ON lp.package_id = t.id
  ),
  cur AS (
    SELECT * FROM verdict WHERE finished_at >= v_cur_start
  ),
  prior AS (
    SELECT * FROM verdict WHERE finished_at >= v_prior_start AND finished_at < v_cur_start
  ),

  -- ── Coupa ingestion: the fourth leg ────────────────────────────────────
  --   Network-wide by construction (see the header). Counted per week so the
  --   sparkline can include it, and over 30 days for the guardrail.
  coupa AS (
    SELECT
      al.action,
      al.created_at,
      (date_trunc('week', al.created_at AT TIME ZONE tz))::date AS wk
    FROM public.audit_logs al
    WHERE NOT v_scoped
      AND al.action IN ('COUPA_PO_INGESTED', 'COUPA_PO_INGEST_FAILED')
      AND al.created_at >= LEAST(v_series_start, v_now - (v_coupa_days || ' days')::INTERVAL)
  ),
  coupa_cur AS (
    SELECT
      count(*) FILTER (WHERE action = 'COUPA_PO_INGESTED')     AS processed,
      count(*) FILTER (WHERE action = 'COUPA_PO_INGEST_FAILED') AS failed
    FROM coupa
    WHERE created_at >= v_cur_start
  ),
  coupa_prior AS (
    SELECT count(*) FILTER (WHERE action = 'COUPA_PO_INGEST_FAILED') AS failed
    FROM coupa
    WHERE created_at >= v_prior_start AND created_at < v_cur_start
  ),
  coupa_30d AS (
    SELECT
      count(*) FILTER (WHERE action = 'COUPA_PO_INGESTED')      AS processed,
      count(*) FILTER (WHERE action = 'COUPA_PO_INGEST_FAILED') AS failed
    FROM coupa
    WHERE created_at >= v_now - (v_coupa_days || ' days')::INTERVAL
  ),
  coupa_wk AS (
    SELECT wk, count(*) FILTER (WHERE action = 'COUPA_PO_INGEST_FAILED') AS failed
    FROM coupa
    WHERE created_at >= v_series_start
    GROUP BY wk
  ),

  -- ── Headline: current and prior period ─────────────────────────────────
  --   `denom` adds dropped Coupa POs to the terminal-order count: work the
  --   depot was given and never recorded still had to be delivered perfectly.
  cur_agg AS (
    SELECT
      count(*)                                                                  AS orders,
      count(*) FILTER (WHERE NOT returned AND NOT late AND NOT pod_gap)         AS clean,
      count(*) FILTER (WHERE returned)                                          AS lost_returned,
      count(*) FILTER (WHERE late AND NOT returned)                             AS lost_late,
      count(*) FILTER (WHERE pod_gap AND NOT late AND NOT returned)             AS lost_pod,
      count(*) FILTER (WHERE late)                                              AS late_any,
      -- POD population: orders that actually completed. A returned order has no
      -- delivery to evidence, so counting it as a POD failure would let a bad
      -- returns month drag down a figure that is about drivers capturing
      -- signatures -- and would disagree with the Executive tab's POD card,
      -- which measures against completed orders only.
      --
      -- The North Star is unaffected by this either way: `clean` and `lost_pod`
      -- both already exclude returns, so a return is attributed to the returned
      -- bucket and never counted against POD as well.
      count(*) FILTER (WHERE NOT returned)                                      AS pod_scope,
      count(*) FILTER (WHERE NOT returned AND NOT pod_gap)                      AS pod_ok,
      count(*) FILTER (WHERE is_delivery)                                       AS deliveries,
      count(*) FILTER (WHERE is_delivery AND has_photo)                         AS deliveries_with_photo,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY cycle_hours)
        FILTER (WHERE NOT returned AND cycle_hours >= 0)                        AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY cycle_hours)
        FILTER (WHERE NOT returned AND cycle_hours >= 0)                        AS p90,
      count(*) FILTER (WHERE NOT returned AND cycle_hours >= 0)                 AS cycle_sample
    FROM cur
  ),
  prior_agg AS (
    SELECT
      count(*)                                                          AS orders,
      count(*) FILTER (WHERE NOT returned AND NOT late AND NOT pod_gap) AS clean,
      count(*) FILTER (WHERE late)                                      AS late_any,
      count(*) FILTER (WHERE returned)                                  AS returned_any,
      count(*) FILTER (WHERE NOT returned)                              AS pod_scope,
      count(*) FILTER (WHERE NOT returned AND NOT pod_gap)              AS pod_ok,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY cycle_hours)
        FILTER (WHERE NOT returned AND cycle_hours >= 0)                AS p90
    FROM prior
  ),

  -- ── Weekly series ──────────────────────────────────────────────────────
  --   generate_series so a week with no orders renders as a gap in the
  --   sparkline rather than silently closing it up.
  weeks AS (
    SELECT (date_trunc('week', v_now AT TIME ZONE tz)
              - (n || ' weeks')::INTERVAL)::date AS wk
    FROM generate_series(0, v_weeks - 1) AS n
  ),
  wk_agg AS (
    SELECT
      wk,
      count(*)                                                          AS orders,
      count(*) FILTER (WHERE NOT returned AND NOT late AND NOT pod_gap) AS clean,
      count(*) FILTER (WHERE late)                                      AS late_any,
      count(*) FILTER (WHERE returned)                                  AS returned_any,
      count(*) FILTER (WHERE NOT returned)                              AS pod_scope,
      count(*) FILTER (WHERE NOT returned AND NOT pod_gap)              AS pod_ok,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY cycle_hours)
        FILTER (WHERE NOT returned AND cycle_hours >= 0)                AS p50,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY cycle_hours)
        FILTER (WHERE NOT returned AND cycle_hours >= 0)                AS p90
    FROM verdict
    GROUP BY wk
  ),
  series AS (
    SELECT
      w.wk,
      COALESCE(a.orders, 0)      AS orders,
      COALESCE(a.clean, 0)       AS clean,
      COALESCE(a.late_any, 0)    AS late_any,
      COALESCE(a.returned_any, 0) AS returned_any,
      COALESCE(a.pod_scope, 0)   AS pod_scope,
      COALESCE(a.pod_ok, 0)      AS pod_ok,
      a.p50,
      a.p90,
      COALESCE(c.failed, 0)      AS coupa_failed
    FROM weeks w
    LEFT JOIN wk_agg  a ON a.wk = w.wk
    LEFT JOIN coupa_wk c ON c.wk = w.wk
  ),

  -- ── Guardrails: live, never date-filtered ──────────────────────────────
  --   A breach is measured from updated_at against now(). Filtering by
  --   creation date would drop the oldest -- i.e. worst -- ones.
  open_pkg AS (
    SELECT p.id, p.status, p.updated_at, p.delivery_location_id
    FROM public.packages p
    WHERE p.deleted_at IS NULL
      AND p.status IN ('pending', 'notified', 'in_transit', 'ready_for_collection')
      AND (
        p_company_id IS NULL
        OR p.receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
  ),
  breaching AS (
    SELECT
      o.id,
      EXTRACT(epoch FROM (v_now - o.updated_at)) / 3600.0        AS hours_stuck,
      public.sla_threshold_hours(o.status)                       AS threshold
    FROM open_pkg o
    WHERE public.sla_threshold_hours(o.status) IS NOT NULL
      AND EXTRACT(epoch FROM (v_now - o.updated_at)) / 3600.0
            > public.sla_threshold_hours(o.status)
  ),
  -- Money standing still. Same per-item valuation the executive dashboard
  -- uses: quantity × inventory unit_price, 0 when unlinked or unpriced.
  at_risk AS (
    SELECT COALESCE(sum(pi.quantity * COALESCE(ii.unit_price, 0)), 0) AS value
    FROM public.package_items pi
    JOIN breaching b ON b.id = pi.package_id
    LEFT JOIN public.inventory_items ii ON ii.id = pi.inventory_item_id
  ),
  reverts AS (
    SELECT
      count(*)                     AS total,
      count(DISTINCT driver_user_id) AS drivers
    FROM public.package_revert_events re
    WHERE re.reverted_at >= v_now - INTERVAL '7 days'
      AND (
        p_company_id IS NULL
        OR re.package_id IN (SELECT id FROM public.packages WHERE receiver_id IN (
             SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id))
      )
  ),
  -- Same population as `reverts` above, including the company scope: a "9 this
  -- week, most of them Naledi's" line has to be counting the same 9.
  worst_driver AS (
    SELECT
      COALESCE(sp.full_name, 'Unassigned') AS name,
      count(*)                             AS reverts
    FROM public.package_revert_events re
    LEFT JOIN public.staff_profiles sp ON sp.user_id = re.driver_user_id
    WHERE re.reverted_at >= v_now - INTERVAL '7 days'
      AND (
        p_company_id IS NULL
        OR re.package_id IN (SELECT id FROM public.packages WHERE receiver_id IN (
             SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id))
      )
    GROUP BY 1
    ORDER BY 2 DESC, 1
    LIMIT 1
  ),
  -- Stock-outs that are actually blocking something. An out-of-stock item
  -- nobody has ordered is a purchasing note, not a signal.
  stock_blocking AS (
    SELECT count(DISTINCT ii.id) AS items
    FROM public.inventory_items ii
    JOIN public.package_items pi ON pi.inventory_item_id = ii.id
    JOIN open_pkg o ON o.id = pi.package_id
    WHERE ii.is_active
      AND ii.quantity <= 0
  ),

  -- ── Business layer ─────────────────────────────────────────────────────
  rev_base AS (
    SELECT
      p.id,
      p.receiver_email,
      COALESCE(p.collected_at, p.updated_at) AS completed_at
    FROM public.packages p
    WHERE p.deleted_at IS NULL
      AND p.status = 'collected'
      -- Only the current and prior 28-day windows are ever read below, and the
      -- same updated_at >= completed_at reasoning as term_base applies.
      AND p.updated_at >= v_prior_start
      AND (
        p_company_id IS NULL
        OR p.receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
  ),
  rev_value AS (
    SELECT
      b.id,
      b.receiver_email,
      b.completed_at,
      COALESCE(sum(pi.quantity * COALESCE(ii.unit_price, 0)), 0) AS value
    FROM rev_base b
    LEFT JOIN public.package_items pi ON pi.package_id = b.id
    LEFT JOIN public.inventory_items ii ON ii.id = pi.inventory_item_id
    GROUP BY b.id, b.receiver_email, b.completed_at
  ),
  rev AS (
    SELECT
      round(COALESCE(sum(value) FILTER (WHERE completed_at >= v_cur_start), 0)::numeric, 2)   AS cur_value,
      count(*)                 FILTER (WHERE completed_at >= v_cur_start)                     AS cur_orders,
      round(COALESCE(sum(value) FILTER (WHERE completed_at >= v_prior_start
                                          AND completed_at < v_cur_start), 0)::numeric, 2)    AS prior_value
    FROM rev_value
  ),
  -- Concentration over the same 28-day window as the revenue beside it, so the
  -- two figures describe one period rather than two different ones.
  by_customer AS (
    SELECT receiver_email, sum(value) AS value
    FROM rev_value
    WHERE completed_at >= v_cur_start
    GROUP BY receiver_email
  ),
  concentration AS (
    SELECT
      COALESCE(max(value), 0)  AS top_value,
      COALESCE(sum(value), 0)  AS all_value
    FROM by_customer
  ),
  order_book AS (
    SELECT
      round(COALESCE(sum(po_value), 0)::numeric, 2) AS open_value,
      count(*)                                       AS open_count
    FROM public.purchase_orders
    WHERE COALESCE(status, '') <> 'completed'
  )

  SELECT jsonb_build_object(
    'weeks',         v_weeks,
    'periodDays',    28,
    'companyScoped', v_scoped,
    'generatedAt',   v_now,

    'northStar', (
      SELECT jsonb_build_object(
        'orders',        c.orders,
        'clean',         c.clean,
        'coupaDropped',  cc.failed,
        'denominator',   c.orders + cc.failed,
        'rate',          CASE WHEN c.orders + cc.failed > 0
                              THEN round((c.clean::numeric * 100) / (c.orders + cc.failed), 1)
                              ELSE NULL END,
        'priorRate',     CASE WHEN p.orders + cp.failed > 0
                              THEN round((p.clean::numeric * 100) / (p.orders + cp.failed), 1)
                              ELSE NULL END,
        -- Percentage points lost to each cause, partitioned by precedence
        -- (returned > late > POD) so these sum to exactly 100 − rate.
        'lost', jsonb_build_object(
          'returned', CASE WHEN c.orders + cc.failed > 0
                           THEN round((c.lost_returned::numeric * 100) / (c.orders + cc.failed), 1) ELSE 0 END,
          'late',     CASE WHEN c.orders + cc.failed > 0
                           THEN round((c.lost_late::numeric * 100) / (c.orders + cc.failed), 1) ELSE 0 END,
          'pod',      CASE WHEN c.orders + cc.failed > 0
                           THEN round((c.lost_pod::numeric * 100) / (c.orders + cc.failed), 1) ELSE 0 END,
          'poAccuracy', CASE WHEN c.orders + cc.failed > 0
                           THEN round((cc.failed::numeric * 100) / (c.orders + cc.failed), 1) ELSE 0 END
        )
      )
      FROM cur_agg c CROSS JOIN prior_agg p CROSS JOIN coupa_cur cc CROSS JOIN coupa_prior cp
    ),

    'inputs', (
      SELECT jsonb_build_object(
        'onTime', jsonb_build_object(
          'rate',      CASE WHEN c.orders > 0
                            THEN round(((c.orders - c.late_any)::numeric * 100) / c.orders, 1) ELSE NULL END,
          'priorRate', CASE WHEN p.orders > 0
                            THEN round(((p.orders - p.late_any)::numeric * 100) / p.orders, 1) ELSE NULL END,
          'late',      c.late_any,
          'total',     c.orders
        ),
        'firstTimeRight', jsonb_build_object(
          'rate',      CASE WHEN c.orders > 0
                            THEN round(((c.orders - c.lost_returned)::numeric * 100) / c.orders, 1) ELSE NULL END,
          'priorRate', CASE WHEN p.orders > 0
                            THEN round(((p.orders - p.returned_any)::numeric * 100) / p.orders, 1) ELSE NULL END,
          'returned',  c.lost_returned,
          'total',     c.orders
        ),
        -- Denominator is pod_scope (completed orders), NOT c.orders (which
        -- includes returns). See the cur_agg comment.
        'podCompliance', jsonb_build_object(
          'rate',       CASE WHEN c.pod_scope > 0
                             THEN round((c.pod_ok::numeric * 100) / c.pod_scope, 1) ELSE NULL END,
          'priorRate',  CASE WHEN p.pod_scope > 0
                             THEN round((p.pod_ok::numeric * 100) / p.pod_scope, 1) ELSE NULL END,
          'photoRate',  CASE WHEN c.deliveries > 0
                             THEN round((c.deliveries_with_photo::numeric * 100) / c.deliveries, 1) ELSE NULL END,
          -- The count, not just the rate: "12 orders you cannot defend in a
          -- dispute" is a different job for someone than "97.4%" is.
          'compliant',  c.pod_ok,
          'deliveries', c.deliveries,
          'deliveriesWithPhoto', c.deliveries_with_photo,
          'total',      c.pod_scope
        ),
        'poAccuracy', jsonb_build_object(
          'available',  NOT v_scoped,
          'rate',       CASE WHEN v_scoped OR cc.processed + cc.failed = 0 THEN NULL
                             ELSE round((cc.processed::numeric * 100) / (cc.processed + cc.failed), 1) END,
          'processed',  cc.processed,
          'failed',     cc.failed
        ),
        'cycleTime', jsonb_build_object(
          'p50',       round(c.p50::numeric, 1),
          'p90',       round(c.p90::numeric, 1),
          'priorP90',  round(p.p90::numeric, 1),
          -- Consistency: how much worse the slowest tenth is than the median.
          'tailRatio', CASE WHEN c.p50 > 0 THEN round((c.p90 / c.p50)::numeric, 2) ELSE NULL END,
          'sample',    c.cycle_sample
        )
      )
      FROM cur_agg c CROSS JOIN prior_agg p CROSS JOIN coupa_cur cc
    ),

    'series', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'week',      s.wk,
        'orders',    s.orders,
        'clean',     s.clean,
        'rate',      CASE WHEN s.orders + s.coupa_failed > 0
                          THEN round((s.clean::numeric * 100) / (s.orders + s.coupa_failed), 1) ELSE NULL END,
        'onTime',    CASE WHEN s.orders > 0
                          THEN round(((s.orders - s.late_any)::numeric * 100) / s.orders, 1) ELSE NULL END,
        'firstTimeRight', CASE WHEN s.orders > 0
                          THEN round(((s.orders - s.returned_any)::numeric * 100) / s.orders, 1) ELSE NULL END,
        'pod',       CASE WHEN s.pod_scope > 0
                          THEN round((s.pod_ok::numeric * 100) / s.pod_scope, 1) ELSE NULL END,
        'p50',       round(s.p50::numeric, 1),
        'p90',       round(s.p90::numeric, 1)
      ) ORDER BY s.wk), '[]'::jsonb)
      FROM series s
    ),

    'guardrails', (
      SELECT jsonb_build_object(
        'openBreaches',      (SELECT count(*) FROM breaching),
        'worstBreachHours',  (SELECT round(max(hours_stuck)::numeric, 1) FROM breaching),
        'openOrders',        (SELECT count(*) FROM open_pkg),
        'valueAtRisk',       (SELECT round(value::numeric, 2) FROM at_risk),
        'reverts7d',         (SELECT total FROM reverts),
        'revertDrivers',     (SELECT drivers FROM reverts),
        'worstDriverName',   (SELECT name FROM worst_driver),
        'worstDriverReverts',(SELECT reverts FROM worst_driver),
        'coupaAvailable',    NOT v_scoped,
        'coupaWindowDays',   v_coupa_days,
        'coupaFailed',       (SELECT failed FROM coupa_30d),
        'coupaFailureRate',  (SELECT CASE WHEN v_scoped OR processed + failed = 0 THEN NULL
                                          ELSE round((failed::numeric * 100) / (processed + failed), 1) END
                              FROM coupa_30d),
        'unassignedLocation',(SELECT count(*) FROM open_pkg WHERE delivery_location_id IS NULL),
        'stockOutsBlocking', (SELECT items FROM stock_blocking)
      )
    ),

    'business', (
      SELECT jsonb_build_object(
        'revenue',        r.cur_value,
        'priorRevenue',   r.prior_value,
        'orders',         r.cur_orders,
        -- Rises when quality rises at constant volume, which is the whole
        -- reason to put it beside the North Star rather than raw revenue.
        'perPerfectOrder', CASE WHEN c.clean > 0
                                THEN round(r.cur_value / c.clean, 2) ELSE NULL END,
        'topCustomerShare', CASE WHEN con.all_value > 0
                                THEN round((con.top_value * 100) / con.all_value, 1) ELSE NULL END,
        -- purchase_orders carries no customer link, so the order book cannot be
        -- scoped. Flagged rather than silently shown network-wide beside
        -- company-scoped revenue, which would read as this customer's book.
        'orderBookAvailable', NOT v_scoped,
        'orderBookValue', ob.open_value,
        'orderBookCount', ob.open_count
      )
      FROM rev r CROSS JOIN cur_agg c CROSS JOIN concentration con CROSS JOIN order_book ob
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_signal_metrics(INTEGER, UUID) IS
  'Signals dashboard: Perfect Order Rate (on time AND not returned AND a POD on '
  'file, with dropped Coupa POs in the denominator), its four input levers, live '
  'guardrails and a small business layer. POD compliance is document-exists; the '
  'delivery photo is reported separately as photoRate and does not gate it. '
  'Headlines compare a rolling 28 days against the preceding 28. Requires '
  'dashboard.signals.view.';

GRANT EXECUTE ON FUNCTION public.get_signal_metrics(INTEGER, UUID) TO authenticated;

