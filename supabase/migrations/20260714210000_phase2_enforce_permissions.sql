-- Phase 2 — enforcement.
--
-- See docs/access-control-policy-design.md.
--
-- Phase 1 created the policy tables and has_permission(); nothing consulted them.
-- This migration switches the actual boundary over: every RLS predicate and every
-- SECURITY DEFINER RPC that previously hardcoded a role list now asks
-- has_permission(). This is the migration that can break someone's day, so each
-- section states what changes for whom.
--
-- Active admins bypass has_permission() unconditionally, so admin access is
-- unchanged everywhere below.
--
-- NOT touched here: the customer portal (customer_packages view,
-- customer_reschedule_package, receiver-side policies) — its row-level scoping is
-- already correct and is out of scope by design. upsert_driver_location stays
-- driver-only.

-- ---------------------------------------------------------------------------
-- packages
--
-- Before: SELECT = any active staff. INSERT = warehouse|admin. UPDATE =
-- warehouse|admin|driver (plus three narrower per-role transition policies,
-- which were redundant — permissive policies OR together and the broad one
-- already allowed those transitions). DELETE = admin.
--
-- After: the same shape, expressed as permissions. The narrow transition
-- policies are dropped because the broad UPDATE policy already subsumed them;
-- dropping them removes no restriction that was actually in force.
--
-- The WITH CHECK on UPDATE keeps the POD lock: a locked POD freezes its package,
-- for everyone, permission or not. That is a business invariant, not a
-- permission, and it stays enforced by both this policy and the existing
-- prevent_package_modification_when_locked trigger.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view packages" ON public.packages;
DROP POLICY IF EXISTS "Drivers can view packages" ON public.packages;
DROP POLICY IF EXISTS "Collection staff can view packages" ON public.packages;
CREATE POLICY "Can read orders" ON public.packages
  FOR SELECT TO authenticated USING (public.has_permission('orders.read'));

DROP POLICY IF EXISTS "Controlled package creation" ON public.packages;
CREATE POLICY "Can create orders" ON public.packages
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('orders.create'));

DROP POLICY IF EXISTS "Controlled package update" ON public.packages;
DROP POLICY IF EXISTS "Collection staff can receive packages" ON public.packages;
DROP POLICY IF EXISTS "Collection staff can complete collection" ON public.packages;
DROP POLICY IF EXISTS "Drivers can pickup packages" ON public.packages;
CREATE POLICY "Can update orders" ON public.packages
  FOR UPDATE TO authenticated
  USING (public.has_permission('orders.update'))
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.pods
      WHERE pods.package_id = packages.id AND pods.is_locked = true
    )
  );

DROP POLICY IF EXISTS "No direct package deletion" ON public.packages;
CREATE POLICY "Can hard-delete orders" ON public.packages
  FOR DELETE TO authenticated
  USING (
    public.has_permission('orders.delete_hard')
    AND NOT EXISTS (
      SELECT 1 FROM public.pods
      WHERE pods.package_id = packages.id AND pods.is_locked = true
    )
  );

-- Soft-deleted rows stay hidden from, and immutable to, anyone who cannot
-- restore them. Previously gated on is_order_admin(); orders.restore is granted
-- to admin and manager only, so this is unchanged for everyone else.
DROP POLICY IF EXISTS "Hide soft-deleted packages from non-privileged users" ON public.packages;
CREATE POLICY "Hide soft-deleted packages from non-privileged users"
  ON public.packages AS RESTRICTIVE FOR SELECT TO authenticated
  USING (deleted_at IS NULL OR public.has_permission('orders.restore'));

DROP POLICY IF EXISTS "Block mutations on soft-deleted packages" ON public.packages;
CREATE POLICY "Block mutations on soft-deleted packages"
  ON public.packages AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (deleted_at IS NULL OR public.has_permission('orders.restore'));

