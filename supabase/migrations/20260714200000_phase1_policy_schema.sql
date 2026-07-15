-- Phase 1 — policy schema, resolver and seed.
--
-- See docs/access-control-policy-design.md.
--
-- This migration is deliberately INERT: it creates the tables, the resolver and
-- the seed data, but nothing consults has_permission() yet. No RLS policy, no
-- RPC and no edge function calls it until Phase 2. Deploying this changes
-- nobody's access.
--
-- Model: a staff member inherits their role's permission set; an admin may then
-- grant or deny individual permissions on that specific user. Active admins
-- bypass the whole thing unconditionally, so it is not possible to lock every
-- admin out of the policy system by unticking the wrong box.

-- ---------------------------------------------------------------------------
-- Catalog: one row per capability the app can gate on.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.permissions (
  key          TEXT PRIMARY KEY,
  feature      TEXT NOT NULL,
  label        TEXT NOT NULL,
  description  TEXT,
  is_sensitive BOOLEAN NOT NULL DEFAULT false,
  sort_order   INT  NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.permissions IS
  'Catalog of capabilities. Seeded by migration, not user-editable — adding a '
  'permission means shipping code that checks it.';
COMMENT ON COLUMN public.permissions.is_sensitive IS
  'Money, bulk PII egress, privilege grants and destructive actions. The admin '
  'screen marks these visually.';

-- ---------------------------------------------------------------------------
-- Role defaults: what a role can do out of the box. Admin-editable.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role           public.staff_role NOT NULL,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  PRIMARY KEY (role, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions (role);

-- ---------------------------------------------------------------------------
-- Per-user overrides. Absence of a row = inherit from role.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_permissions (
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  effect         TEXT NOT NULL CHECK (effect IN ('grant', 'deny')),
  granted_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions (user_id);

COMMENT ON TABLE public.user_permissions IS
  'Override layer. deny beats grant beats role default. One row per (user, permission) '
  'at most — the PK enforces that a permission cannot be both granted and denied.';

-- ---------------------------------------------------------------------------
-- The resolver. Everything — RLS, RPCs, edge functions, the UI — asks this.
--
-- STABLE so Postgres evaluates it once per statement rather than once per row:
-- Phase 2 puts this inside RLS policies on packages and package_items, which
-- are the hottest tables in the app.
--
-- SECURITY DEFINER so it can read the policy tables regardless of the caller's
-- RLS. The function owner bypasses RLS on these tables, so there is no
-- recursion between has_permission() and the policies protecting its inputs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.has_permission(p_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    -- 1. Active admins are unconditional. This is the anti-lockout guarantee:
    --    no combination of policy rows can strip an admin of anything.
    WHEN public.is_active_admin() THEN true

    -- Everything below requires an active staff account. A deactivated user,
    -- or a portal customer, resolves to false at every remaining branch.
    WHEN NOT public.is_active_staff() THEN false

    -- 2. Explicit per-user deny.
    WHEN EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.permission_key = p_key
        AND up.effect = 'deny'
    ) THEN false

    -- 3. Explicit per-user grant.
    WHEN EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = auth.uid()
        AND up.permission_key = p_key
        AND up.effect = 'grant'
    ) THEN true

    -- 4. Role default.
    ELSE EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      JOIN public.role_permissions rp ON rp.role = sp.role
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND rp.permission_key = p_key
    )
  END;
$$;

GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated;

-- Returns the caller's fully-resolved permission set. The frontend fetches this
-- once and caches it; it is also what the admin screen previews per user.
CREATE OR REPLACE FUNCTION public.my_permissions()
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(p.key ORDER BY p.key), ARRAY[]::TEXT[])
  FROM public.permissions p
  WHERE public.has_permission(p.key);
$$;

GRANT EXECUTE ON FUNCTION public.my_permissions() TO authenticated;

-- ---------------------------------------------------------------------------
-- RLS on the policy tables themselves.
--
-- Readable by any active staff member: the UI needs the catalog and the user's
-- own resolved set, and hiding the shape of the permission system from staff
-- buys nothing. Writable only by someone holding policies.manage — which, by
-- the admin bypass above, always includes every active admin.
-- ---------------------------------------------------------------------------

ALTER TABLE public.permissions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Active staff can read the permission catalog" ON public.permissions
  FOR SELECT TO authenticated USING (public.is_active_staff());

CREATE POLICY "Active staff can read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (public.is_active_staff());

