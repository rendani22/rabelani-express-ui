-- Package boxes — the physical boxes a package is packed into, and which of
-- the package's items (and how many of each) went into each one.
--
-- Drives the warehouse box labels (50 × 100 mm, Labelife D520BT): PO number,
-- "Box x of N", receiver / delivery location, packed date and the box's items.
--
-- Rules, all enforced here rather than in the client:
--   * Boxes are created / edited / removed only through the RPCs below, which
--     require orders.pack. Clients get SELECT only (via orders.read).
--   * Boxes can change only while the package is draft / pending / notified —
--     once a driver has it, the boxes are what they are. Reading (and so
--     reprinting) stays open at every status.
--   * Across all boxes, an item's packed quantity can never exceed the
--     package_items quantity. Partially-boxed packages are fine (the UI warns).
--   * A package item edit that would drop its quantity below what is already
--     boxed is refused by a trigger on package_items, so the update-package
--     edge function (service_role) is held to the same rule as everyone else.
--   * packed_at is set when the box is first saved and is never moved by later
--     edits — the label shows it as the packed date, and reprints keep it.
--   * box_number is kept contiguous (1..N) per package; deleting a box
--     renumbers the ones after it. Printed labels are not tracked, so a label
--     that says "of 2" is not flagged when a third box is added — by design.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.package_boxes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  box_number INT  NOT NULL CHECK (box_number > 0),
  packed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  packed_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Deferrable so delete_package_box can shift numbers down in one UPDATE.
  CONSTRAINT package_boxes_package_box_number_key
    UNIQUE (package_id, box_number) DEFERRABLE INITIALLY IMMEDIATE
);

COMMENT ON TABLE public.package_boxes IS
  'Physical boxes a package is packed into. Written only by save_package_box / '
  'delete_package_box. packed_at is the label''s packed date and never moves.';

CREATE TABLE IF NOT EXISTS public.package_box_items (
  box_id          UUID NOT NULL REFERENCES public.package_boxes(id) ON DELETE CASCADE,
  -- CASCADE so a hard-deleted package can take its items with it; the guard
  -- trigger below is what stops an ordinary item delete while it is boxed.
  package_item_id UUID NOT NULL REFERENCES public.package_items(id) ON DELETE CASCADE,
  quantity        INT  NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (box_id, package_item_id)
);

COMMENT ON TABLE public.package_box_items IS
  'How many of a package item are in a box. Sum per package_item_id across a '
  'package''s boxes is kept <= package_items.quantity.';

CREATE INDEX IF NOT EXISTS idx_package_boxes_package_id ON public.package_boxes (package_id);
CREATE INDEX IF NOT EXISTS idx_package_box_items_package_item_id ON public.package_box_items (package_item_id);

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (key, feature, label, description, is_sensitive, sort_order) VALUES
  ('orders.pack',         'Orders', 'Split into packs',   'Split an order''s items into packs and edit pack contents.', false, 18),
  ('orders.print_labels', 'Orders', 'Print pack labels',  'Print and reprint pack labels for packed orders.',          false, 19)
ON CONFLICT (key) DO NOTHING;

-- Admins hold both via has_permission()'s admin bypass; no row needed.
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('warehouse', 'orders.pack'), ('warehouse', 'orders.print_labels'),
  ('manager',   'orders.pack'), ('manager',   'orders.print_labels')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS — read with the order, write only through the RPCs.
--
-- orders.print_labels is checked by the UI only: printing happens in the
-- browser from rows anyone with orders.read can already see, so there is
-- nothing server-side to gate.
-- ---------------------------------------------------------------------------

ALTER TABLE public.package_boxes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_box_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Can read package boxes" ON public.package_boxes
  FOR SELECT TO authenticated USING (public.has_permission('orders.read'));

CREATE POLICY "Can read package box items" ON public.package_box_items
  FOR SELECT TO authenticated USING (public.has_permission('orders.read'));

-- No INSERT / UPDATE / DELETE policies: RLS denies direct writes; the
-- SECURITY DEFINER RPCs below are the only write path.
GRANT SELECT ON public.package_boxes, public.package_box_items TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.package_boxes, public.package_box_items FROM authenticated, anon;
REVOKE ALL ON public.package_boxes, public.package_box_items FROM anon;

