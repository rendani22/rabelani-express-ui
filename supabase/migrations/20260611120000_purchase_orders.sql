SET search_path = public;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  inventory_item_id uuid NOT NULL REFERENCES public.inventory_items(id),
  ordered_quantity numeric NOT NULL CHECK (ordered_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT purchase_order_items_unique_line UNIQUE (purchase_order_id, inventory_item_id)
);

CREATE TABLE IF NOT EXISTS public.purchase_order_item_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_item_id uuid NOT NULL REFERENCES public.purchase_order_items(id) ON DELETE CASCADE,
  package_item_id uuid NOT NULL REFERENCES public.package_items(id) ON DELETE CASCADE,
  allocated_quantity numeric NOT NULL CHECK (allocated_quantity > 0),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT purchase_order_item_allocations_unique UNIQUE (purchase_order_item_id, package_item_id)
);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_item_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "purchase_orders_select_authenticated" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select_authenticated"
  ON public.purchase_orders
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "purchase_orders_mutate_warehouse_admin" ON public.purchase_orders;
CREATE POLICY "purchase_orders_mutate_warehouse_admin"
  ON public.purchase_orders
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
  );

DROP POLICY IF EXISTS "purchase_orders_service_role_all" ON public.purchase_orders;
CREATE POLICY "purchase_orders_service_role_all"
  ON public.purchase_orders
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "purchase_order_items_select_authenticated" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_select_authenticated"
  ON public.purchase_order_items
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "purchase_order_items_mutate_warehouse_admin" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_mutate_warehouse_admin"
  ON public.purchase_order_items
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
  );

DROP POLICY IF EXISTS "purchase_order_items_service_role_all" ON public.purchase_order_items;
CREATE POLICY "purchase_order_items_service_role_all"
  ON public.purchase_order_items
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "purchase_order_item_allocations_select_authenticated" ON public.purchase_order_item_allocations;
CREATE POLICY "purchase_order_item_allocations_select_authenticated"
  ON public.purchase_order_item_allocations
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "purchase_order_item_allocations_mutate_warehouse_admin" ON public.purchase_order_item_allocations;
CREATE POLICY "purchase_order_item_allocations_mutate_warehouse_admin"
  ON public.purchase_order_item_allocations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
  );

DROP POLICY IF EXISTS "purchase_order_item_allocations_service_role_all" ON public.purchase_order_item_allocations;
CREATE POLICY "purchase_order_item_allocations_service_role_all"
  ON public.purchase_order_item_allocations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS purchase_order_items_purchase_order_id_idx
  ON public.purchase_order_items (purchase_order_id);

CREATE INDEX IF NOT EXISTS purchase_order_items_inventory_item_id_idx
  ON public.purchase_order_items (inventory_item_id);

CREATE INDEX IF NOT EXISTS purchase_order_item_allocations_purchase_order_item_id_idx
  ON public.purchase_order_item_allocations (purchase_order_item_id);

CREATE INDEX IF NOT EXISTS purchase_order_item_allocations_package_item_id_idx
  ON public.purchase_order_item_allocations (package_item_id);

CREATE OR REPLACE VIEW public.purchase_order_item_balances AS
SELECT
  poi.id AS purchase_order_item_id,
  poi.purchase_order_id,
  poi.inventory_item_id,
  poi.ordered_quantity,
  COALESCE(SUM(poa.allocated_quantity), 0) AS allocated_quantity,
  (poi.ordered_quantity - COALESCE(SUM(poa.allocated_quantity), 0)) AS remaining_quantity
FROM public.purchase_order_items poi
LEFT JOIN public.purchase_order_item_allocations poa
  ON poa.purchase_order_item_id = poi.id
GROUP BY poi.id;

-- PostgREST relationship hint: link this view's purchase_order_item_id to purchase_order_items.id
COMMENT ON VIEW public.purchase_order_item_balances IS 'purchase_order_items.id->purchase_order_item_balances.purchase_order_item_id';

GRANT SELECT ON public.purchase_order_item_balances TO authenticated;

DO $$
BEGIN
  IF to_regclass('public.purchase_orders') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.purchase_orders';
  END IF;

  IF to_regclass('public.purchase_order_items') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.purchase_order_items';
  END IF;

  IF to_regclass('public.purchase_order_item_allocations') IS NULL THEN
    RAISE EXCEPTION 'Missing required table: public.purchase_order_item_allocations';
  END IF;
END;
$$;