-- ---------------------------------------------------------------------------
-- package_items, package_status_history, package_item_catalog
--
-- Line items are part of an order, so they follow the order's permissions:
-- reading them needs orders.read, changing them needs orders.update.
--
-- NOTE: package_items DELETE was admin-only in RLS, and becomes orders.update.
-- This is not the loosening it looks like — the item editor deletes rows through
-- the update-package edge function, which runs as service_role and has always
-- let any warehouse/admin/collection/driver caller delete items. This makes the
-- direct-client rule agree with the path the app actually takes.
--
-- package_item_catalog writes stay admin-only: there is no permission for them
-- because no non-admin UI touches them.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view package items" ON public.package_items;
CREATE POLICY "Can read order items" ON public.package_items
  FOR SELECT TO authenticated USING (public.has_permission('orders.read'));

DROP POLICY IF EXISTS "Warehouse and admins can create package items" ON public.package_items;
CREATE POLICY "Can create order items" ON public.package_items
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('orders.update'));

DROP POLICY IF EXISTS "Admins can delete package items" ON public.package_items;
CREATE POLICY "Can delete order items" ON public.package_items
  FOR DELETE TO authenticated USING (public.has_permission('orders.update'));

DROP POLICY IF EXISTS "Active staff can view status history" ON public.package_status_history;
CREATE POLICY "Can read order status history" ON public.package_status_history
  FOR SELECT TO authenticated USING (public.has_permission('orders.read'));

DROP POLICY IF EXISTS "Active staff can view catalog items" ON public.package_item_catalog;
CREATE POLICY "Can read the item catalog" ON public.package_item_catalog
  FOR SELECT TO authenticated USING (public.has_permission('orders.read'));

DROP POLICY IF EXISTS "Admins can create catalog items" ON public.package_item_catalog;
CREATE POLICY "Admins can create catalog items" ON public.package_item_catalog
  FOR INSERT TO authenticated WITH CHECK (public.is_active_admin());

DROP POLICY IF EXISTS "Admins can delete catalog items" ON public.package_item_catalog;
CREATE POLICY "Admins can delete catalog items" ON public.package_item_catalog
  FOR DELETE TO authenticated USING (public.is_active_admin());

-- ---------------------------------------------------------------------------
-- pods
--
-- Reading a POD (signatures, witness, photos) needs pod.view. Writing one
-- happens during mark-collected, which is an order update — so it follows
-- orders.update rather than getting its own write permission. The lock triggers
-- still veto edits to a locked POD regardless.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view pods" ON public.pods;
CREATE POLICY "Can view PODs" ON public.pods
  FOR SELECT TO authenticated USING (public.has_permission('pod.view'));

DROP POLICY IF EXISTS "Active staff can insert pods" ON public.pods;
CREATE POLICY "Can create PODs" ON public.pods
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('orders.update'));

DROP POLICY IF EXISTS "Active staff can update pods" ON public.pods;
CREATE POLICY "Can update PODs" ON public.pods
  FOR UPDATE TO authenticated
  USING (public.has_permission('orders.update'))
  WITH CHECK (public.has_permission('orders.update'));

-- ---------------------------------------------------------------------------
-- audit_logs
--
-- Was: readable by any active staff. Now: orders.audit.view (admin + manager).
-- The audit trail names who did what, which is not something a viewer or a
-- driver needs. INSERT is unchanged — the triggers and edge functions write it,
-- and the existing policy already pins performed_by to auth.uid().
-- UPDATE/DELETE remain impossible (USING (false)).
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Staff can view audit logs" ON public.audit_logs;
CREATE POLICY "Can view audit logs" ON public.audit_logs
  FOR SELECT TO authenticated USING (public.has_permission('orders.audit.view'));

-- ---------------------------------------------------------------------------
-- inventory
--
-- Was: any active staff could read, create, update AND delete stock. Now split
-- along the catalog. This is the agreed tightening: warehouse keeps everything
-- except delete; collection/staff/viewer become read-only; driver loses access.
--
-- inventory_movements is the ledger — an INSERT is the side effect of a restock,
-- a deduction on order creation, or a return on order deletion. It therefore
-- accepts any of the permissions that can legitimately move stock, rather than
-- inventing a separate one.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view inventory" ON public.inventory_items;
CREATE POLICY "Can read inventory" ON public.inventory_items
  FOR SELECT TO authenticated USING (public.has_permission('inventory.read'));

