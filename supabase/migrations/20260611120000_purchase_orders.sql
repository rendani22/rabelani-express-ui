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

GRANT SELECT ON public.purchase_order_item_balances TO authenticated;