CREATE POLICY "Policy managers can write role permissions" ON public.role_permissions
  FOR ALL TO authenticated
  USING (public.has_permission('policies.manage'))
  WITH CHECK (public.has_permission('policies.manage'));

CREATE POLICY "Active staff can read user permissions" ON public.user_permissions
  FOR SELECT TO authenticated USING (public.is_active_staff());

CREATE POLICY "Policy managers can write user permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (public.has_permission('policies.manage'))
  WITH CHECK (public.has_permission('policies.manage'));

-- The catalog is seeded by migration; nobody writes it at runtime. No INSERT /
-- UPDATE / DELETE policy exists, so RLS denies those to every client role.

-- Table grants are the outer gate; RLS above is the real one. permissions is
-- read-only to clients because the catalog ships with the code.
GRANT SELECT ON public.permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;

-- ---------------------------------------------------------------------------
-- Seed: the catalog.
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (key, feature, label, description, is_sensitive, sort_order) VALUES
  ('orders.read',            'Orders',          'View orders',              'See the orders list and order detail.',                         false, 10),
  ('orders.create',          'Orders',          'Create orders',            'Create a new package/order.',                                   false, 11),
  ('orders.update',          'Orders',          'Edit orders',              'Change status, notes, line items and assigned driver.',        false, 12),
  ('orders.delete',          'Orders',          'Delete orders',            'Soft-delete an order and return its stock.',                    true,  13),
  ('orders.restore',         'Orders',          'Restore deleted orders',   'Restore a soft-deleted order and re-deduct its stock.',         true,  14),
  ('orders.delete_hard',     'Orders',          'Permanently delete orders','Irreversible. Removes the order row entirely.',                 true,  15),
  ('orders.export',          'Orders',          'Export orders',            'Download orders as CSV.',                                       false, 16),
  ('orders.audit.view',      'Orders',          'View order audit log',     'See who changed what on an order.',                             false, 17),

  ('pod.view',               'Proof of delivery','View PODs',               'Open a POD document and its signatures.',                       false, 20),
  ('pod.export_bulk',        'Proof of delivery','Bulk-export PODs',        'Download many POD PDFs, including signatures, as a ZIP.',       true,  21),

  ('inventory.read',         'Inventory',       'View inventory',           'See stock items and movement history.',                         false, 30),
  ('inventory.create',       'Inventory',       'Create inventory items',   'Add a new stock item.',                                         false, 31),
  ('inventory.update',       'Inventory',       'Edit inventory items',     'Edit item details, including unit price.',                      false, 32),
  ('inventory.delete',       'Inventory',       'Delete inventory items',   'Delete stock items. Loses movement history.',                   true,  33),
  ('inventory.restock',      'Inventory',       'Restock inventory',        'Record stock coming in.',                                       false, 34),
  ('inventory.export',       'Inventory',       'Export inventory',         'Download inventory and movement history as CSV.',               false, 35),

  ('purchase_orders.read',   'Purchase orders', 'View purchase orders',     'See POs, their line items and prices.',                         false, 40),
  ('purchase_orders.create', 'Purchase orders', 'Create purchase orders',   'Raise a new PO.',                                               false, 41),
  ('purchase_orders.update', 'Purchase orders', 'Edit purchase orders',     'Edit PO lines, quantities and allocations.',                    false, 42),

  ('customers.read',         'Customers',       'View customers',           'See receivers, contacts and companies.',                        false, 50),
  ('customers.create',       'Customers',       'Create customers',         'Add a receiver or contact.',                                    false, 51),
  ('customers.update',       'Customers',       'Edit customers',           'Edit receiver and contact details.',                            false, 52),
  ('customers.deactivate',   'Customers',       'Deactivate customers',     'Deactivate or reactivate a receiver.',                          false, 53),
  ('customers.invite',       'Customers',       'Invite customers',         'Grant a customer portal access as buyer or runner.',            true,  54),
  ('companies.create',       'Customers',       'Create companies',         'Add a customer company.',                                       false, 55),
  ('companies.delete',       'Customers',       'Delete companies',         'Delete a company. High blast radius — cascades to its rows.',   true,  56),

  ('locations.read',         'Locations',       'View delivery locations',  'See collection points.',                                        false, 60),
  ('locations.create',       'Locations',       'Create delivery locations','Add a collection point.',                                       false, 61),
  ('locations.update',       'Locations',       'Edit delivery locations',  'Edit or deactivate a collection point.',                        false, 62),
  ('locations.delete',       'Locations',       'Delete delivery locations','Permanently remove a collection point.',                        true,  63),

  ('drivers.read',           'Drivers',         'View drivers',             'See the driver list and their active packages.',                false, 70),
  ('drivers.track',          'Drivers',         'Track drivers live',       'See live driver GPS positions on the map.',                     true,  71),

  ('users.read',             'Users',           'View users',               'See the staff list.',                                           false, 80),
  ('users.manage',           'Users',           'Manage users',             'Create staff, change roles, deactivate. Grants privilege.',     true,  81),

  ('email_templates.read',   'Email',           'View email templates',     'Read the transactional email templates.',                       false, 90),
  ('email_templates.edit',   'Email',           'Edit email templates',     'Change what customers receive.',                                true,  91),
  ('email.send_test',        'Email',           'Send test emails',         'Trigger an outbound test send.',                                true,  92),

  ('dashboard.ops.view',     'Dashboards',      'View operations dashboard','Volumes, cycle times, SLA health.',                             false, 100),
  ('dashboard.exec.view',    'Dashboards',      'View executive dashboard', 'Revenue, margins, top customers by value.',                     true,  101),
  ('sla.export',             'Reports',         'Export SLA breaches',      'CSV of breaching orders incl. receiver name, email and phone.', true,  110),

  ('policies.manage',        'Access control',  'Manage access policies',   'Edit role permissions and per-user overrides.',                 true,  120)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Guard: the seed below assumes nobody currently holds manager / staff / viewer.