DROP POLICY IF EXISTS "Active staff can insert inventory" ON public.inventory_items;
CREATE POLICY "Can create inventory" ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('inventory.create'));

DROP POLICY IF EXISTS "Active staff can update inventory" ON public.inventory_items;
CREATE POLICY "Can update inventory" ON public.inventory_items
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('inventory.update')
    OR public.has_permission('inventory.restock')
    -- Creating or editing an order deducts and returns stock.
    OR public.has_permission('orders.create')
    OR public.has_permission('orders.update')
  )
  WITH CHECK (
    public.has_permission('inventory.update')
    OR public.has_permission('inventory.restock')
    OR public.has_permission('orders.create')
    OR public.has_permission('orders.update')
  );

DROP POLICY IF EXISTS "Active staff can delete inventory" ON public.inventory_items;
CREATE POLICY "Can delete inventory" ON public.inventory_items
  FOR DELETE TO authenticated USING (public.has_permission('inventory.delete'));

DROP POLICY IF EXISTS "Active staff can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Can read inventory movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.has_permission('inventory.read'));

DROP POLICY IF EXISTS "Active staff can insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Can record inventory movements" ON public.inventory_movements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('inventory.update')
    OR public.has_permission('inventory.restock')
    OR public.has_permission('orders.create')
    OR public.has_permission('orders.update')
  );

-- ---------------------------------------------------------------------------
-- delivery_locations
--
-- Was: read = any active staff, write = admin only — while the UI showed the
-- "Add location" button to everyone, so a warehouse user clicking it got an RLS
-- error. Now warehouse and manager can genuinely create and edit; deleting stays
-- with admin and manager.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view delivery locations" ON public.delivery_locations;
CREATE POLICY "Can read delivery locations" ON public.delivery_locations
  FOR SELECT TO authenticated USING (public.has_permission('locations.read'));

DROP POLICY IF EXISTS "Admins can create delivery locations" ON public.delivery_locations;
CREATE POLICY "Can create delivery locations" ON public.delivery_locations
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('locations.create'));

DROP POLICY IF EXISTS "Admins can update delivery locations" ON public.delivery_locations;
CREATE POLICY "Can update delivery locations" ON public.delivery_locations
  FOR UPDATE TO authenticated
  USING (public.has_permission('locations.update'))
  WITH CHECK (public.has_permission('locations.update'));

DROP POLICY IF EXISTS "Admins can delete delivery locations" ON public.delivery_locations;
CREATE POLICY "Can delete delivery locations" ON public.delivery_locations
  FOR DELETE TO authenticated USING (public.has_permission('locations.delete'));

-- ---------------------------------------------------------------------------
-- customers: receiver_profiles, receiver_contacts, companies
--
-- receiver_profiles: was read = any active staff, write = admin only (same UI
-- mismatch as locations). Now follows the customers.* permissions. Hard-DELETE
-- of a receiver has no permission in the catalog — the app deactivates instead —
-- so it stays admin-only.
--
-- companies: was writable in full (INSERT/UPDATE/DELETE) by ANY active staff,
-- including deleting a company, which cascades. That is a real tightening:
-- create needs companies.create, delete needs companies.delete (admin only).
--
-- The customer-portal policies on these tables ("Customer reads own profile",
-- "Customer reads own company") are untouched.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Can read customers" ON public.receiver_profiles
  FOR SELECT TO authenticated USING (public.has_permission('customers.read'));

DROP POLICY IF EXISTS "Admins can create receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Can create customers" ON public.receiver_profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('customers.create'));

DROP POLICY IF EXISTS "Admins can update receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Can update customers" ON public.receiver_profiles
  FOR UPDATE TO authenticated
  USING (
    public.has_permission('customers.update')
    OR public.has_permission('customers.deactivate')
  )
  WITH CHECK (
    public.has_permission('customers.update')
    OR public.has_permission('customers.deactivate')
  );