-- ---------------------------------------------------------------------------
-- Shared guard: lock the package and check it can still be packed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lock_packable_package(p_package_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status     public.package_status;
  v_deleted_at TIMESTAMPTZ;
BEGIN
  -- FOR UPDATE serialises concurrent box edits on the same package, so the
  -- over-allocation check below cannot race itself.
  SELECT status, deleted_at INTO v_status, v_deleted_at
  FROM public.packages
  WHERE id = p_package_id
  FOR UPDATE;

  IF NOT FOUND OR v_deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_status NOT IN ('draft', 'pending', 'notified') THEN
    RAISE EXCEPTION 'Packs can''t be changed once an order is %', replace(v_status::text, '_', ' ')
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.lock_packable_package(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- save_package_box: create a box (p_box_id NULL) or replace a box's contents.
--
-- p_items: [{ "package_item_id": uuid, "quantity": int }, ...] — the box's
-- complete contents. Lines with quantity 0 are dropped; at least one line
-- must remain. Returns the box id.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_package_box(
  p_package_id UUID,
  p_items      JSONB,
  p_box_id     UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_box_id UUID := p_box_id;
  v_bad    RECORD;
BEGIN
  IF NOT public.has_permission('orders.pack') THEN
    RAISE EXCEPTION 'You don''t have permission to split orders into packs' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Pack items must be a list' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  PERFORM public.lock_packable_package(p_package_id);

  -- Reject malformed / negative / duplicate lines. Zero-quantity lines are
  -- dropped (that is how the UI clears an item from a box).
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS l(package_item_id UUID, quantity INT)
    WHERE l.package_item_id IS NULL OR l.quantity IS NULL OR l.quantity < 0
  ) THEN
    RAISE EXCEPTION 'Each pack line needs an item and a quantity of 0 or more'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS l(package_item_id UUID, quantity INT)
    GROUP BY l.package_item_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'An item appears twice in the same pack' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS l(package_item_id UUID, quantity INT)
    WHERE l.quantity > 0
  ) THEN
    RAISE EXCEPTION 'A pack needs at least one item' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_items) AS l(package_item_id UUID, quantity INT)
    LEFT JOIN public.package_items pi ON pi.id = l.package_item_id AND pi.package_id = p_package_id
    WHERE l.quantity > 0 AND pi.id IS NULL
  ) THEN
    RAISE EXCEPTION 'An item doesn''t belong to this order' USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_box_id IS NULL THEN
    INSERT INTO public.package_boxes (package_id, box_number, packed_by)
    VALUES (
      p_package_id,
      COALESCE((SELECT max(box_number) FROM public.package_boxes WHERE package_id = p_package_id), 0) + 1,
      auth.uid()
    )
    RETURNING id INTO v_box_id;
  ELSE
    -- packed_at deliberately untouched: it is the label's packed date.
    UPDATE public.package_boxes
    SET updated_at = now()
    WHERE id = v_box_id AND package_id = p_package_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pack not found on this order' USING ERRCODE = 'no_data_found';
    END IF;

    DELETE FROM public.package_box_items WHERE box_id = v_box_id;
  END IF;

  INSERT INTO public.package_box_items (box_id, package_item_id, quantity)
  SELECT v_box_id, l.package_item_id, l.quantity
  FROM jsonb_to_recordset(p_items) AS l(package_item_id UUID, quantity INT)
  WHERE l.quantity > 0;

  -- Over-allocation check, after the write so it sees every box's new totals.
  SELECT pi.description, pi.quantity AS ordered, sum(bi.quantity) AS boxed
    INTO v_bad
  FROM public.package_box_items bi
  JOIN public.package_boxes b   ON b.id = bi.box_id
  JOIN public.package_items pi  ON pi.id = bi.package_item_id
  WHERE b.package_id = p_package_id
  GROUP BY pi.id, pi.description, pi.quantity
  HAVING sum(bi.quantity) > pi.quantity
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Too many "%" in packs: % packed, order has %', v_bad.description, v_bad.boxed, v_bad.ordered
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN v_box_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_package_box(UUID, JSONB, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_package_box(UUID, JSONB, UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- delete_package_box: remove a box and close the gap in numbering.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_package_box(p_box_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_package_id UUID;
  v_number     INT;
BEGIN
  IF NOT public.has_permission('orders.pack') THEN
    RAISE EXCEPTION 'You don''t have permission to split orders into packs' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT package_id, box_number INTO v_package_id, v_number
  FROM public.package_boxes WHERE id = p_box_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pack not found' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public.lock_packable_package(v_package_id);

  DELETE FROM public.package_boxes WHERE id = p_box_id;

  SET CONSTRAINTS public.package_boxes_package_box_number_key DEFERRED;
  UPDATE public.package_boxes
  SET box_number = box_number - 1
  WHERE package_id = v_package_id AND box_number > v_number;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_package_box(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_package_box(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Guard on package_items: never let an item drop below what is already boxed.
--
-- Fires for every writer, including the update-package edge function running
-- as service_role, so the item editor gets the same refusal as a direct call.
-- A cascaded delete from a hard-deleted package is let through: by the time the
-- FK cascade reaches package_items the parent row is already gone.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_boxed_package_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_boxed INT;
BEGIN
  SELECT COALESCE(sum(quantity), 0) INTO v_boxed
  FROM public.package_box_items
  WHERE package_item_id = OLD.id;

  IF v_boxed = 0 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (SELECT 1 FROM public.packages WHERE id = OLD.package_id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Remove "%" from its packs before deleting it (% packed)', OLD.description, v_boxed
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.package_id IS DISTINCT FROM OLD.package_id THEN
    RAISE EXCEPTION 'Remove "%" from its packs before moving it to another order', OLD.description
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.quantity < v_boxed THEN
    RAISE EXCEPTION 'Can''t reduce "%" to %: % already packed. Remove some from a pack first.',
      OLD.description, NEW.quantity, v_boxed
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_boxed_package_item ON public.package_items;
CREATE TRIGGER guard_boxed_package_item
  BEFORE UPDATE OF quantity, package_id OR DELETE ON public.package_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_boxed_package_item();
