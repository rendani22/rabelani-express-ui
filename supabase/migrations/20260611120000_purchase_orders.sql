-- Purchase orders schema: standalone POs, PO line items, and package allocations.
-- Includes balance view + integrity checks for non-negative / non-overallocated quantities.

SET search_path = public;

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT purchase_orders_po_number_not_blank CHECK (btrim(po_number) <> '')
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

CREATE INDEX IF NOT EXISTS idx_purchase_orders_status
  ON public.purchase_orders(status);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_purchase_order_id
  ON public.purchase_order_items(purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_items_inventory_item_id
  ON public.purchase_order_items(inventory_item_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_item_allocations_po_item_id
  ON public.purchase_order_item_allocations(purchase_order_item_id);

CREATE INDEX IF NOT EXISTS idx_purchase_order_item_allocations_package_item_id
  ON public.purchase_order_item_allocations(package_item_id);

DROP TRIGGER IF EXISTS purchase_orders_set_updated_at ON public.purchase_orders;
CREATE TRIGGER purchase_orders_set_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS purchase_order_items_set_updated_at ON public.purchase_order_items;
CREATE TRIGGER purchase_order_items_set_updated_at
  BEFORE UPDATE ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS purchase_order_item_allocations_set_updated_at ON public.purchase_order_item_allocations;
CREATE TRIGGER purchase_order_item_allocations_set_updated_at
  BEFORE UPDATE ON public.purchase_order_item_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_allocation_limits()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_purchase_order_item_id uuid;
  v_ordered_quantity numeric;
  v_allocated_total numeric;
BEGIN
  v_purchase_order_item_id := COALESCE(NEW.purchase_order_item_id, OLD.purchase_order_item_id);

  SELECT poi.ordered_quantity
  INTO v_ordered_quantity
  FROM public.purchase_order_items poi
  WHERE poi.id = v_purchase_order_item_id;

  IF v_ordered_quantity IS NULL THEN
    RAISE EXCEPTION 'purchase_order_item % not found', v_purchase_order_item_id;
  END IF;

  SELECT COALESCE(SUM(poa.allocated_quantity), 0)
  INTO v_allocated_total
  FROM public.purchase_order_item_allocations poa
  WHERE poa.purchase_order_item_id = v_purchase_order_item_id
    AND (TG_OP <> 'UPDATE' OR poa.id <> NEW.id);

  IF TG_OP <> 'DELETE' THEN
    v_allocated_total := v_allocated_total + NEW.allocated_quantity;
  END IF;

  IF v_allocated_total > v_ordered_quantity THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Allocated quantity (%s) exceeds ordered quantity (%s) for purchase_order_item %s',
        v_allocated_total,
        v_ordered_quantity,
        v_purchase_order_item_id
      ),
      ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_purchase_order_item_ordered_quantity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_allocated_total numeric;
BEGIN
  SELECT COALESCE(SUM(poa.allocated_quantity), 0)
  INTO v_allocated_total
  FROM public.purchase_order_item_allocations poa
  WHERE poa.purchase_order_item_id = NEW.id;

  IF NEW.ordered_quantity < v_allocated_total THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Ordered quantity (%s) cannot be lower than already allocated quantity (%s) for purchase_order_item %s',
        NEW.ordered_quantity,
        v_allocated_total,
        NEW.id
      ),
      ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_purchase_order_item_ordered_quantity
  ON public.purchase_order_items;
CREATE TRIGGER enforce_purchase_order_item_ordered_quantity
  BEFORE UPDATE OF ordered_quantity ON public.purchase_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_purchase_order_item_ordered_quantity();

DROP TRIGGER IF EXISTS enforce_purchase_order_allocation_limits_insert_update
  ON public.purchase_order_item_allocations;
CREATE TRIGGER enforce_purchase_order_allocation_limits_insert_update
  BEFORE INSERT OR UPDATE ON public.purchase_order_item_allocations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_purchase_order_allocation_limits();

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