DROP POLICY IF EXISTS "Admins can delete receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Admins can delete receiver profiles" ON public.receiver_profiles
  FOR DELETE TO authenticated USING (public.is_active_admin());

DROP POLICY IF EXISTS "Active staff can view receiver contacts" ON public.receiver_contacts;
CREATE POLICY "Can read customer contacts" ON public.receiver_contacts
  FOR SELECT TO authenticated USING (public.has_permission('customers.read'));

DROP POLICY IF EXISTS "Active staff can insert receiver contacts" ON public.receiver_contacts;
CREATE POLICY "Can create customer contacts" ON public.receiver_contacts
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('customers.create'));

DROP POLICY IF EXISTS "Active staff can update receiver contacts" ON public.receiver_contacts;
CREATE POLICY "Can update customer contacts" ON public.receiver_contacts
  FOR UPDATE TO authenticated
  USING (public.has_permission('customers.update'))
  WITH CHECK (public.has_permission('customers.update'));

DROP POLICY IF EXISTS "Active staff can delete receiver contacts" ON public.receiver_contacts;
CREATE POLICY "Can delete customer contacts" ON public.receiver_contacts
  FOR DELETE TO authenticated USING (public.has_permission('customers.update'));

DROP POLICY IF EXISTS "Active staff can view companies" ON public.companies;
CREATE POLICY "Can read companies" ON public.companies
  FOR SELECT TO authenticated USING (public.has_permission('customers.read'));

DROP POLICY IF EXISTS "Active staff can write companies" ON public.companies;
CREATE POLICY "Can create companies" ON public.companies
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('companies.create'));

CREATE POLICY "Can update companies" ON public.companies
  FOR UPDATE TO authenticated
  USING (public.has_permission('customers.update'))
  WITH CHECK (public.has_permission('customers.update'));

CREATE POLICY "Can delete companies" ON public.companies
  FOR DELETE TO authenticated USING (public.has_permission('companies.delete'));

-- ---------------------------------------------------------------------------
-- purchase orders
--
-- Reads follow purchase_orders.read. Writes already go exclusively through
-- create_purchase_order_with_items / update_purchase_order_with_items (guarded
-- below), so the tables get no client-facing write policy — same as today.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view purchase orders" ON public.purchase_orders;
CREATE POLICY "Can read purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.has_permission('purchase_orders.read'));

DROP POLICY IF EXISTS "Active staff can view po items" ON public.purchase_order_items;
CREATE POLICY "Can read purchase order items" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (public.has_permission('purchase_orders.read'));

DROP POLICY IF EXISTS "Active staff can view po allocations" ON public.purchase_order_item_allocations;
CREATE POLICY "Can read po allocations" ON public.purchase_order_item_allocations
  FOR SELECT TO authenticated USING (public.has_permission('purchase_orders.read'));

-- ---------------------------------------------------------------------------
-- staff_profiles
--
-- CRITICAL: every staff member must be able to read THEIR OWN row — that is how
-- the app resolves who you are and which role you hold. A driver or viewer has
-- no users.read permission, so without the self-read clause the app could not
-- boot for them. Reading OTHER people's rows needs users.read; writing needs
-- users.manage.
--
-- The last-admin trigger from Phase 1 still vetoes removing the final admin.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Active staff can view staff profiles" ON public.staff_profiles;
CREATE POLICY "Can read own profile or the staff list" ON public.staff_profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_permission('users.read'));

DROP POLICY IF EXISTS "Admins can create staff profiles" ON public.staff_profiles;
CREATE POLICY "Can create staff" ON public.staff_profiles
  FOR INSERT TO authenticated WITH CHECK (public.has_permission('users.manage'));