--
-- Those three roles are checked nowhere today, so their holders (if any) inherit
-- the is_active_staff() floor — full staff read AND write. Seeding them as
-- designed is therefore a real tightening. If a live account holds one, stop and
-- look at who they are rather than silently demoting a person on deploy.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_count INT;
  v_who   TEXT;
BEGIN
  SELECT count(*), string_agg(email || ' (' || role || ')', ', ')
    INTO v_count, v_who
  FROM public.staff_profiles
  WHERE is_active AND role IN ('manager', 'staff', 'viewer');

  IF v_count > 0 THEN
    RAISE EXCEPTION
      'Phase 1 seed assumed no active user holds manager/staff/viewer, but found %: %. '
      'These roles currently inherit full staff write access; seeding them as designed '
      'would tighten these accounts. Review before proceeding.', v_count, v_who;
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Seed: role defaults.
--
-- 'admin' is deliberately NOT seeded — has_permission() short-circuits to true
-- for any active admin, so admin rows here would be dead data that could drift
-- out of sync with the real behaviour. The admin screen renders admin as all-on
-- and locked.
--
-- Three cells deviate from current behaviour, on purpose (design doc §Deviations):
--   * warehouse loses inventory.delete — deactivate covers the real need, and
--     deleting an item loses its movement history.
--   * warehouse loses dashboard.exec.view and sla.export — the Executive tab
--     currently renders to everyone despite the code documenting it as
--     admin-only. That is a bug, and it is not getting enshrined here.
--   * manager / staff / viewer are seeded by intent (see the guard above).
-- ---------------------------------------------------------------------------

