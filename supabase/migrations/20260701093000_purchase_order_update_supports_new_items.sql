-- Allow the atomic PO update RPC to ADD new line items in addition to updating
-- quantities on existing lines.
--
-- A row in p_items now identifies EITHER an existing line (via
-- purchase_order_item_id) or a brand-new line (via inventory_item_id, with no
-- purchase_order_item_id). ordered_quantity remains required and must be > 0
-- for every row. The function signature is unchanged, so existing callers keep
-- working without modification.

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