DROP POLICY IF EXISTS "Admins can update staff profiles" ON public.staff_profiles;
CREATE POLICY "Can update staff" ON public.staff_profiles
  FOR UPDATE TO authenticated
  USING (public.has_permission('users.manage'))
  WITH CHECK (public.has_permission('users.manage'));

DROP POLICY IF EXISTS "Admins can delete staff profiles" ON public.staff_profiles;
CREATE POLICY "Can delete staff" ON public.staff_profiles
  FOR DELETE TO authenticated USING (public.has_permission('users.manage'));

-- ---------------------------------------------------------------------------
-- email templates and driver tracking
--
-- driver_locations: live GPS. Reading everyone's position was admin-only; it is
-- now drivers.track (admin, manager, warehouse). A driver's own upsert policy is
-- untouched — that is the mobile app reporting its position.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "email_templates_read_staff" ON public.email_templates;
CREATE POLICY "Can read email templates" ON public.email_templates
  FOR SELECT TO authenticated USING (public.has_permission('email_templates.read'));

DROP POLICY IF EXISTS "email_templates_update_admin" ON public.email_templates;
CREATE POLICY "Can edit email templates" ON public.email_templates
  FOR UPDATE TO authenticated
  USING (public.has_permission('email_templates.edit'))
  WITH CHECK (public.has_permission('email_templates.edit'));

DROP POLICY IF EXISTS "Admins can read all driver locations" ON public.driver_locations;
CREATE POLICY "Can track drivers" ON public.driver_locations
  FOR SELECT TO authenticated USING (public.has_permission('drivers.track'));

-- ---------------------------------------------------------------------------
-- RPC guards.
--
-- These replace the Phase 0 is_active_staff() stopgaps and the hardcoded role
-- checks with the real permission.
-- ---------------------------------------------------------------------------

-- Order delete / restore: was is_order_admin(). orders.delete and orders.restore
-- are seeded to admin + manager, so managers gain this; nobody loses it.
CREATE OR REPLACE FUNCTION public.soft_delete_package(p_package_id uuid)
  RETURNS public.packages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_row public.packages;
BEGIN
  IF NOT public.has_permission('orders.delete') THEN
    RAISE EXCEPTION 'Not authorized to delete orders' USING ERRCODE = '42501';
  END IF;

  UPDATE public.packages
  SET deleted_at = NOW(),
      deleted_by = auth.uid()
  WHERE id = p_package_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found or already deleted', p_package_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_package(p_package_id uuid)
  RETURNS public.packages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_row public.packages;
BEGIN
  IF NOT public.has_permission('orders.restore') THEN
    RAISE EXCEPTION 'Not authorized to restore orders' USING ERRCODE = '42501';
  END IF;

  UPDATE public.packages
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_package_id
    AND deleted_at IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found or not deleted', p_package_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$$;

-- Dashboards. Phase 0 gave these an is_active_staff() guard; they now carry the
-- real permission.
--
-- ⚠ get_sla_breaches moves to sla.export, which warehouse does NOT have. The SLA
-- breach panel therefore disappears for warehouse users. That is the agreed
-- deviation: the panel lists receiver names, emails and phone numbers for every
-- breaching order, and warehouse does not need bulk customer PII to do its job.