INSERT INTO public.role_permissions (role, permission_key) VALUES
  -- manager: runs the depot day to day, trusted with revenue, cannot touch users or policy.
  ('manager', 'orders.read'), ('manager', 'orders.create'), ('manager', 'orders.update'),
  ('manager', 'orders.delete'), ('manager', 'orders.restore'), ('manager', 'orders.export'),
  ('manager', 'orders.audit.view'),
  ('manager', 'pod.view'),
  ('manager', 'inventory.read'), ('manager', 'inventory.create'), ('manager', 'inventory.update'),
  ('manager', 'inventory.delete'), ('manager', 'inventory.restock'), ('manager', 'inventory.export'),
  ('manager', 'purchase_orders.read'), ('manager', 'purchase_orders.create'), ('manager', 'purchase_orders.update'),
  ('manager', 'customers.read'), ('manager', 'customers.create'), ('manager', 'customers.update'),
  ('manager', 'customers.deactivate'), ('manager', 'customers.invite'), ('manager', 'companies.create'),
  ('manager', 'locations.read'), ('manager', 'locations.create'), ('manager', 'locations.update'),
  ('manager', 'locations.delete'),
  ('manager', 'drivers.read'), ('manager', 'drivers.track'),
  ('manager', 'users.read'),
  ('manager', 'email_templates.read'),
  ('manager', 'dashboard.ops.view'), ('manager', 'dashboard.exec.view'), ('manager', 'sla.export'),

  -- warehouse: the core operational role. Behaviour-preserving except the two tightenings above.
  ('warehouse', 'orders.read'), ('warehouse', 'orders.create'), ('warehouse', 'orders.update'),
  ('warehouse', 'orders.export'),
  ('warehouse', 'pod.view'),
  ('warehouse', 'inventory.read'), ('warehouse', 'inventory.create'), ('warehouse', 'inventory.update'),
  ('warehouse', 'inventory.restock'), ('warehouse', 'inventory.export'),
  ('warehouse', 'purchase_orders.read'), ('warehouse', 'purchase_orders.create'), ('warehouse', 'purchase_orders.update'),
  ('warehouse', 'customers.read'), ('warehouse', 'customers.create'), ('warehouse', 'customers.update'),
  ('warehouse', 'customers.deactivate'), ('warehouse', 'customers.invite'), ('warehouse', 'companies.create'),
  ('warehouse', 'locations.read'), ('warehouse', 'locations.create'), ('warehouse', 'locations.update'),
  ('warehouse', 'drivers.read'), ('warehouse', 'drivers.track'),
  ('warehouse', 'users.read'),
  ('warehouse', 'email_templates.read'),
  ('warehouse', 'dashboard.ops.view'),

  -- collection: receives at the collection point and hands over. Read-mostly.
  ('collection', 'orders.read'), ('collection', 'orders.update'),
  ('collection', 'pod.view'),
  ('collection', 'inventory.read'),
  ('collection', 'purchase_orders.read'),
  ('collection', 'customers.read'),
  ('collection', 'locations.read'),
  ('collection', 'drivers.read'),
  ('collection', 'users.read'),
  ('collection', 'dashboard.ops.view'),

  -- driver: the native app in the field. This set is a COMPATIBILITY CONTRACT —
  -- Phase 2 keeps the old role check as an OR-fallback in update-package and
  -- driver-pickup precisely so a wrong cell here cannot strand a driver.
  ('driver', 'orders.read'), ('driver', 'orders.update'),
  ('driver', 'pod.view'),
  ('driver', 'locations.read'),
  ('driver', 'drivers.read'),

  -- staff: general office. Can move orders along, cannot delete or see money.
  ('staff', 'orders.read'), ('staff', 'orders.create'), ('staff', 'orders.update'), ('staff', 'orders.export'),
  ('staff', 'pod.view'),
  ('staff', 'inventory.read'),
  ('staff', 'purchase_orders.read'), ('staff', 'purchase_orders.create'),
  ('staff', 'customers.read'), ('staff', 'customers.create'), ('staff', 'customers.update'),
  ('staff', 'locations.read'),
  ('staff', 'drivers.read'),
  ('staff', 'users.read'),
  ('staff', 'email_templates.read'),
  ('staff', 'dashboard.ops.view'),

  -- viewer: read-only, and explicitly NOT live driver GPS (that is people-tracking)
  -- and NOT the staff list.
  ('viewer', 'orders.read'),
  ('viewer', 'pod.view'),
  ('viewer', 'inventory.read'),
  ('viewer', 'purchase_orders.read'),
  ('viewer', 'customers.read'),
  ('viewer', 'locations.read'),
  ('viewer', 'drivers.read'),
  ('viewer', 'dashboard.ops.view')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Last-admin protection.
--
-- has_permission() gives active admins an unconditional bypass, which makes
-- "admin" the break-glass path. If the last one can be demoted or deactivated,
-- that path closes and the only way back in is a service-role script.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_was_active_admin BOOLEAN;
  v_still_admin      BOOLEAN;
  v_other_admins     INT;
BEGIN
  v_was_active_admin := (OLD.role = 'admin' AND OLD.is_active);

  IF NOT v_was_active_admin THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_still_admin := false;
  ELSE
    v_still_admin := (NEW.role = 'admin' AND NEW.is_active);
  END IF;

  IF v_still_admin THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_other_admins
  FROM public.staff_profiles sp
  WHERE sp.role = 'admin'
    AND sp.is_active
    AND sp.id <> OLD.id;

  IF v_other_admins = 0 THEN
    RAISE EXCEPTION
      'Cannot remove the last active admin. Promote another admin first.'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trigger_prevent_last_admin_removal ON public.staff_profiles;
CREATE TRIGGER trigger_prevent_last_admin_removal
  BEFORE UPDATE OR DELETE ON public.staff_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();
