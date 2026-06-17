SET search_path = public;

-- Expected to fail:
-- 1) duplicate po_number update
-- 2) updating completed PO
-- 3) ordered_quantity < allocated/used quantity
CREATE OR REPLACE FUNCTION public.update_purchase_order_with_items(
  p_purchase_order_id uuid,
  p_po_number text,
  p_items jsonb
)
RETURNS TABLE(purchase_order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid;
  caller_role text;
  authorized_updater_exists boolean;
  v_status text;
  v_normalized_po_number text;
  v_items jsonb;
  v_item jsonb;
  v_line_id uuid;
  v_ordered_quantity numeric;
  v_allocated_floor numeric;
  v_line_belongs_to_po boolean;
BEGIN
  caller_uid := auth.uid();
  caller_role := current_setting('request.jwt.claim.role', true);

  IF COALESCE(caller_role, '') <> 'service_role' THEN
    IF COALESCE(caller_role, '') <> 'authenticated' OR caller_uid IS NULL THEN
      RAISE EXCEPTION 'Unauthorized to update purchase orders'
        USING ERRCODE = '42501',
              DETAIL = 'Caller must be an authenticated user or service_role';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = caller_uid
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
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

  v_items := COALESCE(p_items, '[]'::jsonb);
  IF jsonb_typeof(v_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'p_items must be a JSON array';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        NULLIF(btrim(COALESCE(row_data->>'purchase_order_item_id', '')), '') AS purchase_order_item_id_text,
        NULLIF(btrim(COALESCE(row_data->>'ordered_quantity', '')), '') AS ordered_quantity_text
      FROM jsonb_array_elements(v_items) row_data
    ) item_rows
    WHERE item_rows.purchase_order_item_id_text IS NULL
      OR item_rows.purchase_order_item_id_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      OR item_rows.ordered_quantity_text IS NULL
      OR item_rows.ordered_quantity_text !~ '^-?[0-9]+(\.[0-9]+)?$'
      OR item_rows.ordered_quantity_text::numeric <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order items payload'
      USING DETAIL = 'Each item row must include purchase_order_item_id and ordered_quantity > 0';
  END IF;

  SELECT po.status
  INTO v_status
  FROM public.purchase_orders po
  WHERE po.id = p_purchase_order_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Purchase order not found';
  END IF;

  IF v_status = 'completed' THEN
    RAISE EXCEPTION 'Completed purchase orders cannot be edited';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.purchase_orders po
    WHERE po.po_number = v_normalized_po_number
      AND po.id <> p_purchase_order_id
  ) THEN
    RAISE EXCEPTION 'A purchase order with this number already exists';
  END IF;

  PERFORM 1
  FROM (
    SELECT DISTINCT (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id
    FROM jsonb_array_elements(v_items) row_data
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
    v_line_id := (v_item->>'purchase_order_item_id')::uuid;
    v_ordered_quantity := (v_item->>'ordered_quantity')::numeric;

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

    UPDATE public.purchase_order_items
    SET ordered_quantity = v_ordered_quantity,
        updated_at = timezone('utc', now())
    WHERE id = v_line_id
      AND purchase_order_id = p_purchase_order_id;
  END LOOP;

  UPDATE public.purchase_orders
  SET po_number = v_normalized_po_number,
      updated_at = timezone('utc', now())
  WHERE id = p_purchase_order_id;

  purchase_order_id := p_purchase_order_id;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.update_purchase_order_with_items(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.update_purchase_order_with_items(uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_with_items(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_with_items(uuid, text, jsonb) TO service_role;