-- Inventory deduction. Called from the browser on order create/edit as well as
-- from the inventory screens, so it accepts any permission that can legitimately
-- move stock — otherwise a `staff` user (who may create orders but not edit
-- inventory) could not create an order that consumes stock.
CREATE OR REPLACE FUNCTION public.decrement_inventory_quantity(item_id uuid, decrement_by integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_permission('inventory.update')
    OR public.has_permission('inventory.restock')
    OR public.has_permission('orders.create')
    OR public.has_permission('orders.update')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE public.inventory_items
  SET quantity = quantity - decrement_by
  WHERE id = item_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard RPCs: replace the Phase 0 is_active_staff() stopgap with the real
-- permission. Bodies are unchanged from Phase 0 apart from the guard line.
--
-- get_sla_breaches now requires sla.export, which warehouse does NOT hold, so
-- the SLA breach panel disappears for warehouse users. That is the agreed
-- deviation: the panel lists receiver name, email and phone for every breaching
-- order, and warehouse does not need bulk customer PII to do its job.
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
  IF NOT public.has_permission('dashboard.exec.view') THEN
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

CREATE OR REPLACE FUNCTION public.get_sla_breaches(p_company_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_permission('sla.export') THEN
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


-- ---------------------------------------------------------------------------
-- Purchase order RPCs: the hardcoded warehouse|admin role check becomes
-- purchase_orders.create / purchase_orders.update. Both keep their service_role
-- bypass branch, so service-role callers are unaffected. Bodies are otherwise
-- unchanged from their previous definitions.
--
-- ensureDriverCannotUpdate() in src/lib/api/purchase-orders.ts is now redundant
-- (driver holds neither permission) but is harmless as a client-side
-- short-circuit, so it stays.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_purchase_order_with_items(
  p_po_number text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_receiver_id uuid DEFAULT NULL,
  p_po_value numeric DEFAULT NULL,
  p_po_date date DEFAULT NULL,
  p_details text DEFAULT NULL
)
 RETURNS TABLE(purchase_order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_uid uuid;
  caller_role text;
  payload_items jsonb;
  normalized_po_number text;
  normalized_details text;
  authorized_creator_exists boolean;
BEGIN
  caller_uid := auth.uid();
  caller_role := current_setting('request.jwt.claim.role', true);
  normalized_po_number := btrim(COALESCE(p_po_number, ''));
  normalized_details := NULLIF(btrim(COALESCE(p_details, '')), '');
  payload_items := COALESCE(p_items, '[]'::jsonb);

  IF COALESCE(caller_role, '') <> 'service_role' THEN
    IF caller_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING DETAIL = 'No authenticated user context was found';
    END IF;

    SELECT public.has_permission('purchase_orders.create')
    INTO authorized_creator_exists;

    IF NOT authorized_creator_exists THEN
      RAISE EXCEPTION 'Only active warehouse staff or admins can create purchase orders';
    END IF;
  END IF;

  IF normalized_po_number = '' THEN
    RAISE EXCEPTION 'PO number is required';
  END IF;

  IF p_po_value IS NOT NULL AND p_po_value < 0 THEN
    RAISE EXCEPTION 'PO value cannot be negative';
  END IF;

  IF p_receiver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.receiver_profiles rp WHERE rp.id = p_receiver_id
  ) THEN
    RAISE EXCEPTION 'Selected customer does not exist';
  END IF;

  IF jsonb_typeof(payload_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'p_items must be a JSON array';
  END IF;

  IF jsonb_array_length(payload_items) = 0 THEN
    RAISE EXCEPTION 'At least one PO line is required';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        NULLIF(btrim(COALESCE(row_data->>'inventory_item_id', '')), '') AS inventory_item_id_text,
        NULLIF(btrim(COALESCE(row_data->>'ordered_quantity', '')), '') AS ordered_quantity_text
      FROM jsonb_array_elements(payload_items) row_data
    ) item_rows
    WHERE item_rows.inventory_item_id_text IS NULL
      OR item_rows.inventory_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR item_rows.ordered_quantity_text IS NULL
      OR item_rows.ordered_quantity_text !~ '^-?[0-9]+(\.[0-9]+)?$'
      OR item_rows.ordered_quantity_text::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'Each item row must include inventory_item_id and ordered_quantity > 0';
  END IF;

  INSERT INTO public.purchase_orders (po_number, status, receiver_id, po_value, po_date, details)
  VALUES (normalized_po_number, 'draft', p_receiver_id, p_po_value, p_po_date, normalized_details)
  RETURNING id INTO purchase_order_id;

  INSERT INTO public.purchase_order_items (
    purchase_order_id,
    inventory_item_id,
    ordered_quantity
  )
  SELECT
    purchase_order_id,
    grouped.inventory_item_id,
    grouped.ordered_quantity
  FROM (
    SELECT
      item_rows.inventory_item_id::uuid AS inventory_item_id,
      SUM(item_rows.ordered_quantity::numeric) AS ordered_quantity
    FROM (
      SELECT
        btrim(COALESCE(row_data->>'inventory_item_id', '')) AS inventory_item_id,
        btrim(COALESCE(row_data->>'ordered_quantity', '')) AS ordered_quantity
      FROM jsonb_array_elements(payload_items) row_data
    ) item_rows
    GROUP BY item_rows.inventory_item_id
  ) grouped;

  RETURN NEXT;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.update_purchase_order_with_items(
  p_purchase_order_id uuid,
  p_po_number text,
  p_items jsonb,
  p_receiver_id uuid DEFAULT NULL,
  p_po_value numeric DEFAULT NULL,
  p_po_date date DEFAULT NULL,
  p_details text DEFAULT NULL
)
 RETURNS TABLE(purchase_order_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_uid uuid;
  caller_role text;
  authorized_updater_exists boolean;
  v_status text;
  v_normalized_po_number text;
  v_normalized_details text;
  v_items jsonb;
  v_item jsonb;
  v_line_id uuid;
  v_inventory_item_id uuid;
  v_ordered_quantity numeric;
  v_allocated_floor numeric;
  v_line_belongs_to_po boolean;
BEGIN
  caller_uid := auth.uid();
  caller_role := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');

  IF caller_role <> 'service_role' THEN
    IF caller_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthorized to update purchase orders'
        USING ERRCODE = '42501',
              DETAIL = 'Caller must be an authenticated user or service_role';
    END IF;

    SELECT public.has_permission('purchase_orders.update')
    INTO authorized_updater_exists;

    IF NOT authorized_updater_exists THEN
      RAISE EXCEPTION 'Unauthorized to update purchase orders'
        USING ERRCODE = '42501',
              DETAIL = 'Only active warehouse/admin staff profiles may update purchase orders';
    END IF;
  END IF;

  IF p_purchase_order_id IS NULL THEN
    RAISE EXCEPTION 'Purchase order id is required';
  END IF;

  v_normalized_po_number := btrim(COALESCE(p_po_number, ''));
  IF v_normalized_po_number = '' THEN
    RAISE EXCEPTION 'PO number is required';
  END IF;

  v_normalized_details := NULLIF(btrim(COALESCE(p_details, '')), '');

  IF p_po_value IS NOT NULL AND p_po_value < 0 THEN
    RAISE EXCEPTION 'PO value cannot be negative';
  END IF;

  IF p_receiver_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.receiver_profiles rp WHERE rp.id = p_receiver_id
  ) THEN
    RAISE EXCEPTION 'Selected customer does not exist';
  END IF;

  v_items := COALESCE(p_items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'p_items must be a JSON array';
  END IF;

  -- Every row must carry a positive ordered_quantity and identify EITHER an
  -- existing line (purchase_order_item_id) OR a new inventory item
  -- (inventory_item_id). A row missing both valid identifiers is rejected.
  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        NULLIF(btrim(COALESCE(row_data->>'purchase_order_item_id', '')), '') AS poi_id_text,
        NULLIF(btrim(COALESCE(row_data->>'inventory_item_id', '')), '') AS inv_id_text,
        NULLIF(btrim(COALESCE(row_data->>'ordered_quantity', '')), '') AS ordered_quantity_text
      FROM jsonb_array_elements(v_items) row_data
    ) item_rows
    WHERE item_rows.ordered_quantity_text IS NULL
      OR item_rows.ordered_quantity_text !~ '^-?[0-9]+(\.[0-9]+)?$'
      OR item_rows.ordered_quantity_text::numeric <= 0
      OR (
        (item_rows.poi_id_text IS NULL
          OR item_rows.poi_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
        AND
        (item_rows.inv_id_text IS NULL
          OR item_rows.inv_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
      )
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'Each item row must have ordered_quantity > 0 and either purchase_order_item_id or inventory_item_id';
  END IF;

  SELECT po.status
  INTO v_status
  FROM public.purchase_orders po
  WHERE po.id = p_purchase_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  -- Completed purchase orders remain editable: quantities can still be raised
  -- and new lines added. The allocated-quantity floor below still protects
  -- against reducing a line below what has already been fulfilled.

  IF EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.po_number = v_normalized_po_number
      AND po.id <> p_purchase_order_id
  ) THEN
    RAISE EXCEPTION 'A purchase order with this number already exists';
  END IF;

  -- Lock the existing lines referenced by the payload. New-item rows carry no
  -- purchase_order_item_id yet, so they are skipped here.
  PERFORM 1
  FROM (
    SELECT DISTINCT (NULLIF(btrim(COALESCE(row_data->>'purchase_order_item_id', '')), ''))::uuid AS purchase_order_item_id
    FROM jsonb_array_elements(v_items) row_data
    WHERE NULLIF(btrim(COALESCE(row_data->>'purchase_order_item_id', '')), '') IS NOT NULL
  ) requested_items
  JOIN public.purchase_order_items poi
    ON poi.id = requested_items.purchase_order_item_id
   AND poi.purchase_order_id = p_purchase_order_id
  ORDER BY poi.id
  FOR UPDATE OF poi;

  FOR v_item IN
    SELECT row_data
    FROM jsonb_array_elements(v_items) row_data
  LOOP
    v_line_id := NULLIF(btrim(COALESCE(v_item->>'purchase_order_item_id', '')), '')::uuid;
    v_inventory_item_id := NULLIF(btrim(COALESCE(v_item->>'inventory_item_id', '')), '')::uuid;
    v_ordered_quantity := (v_item->>'ordered_quantity')::numeric;

    IF v_line_id IS NOT NULL THEN
      -- Update an existing line, respecting the already-allocated floor.
      SELECT EXISTS (
        SELECT 1
        FROM public.purchase_order_items poi
        WHERE poi.id = v_line_id
          AND poi.purchase_order_id = p_purchase_order_id
      )
      INTO v_line_belongs_to_po;

      IF NOT v_line_belongs_to_po THEN
        RAISE EXCEPTION 'Purchase order line not found for this purchase order: %', v_line_id;
      END IF;

      SELECT COALESCE(SUM(poa.allocated_quantity), 0)
      INTO v_allocated_floor
      FROM public.purchase_order_item_allocations poa
      WHERE poa.purchase_order_item_id = v_line_id;

      IF v_ordered_quantity < v_allocated_floor THEN
        RAISE EXCEPTION 'Ordered quantity cannot be below allocated quantity for line %', v_line_id;
      END IF;

      UPDATE public.purchase_order_items poi
      SET ordered_quantity = v_ordered_quantity,
          updated_at = timezone('utc', now())
      WHERE poi.id = v_line_id
        AND poi.purchase_order_id = p_purchase_order_id;
    ELSE
      -- Insert a brand-new line for this PO.
      IF v_inventory_item_id IS NULL THEN
        RAISE EXCEPTION 'A new purchase order line requires an inventory item';
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.inventory_items ii WHERE ii.id = v_inventory_item_id
      ) THEN
        RAISE EXCEPTION 'Selected inventory item does not exist: %', v_inventory_item_id;
      END IF;

      BEGIN
        INSERT INTO public.purchase_order_items (
          purchase_order_id,
          inventory_item_id,
          ordered_quantity
        )
        VALUES (
          p_purchase_order_id,
          v_inventory_item_id,
          v_ordered_quantity
        );
      EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'This inventory item is already on the purchase order';
      END;
    END IF;
  END LOOP;

  UPDATE public.purchase_orders po
  SET po_number = v_normalized_po_number,
      receiver_id = p_receiver_id,
      po_value = p_po_value,
      po_date = p_po_date,
      details = v_normalized_details,
      updated_at = timezone('utc', now())
  WHERE po.id = p_purchase_order_id;

  purchase_order_id := p_purchase_order_id;
  RETURN NEXT;
END;
$function$
;
