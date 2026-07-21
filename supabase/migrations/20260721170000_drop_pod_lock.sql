-- ============================================================================
-- Remove the POD lock mechanism
--
-- `pods.is_locked` has been dead since the original schema. Nothing has ever
-- set it to true -- not this app, and not the Angular app before it, whose
-- edge function also only ever read the column to guard edits. (Its
-- pod-pdf.utils comment claims "the edge function inserts and locks the POD
-- row"; that was an intention, never an implementation.) Everything built
-- around the flag therefore never fired:
--
--   * two BEFORE triggers on packages that would block UPDATE/DELETE when a
--     locked POD exists
--   * a BEFORE UPDATE trigger on pods that would make a locked POD immutable
--   * get_pod_lock_status() / is_pod_locked(), which nothing calls
--   * a NOT EXISTS clause in two packages RLS policies
--   * a POD_LOCKED audit branch that can never be reached
--   * a "Locked" count on two dashboards that is structurally 0
--
-- It was also actively harmful: the Signals dashboard gated Perfect Order Rate
-- on it and read 0.0% for everything until 20260721160000.
--
-- WHAT THIS CHANGES IN PRACTICE: nothing. Every dropped object was a guard
-- conditioned on a value that does not occur, so removing them cannot change
-- behaviour. PODs were already editable and are still undeletable --
-- prevent_pod_deletion is unconditional and is kept.
--
-- WHAT THIS DOES NOT DO: it does not make PODs immutable. That was the other
-- option and it was not taken. If POD immutability is wanted later it should be
-- built deliberately -- decide when a POD becomes final and enforce it from
-- there -- rather than inherited from a flag nobody writes.
--
-- ORDER: dependent objects first, columns last, so the drop cannot fail
-- halfway on a dependency.
-- ============================================================================

-- ── Guard ───────────────────────────────────────────────────────────────────
-- The premise of this migration is that no POD has ever been locked. If that is
-- false on this database -- a manual UPDATE, a deployed edge function not
-- vendored in this repo -- then the flag is carrying real meaning and dropping
-- the column would destroy it silently. Stop instead, and let a person look.
DO $guard$
DECLARE
  v_locked INT;
BEGIN
  SELECT count(*) INTO v_locked FROM public.pods WHERE is_locked;
  IF v_locked > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop the POD lock: % POD(s) have is_locked = true. The mechanism is not dead on this database -- review those records before removing the column.',
      v_locked;
  END IF;
END
$guard$;


-- ── Triggers and lock-only functions ────────────────────────────────────────
DROP TRIGGER IF EXISTS trigger_prevent_package_deletion_when_locked ON public.packages;
DROP TRIGGER IF EXISTS trigger_prevent_package_modification_when_locked ON public.packages;
DROP TRIGGER IF EXISTS trigger_prevent_pod_modification ON public.pods;

DROP FUNCTION IF EXISTS public.prevent_package_deletion_when_locked();
DROP FUNCTION IF EXISTS public.prevent_package_modification_when_locked();
DROP FUNCTION IF EXISTS public.prevent_pod_modification();
DROP FUNCTION IF EXISTS public.get_pod_lock_status(uuid);
DROP FUNCTION IF EXISTS public.is_pod_locked(uuid);


-- ── Functions that referenced the flag but do more ──────────────────────────

-- Keeps the POD_PDF_GENERATED branch; drops the unreachable POD_LOCKED one.
CREATE OR REPLACE FUNCTION public.audit_pod_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Log when PDF is generated
  IF NEW.pdf_url IS NOT NULL AND OLD.pdf_url IS NULL THEN
    INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
    VALUES (
      'POD_PDF_GENERATED',
      'pod',
      NEW.id,
      COALESCE(auth.uid(), NEW.staff_id),
      jsonb_build_object(
        'pod_reference', NEW.pod_reference,
        'pdf_url', NEW.pdf_url,
        'pdf_path', NEW.pdf_path,
        'generated_at', NEW.pdf_generated_at
      )
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Unchanged except for the `was_locked` metadata key. This is the real
-- immutability guarantee in the product and it stays: PODs cannot be deleted.
CREATE OR REPLACE FUNCTION public.prevent_pod_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Log the attempted deletion before raising exception
  INSERT INTO audit_logs (action, entity_type, entity_id, performed_by, metadata)
  SELECT
    'POD_DELETE_ATTEMPT',
    'pod',
    OLD.id,
    COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID),
    jsonb_build_object(
      'pod_reference', OLD.pod_reference,
      'package_id', OLD.package_id,
      'attempted_at', NOW(),
      'denial_reason', 'POD records are immutable and cannot be deleted'
    );

  RAISE EXCEPTION 'POD_DELETE_DENIED: POD records cannot be deleted. Record: %, Package: %',
    OLD.pod_reference, OLD.package_reference;
END;
$function$;


-- ── RLS policies on packages ────────────────────────────────────────────────
-- Both carried `NOT EXISTS (... pods.is_locked = true)`, a restrictive clause
-- that has always evaluated to TRUE. Re-created without it, otherwise
-- unchanged from 20260714210000_phase2_enforce_permissions.
--
-- The UPDATE policy gets an explicit WITH CHECK rather than none: with the
-- clause removed there is nothing left to check, and omitting WITH CHECK makes
-- Postgres fall back to USING, which is the same predicate but says so by
-- accident rather than on purpose.
DROP POLICY IF EXISTS "Can update orders" ON public.packages;
CREATE POLICY "Can update orders" ON public.packages
  FOR UPDATE TO authenticated
  USING (public.has_permission('orders.update'))
  WITH CHECK (public.has_permission('orders.update'));

DROP POLICY IF EXISTS "Can hard-delete orders" ON public.packages;
CREATE POLICY "Can hard-delete orders" ON public.packages
  FOR DELETE TO authenticated
  USING (public.has_permission('orders.delete_hard'));


-- ── Dashboard RPCs ──────────────────────────────────────────────────────────
-- Both counted the flag, so both must stop referencing the column before it can
-- be dropped. CREATE OR REPLACE takes the whole body, so each is reproduced in
-- full below; the only change in either is the removal of the `locked` count
-- and its payload key.
--
-- get_dashboard_metrics is unchanged from 20260717220000 apart from that.
-- get_signal_metrics is unchanged from 20260721160000 apart from that.

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
  IF NOT public.has_permission('dashboard.ops.view') THEN
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
  --   NOTE: `pickups` counts packages that STILL carry this driver's
  --   picked_up_by. The nightly revert clears that column, so a reverted order
  --   silently leaves the driver's pickup count. package_revert_events is the
  --   only durable record that the driver ever held it — which is exactly why
  --   the revert counts below are sourced from there and not from `pkg`.
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

  -- ── Overnight reverts per driver (from package_revert_events) ───────────
  --   Deliberately NOT filtered by p_date_from/p_date_to: the two windows are
  --   intrinsic to the metric (rolling 30 days, and all-time). Company scope
  --   still applies — that is a "whose orders am I looking at" question — and
  --   is resolved through the package's receiver, mirroring the `pkg` CTE.
  revert_counts AS (
    SELECT
      re.driver_user_id                                                        AS uid,
      count(*) FILTER (WHERE re.reverted_at >= v_now - INTERVAL '30 days')::int AS reverts_30d,
      count(*)::int                                                            AS reverts_all
    FROM public.package_revert_events re
    WHERE re.driver_user_id IS NOT NULL
      AND (
        p_company_id IS NULL
        OR re.package_id IN (
          SELECT p.id FROM public.packages p
          WHERE p.receiver_id IN (
            SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id
          )
        )
      )
    GROUP BY re.driver_user_id
  ),

  -- Union of both id spaces: a driver whose every order was reverted has no
  -- rows left in `pkg` (picked_up_by was cleared), so an inner join to perf_raw
  -- would erase precisely the worst performer this feature exists to surface.
  perf_uids AS (
    SELECT uid FROM perf_raw
    UNION
    SELECT uid FROM revert_counts
  ),
  perf AS (
    SELECT
      u.uid                                                        AS "driverUserId",
      COALESCE(sp.full_name, 'Unknown driver')                    AS name,
      COALESCE(pr.pickups, 0)                                     AS pickups,
      COALESCE(pr.delivered, 0)                                   AS delivered,
      COALESCE(pr.in_transit, 0)                                  AS "inTransit",
      CASE WHEN pr.avg_hours IS NULL THEN NULL
           ELSE round(pr.avg_hours::numeric, 1) END               AS "avgDeliveryHours",
      CASE WHEN pt.total_delivered > 0
           THEN round((COALESCE(pr.delivered, 0)::numeric / pt.total_delivered) * 100)::int
           ELSE 0 END                                             AS "completionRate",
      COALESCE(rc.reverts_30d, 0)                                 AS "revertedLast30Days",
      COALESCE(rc.reverts_all, 0)                                 AS "revertedAllTime"
    FROM perf_uids u
    LEFT JOIN perf_raw      pr ON pr.uid = u.uid
    LEFT JOIN revert_counts rc ON rc.uid = u.uid
    CROSS JOIN perf_total pt
    LEFT JOIN public.staff_profiles sp ON sp.user_id = u.uid AND sp.role = 'driver'
    ORDER BY COALESCE(pr.delivered, 0) DESC, COALESCE(pr.pickups, 0) DESC
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

  -- ── POD compliance (date filtered on collected_at) ─────────────────────
  -- The population is orders *completed* in the window, not the `pkg` CTE
  -- (which filters on created_at): an order created in June and completed in
  -- July belongs to July's compliance, and one created in July but still open
  -- has nothing to have a POD for yet. `collected` is the only terminal status
  -- in the package_status enum -- there is no 'delivered' status; the
  -- delivered/collected distinction lives on the POD.
  completed_pkg AS (
    SELECT id, collected_at
    FROM public.packages
    WHERE deleted_at IS NULL
      AND status = 'collected'
      AND collected_at IS NOT NULL
      AND (p_date_from IS NULL OR collected_at >= p_date_from)
      AND (p_date_to   IS NULL OR collected_at <= p_date_to)
      AND (
        p_company_id IS NULL
        OR receiver_id IN (SELECT id FROM public.receiver_profiles WHERE company_id = p_company_id)
      )
  ),

  -- LEFT JOIN keeps POD-less orders in the denominator -- they are the whole
  -- point. Safe 1:1: pods.package_id carries a unique index.
  pod AS (
    SELECT
      count(*)                                                          AS total,
      count(d.id)                                                       AS with_pod,
      count(*) FILTER (WHERE d.pdf_url IS NOT NULL)                     AS with_pdf,
      count(*) FILTER (WHERE d.completion_status = 'Delivered')         AS deliveries,
      count(*) FILTER (WHERE d.completion_status = 'Delivered'
                         AND d.delivery_photo_url IS NOT NULL)          AS deliveries_with_photo,
      count(*) FILTER (WHERE c.collected_at >= v_today_start)           AS today,
      count(*) FILTER (WHERE c.collected_at >= v_now - INTERVAL '7 days') AS this_week
    FROM completed_pkg c
    LEFT JOIN public.pods d ON d.package_id = c.id
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
        'total', total, 'withPod', with_pod, 'withPdf', with_pdf,
        'deliveries', deliveries, 'deliveriesWithPhoto', deliveries_with_photo,
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

-- CREATE OR REPLACE preserves existing grants; restated so this file stands alone.
GRANT EXECUTE ON FUNCTION public.get_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;


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
  --   Compliant = a POD exists, is locked, and carries a photo *if* it was a
  --   driver delivery. A receiver collecting at the counter has no photo to
  --   take, so collections are not marked non-compliant for lacking one.
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
      -- A POD counts when the document exists. Deliberately NOT gated on
      -- pods.is_locked, which no longer exists: nothing ever set it, so the
      -- clause was false for every order. The photo is
      -- measured separately as photoRate rather than folded in here -- a
      -- delivery evidenced by signature alone is weak evidence, not no POD.
      NOT pp.has_pod                                                          AS pod_gap,
      pp.is_delivery,
      pp.has_photo,
      pp.locked
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


-- ── The columns ─────────────────────────────────────────────────────────────
-- Last, now that nothing depends on them. No data is lost: the guard above
-- established that is_locked is false everywhere, and locked_at is only ever
-- written by the trigger that set it when is_locked became true.
ALTER TABLE public.pods DROP COLUMN IF EXISTS is_locked;
ALTER TABLE public.pods DROP COLUMN IF EXISTS locked_at;
