-- Customer portal — Phase 2: RLS lockdown + customer-facing view.
-- See docs/superpowers/plans/2026-07-07-customer-portal.md → Phase 2.
--
-- ⚠️ SECURITY-CRITICAL. Enabling customer logins turns every "Authenticated
-- users can view X" (USING true) policy into a customer-readable surface. This
-- migration replaces all of them with staff-only equivalents, matching what
-- 20260630130000 already did for `packages`. Staff behaviour is unchanged
-- (staff = any active staff_profile); only customers are newly excluded.
--
-- ⚠️ TEST IN STAGING with three real JWTs before production:
--   * a staff member  → still sees everything they used to
--   * a Buyer         → sees ONLY customer_packages for their company; 0 rows
--                       from packages/pods/purchase_orders/inventory/etc.
--   * a Runner        → sees ONLY their own packages
-- Assumes `packages` does NOT have FORCE ROW LEVEL SECURITY (it does not today);
-- the customer_packages view relies on its owner bypassing packages' RLS.

-- ============================================================================
-- Helpers (SECURITY DEFINER → bypass RLS internally, so policies that reference
-- staff_profiles/receiver_profiles don't recurse on those same tables).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_active_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_profiles sp
    WHERE sp.user_id = auth.uid() AND sp.is_active
  );
$$;

-- The logged-in customer (NULL for staff / anon). role IS NOT NULL guarantees
-- this is an invited portal user, not just any receiver row.
CREATE OR REPLACE FUNCTION public.current_customer()
RETURNS public.receiver_profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.receiver_profiles
  WHERE auth_user_id = auth.uid() AND role IS NOT NULL
  LIMIT 1;
$$;

-- ============================================================================
-- Lock down every world-readable SELECT policy → staff-only.
-- ============================================================================

DROP POLICY IF EXISTS "Authenticated users can view delivery locations" ON public.delivery_locations;
CREATE POLICY "Active staff can view delivery locations" ON public.delivery_locations
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated users can view inventory" ON public.inventory_items;
CREATE POLICY "Active staff can view inventory" ON public.inventory_items
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated users can view inventory movements" ON public.inventory_movements;
CREATE POLICY "Active staff can view inventory movements" ON public.inventory_movements
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated users can view catalog items" ON public.package_item_catalog;
CREATE POLICY "Active staff can view catalog items" ON public.package_item_catalog
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated users can view package items" ON public.package_items;
CREATE POLICY "Active staff can view package items" ON public.package_items
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "package_status_history_select" ON public.package_status_history;
CREATE POLICY "Active staff can view status history" ON public.package_status_history
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "pods_select" ON public.pods;
CREATE POLICY "Active staff can view pods" ON public.pods
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "purchase_order_item_allocations_select_authenticated" ON public.purchase_order_item_allocations;
CREATE POLICY "Active staff can view po allocations" ON public.purchase_order_item_allocations
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "purchase_order_items_select_authenticated" ON public.purchase_order_items;
CREATE POLICY "Active staff can view po items" ON public.purchase_order_items
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "purchase_orders_select_authenticated" ON public.purchase_orders;
CREATE POLICY "Active staff can view purchase orders" ON public.purchase_orders
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "receiver_contacts_select" ON public.receiver_contacts;
CREATE POLICY "Active staff can view receiver contacts" ON public.receiver_contacts
  FOR SELECT TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated users can view staff profiles" ON public.staff_profiles;
CREATE POLICY "Active staff can view staff profiles" ON public.staff_profiles
  FOR SELECT TO authenticated USING (public.is_active_staff());

-- receiver_profiles: staff see all; a customer sees ONLY their own row (needed
-- by the portal to resolve role + company).
DROP POLICY IF EXISTS "Authenticated users can view receiver profiles" ON public.receiver_profiles;
CREATE POLICY "Active staff can view receiver profiles" ON public.receiver_profiles
  FOR SELECT TO authenticated USING (public.is_active_staff());
CREATE POLICY "Customer reads own profile" ON public.receiver_profiles
  FOR SELECT TO authenticated USING (auth_user_id = auth.uid());

-- ============================================================================
-- Lock down broad write policies (customers must not write these).
-- ============================================================================

DROP POLICY IF EXISTS "Staff can insert inventory" ON public.inventory_items;
CREATE POLICY "Active staff can insert inventory" ON public.inventory_items
  FOR INSERT TO authenticated WITH CHECK (public.is_active_staff());
DROP POLICY IF EXISTS "Staff can update inventory" ON public.inventory_items;
CREATE POLICY "Active staff can update inventory" ON public.inventory_items
  FOR UPDATE TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());
DROP POLICY IF EXISTS "Staff can delete inventory" ON public.inventory_items;
CREATE POLICY "Active staff can delete inventory" ON public.inventory_items
  FOR DELETE TO authenticated USING (public.is_active_staff());

DROP POLICY IF EXISTS "Authenticated users can insert inventory movements" ON public.inventory_movements;
CREATE POLICY "Active staff can insert inventory movements" ON public.inventory_movements
  FOR INSERT TO authenticated WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "pods_insert" ON public.pods;
CREATE POLICY "Active staff can insert pods" ON public.pods
  FOR INSERT TO authenticated WITH CHECK (public.is_active_staff());
DROP POLICY IF EXISTS "pods_update" ON public.pods;
CREATE POLICY "Active staff can update pods" ON public.pods
  FOR UPDATE TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());

DROP POLICY IF EXISTS "receiver_contacts_insert" ON public.receiver_contacts;
CREATE POLICY "Active staff can insert receiver contacts" ON public.receiver_contacts
  FOR INSERT TO authenticated WITH CHECK (public.is_active_staff());
DROP POLICY IF EXISTS "receiver_contacts_update" ON public.receiver_contacts;
CREATE POLICY "Active staff can update receiver contacts" ON public.receiver_contacts
  FOR UPDATE TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());
DROP POLICY IF EXISTS "receiver_contacts_delete" ON public.receiver_contacts;
CREATE POLICY "Active staff can delete receiver contacts" ON public.receiver_contacts
  FOR DELETE TO authenticated USING (public.is_active_staff());

-- ============================================================================
-- Companies: staff manage; a customer reads only their own company.
-- ============================================================================
CREATE POLICY "Active staff can view companies" ON public.companies
  FOR SELECT TO authenticated USING (public.is_active_staff());
CREATE POLICY "Active staff can write companies" ON public.companies
  FOR ALL TO authenticated USING (public.is_active_staff()) WITH CHECK (public.is_active_staff());
CREATE POLICY "Customer reads own company" ON public.companies
  FOR SELECT TO authenticated
  USING (id = (SELECT company_id FROM public.current_customer()));

-- ============================================================================
-- Customer-facing view: column-minimal, self-scoping. Customers get SELECT on
-- THIS ONLY — never on packages (their direct reads return 0 rows). The view
-- runs as its owner (security_invoker = false), bypassing packages' staff-only
-- RLS, and scopes rows itself via auth.uid().
-- ============================================================================
-- Note: p.reference (the internal RBX-… order reference) is deliberately NOT
-- exposed — it's for the internal team. Customers identify orders by PO number.
-- p.id is an opaque UUID, kept only as a stable row key.
CREATE OR REPLACE VIEW public.customer_packages
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.po_number,
  p.status,
  p.customer_notes,
  p.created_at,
  p.updated_at,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'description', pi.description, 'quantity', pi.quantity)
             ORDER BY pi.created_at)
    FROM public.package_items pi
    WHERE pi.package_id = p.id
  ), '[]'::jsonb) AS items
FROM public.packages p
WHERE p.deleted_at IS NULL
  AND p.status <> 'draft'          -- drafts are internal WIP; never show customers
  AND EXISTS (
    SELECT 1 FROM public.receiver_profiles me
    WHERE me.auth_user_id = auth.uid()
      AND me.role IS NOT NULL
      AND (
        (me.role = 'runner' AND p.receiver_id = me.id)
        OR
        (me.role = 'buyer' AND p.receiver_id IN (
           SELECT r.id FROM public.receiver_profiles r
           WHERE r.company_id = me.company_id))
      )
  );

REVOKE ALL ON public.customer_packages FROM anon;
GRANT SELECT ON public.customer_packages TO authenticated;
