SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_purchase_order_with_items(
  p_po_number text,
  p_items jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(purchase_order_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid;
  caller_role text;
  payload_items jsonb;
  normalized_po_number text;
  authorized_creator_exists boolean;
BEGIN
  caller_uid := auth.uid();
  caller_role := current_setting('request.jwt.claim.role', true);
  normalized_po_number := btrim(COALESCE(p_po_number, ''));
  payload_items := COALESCE(p_items, '[]'::jsonb);

  IF COALESCE(caller_role, '') <> 'service_role' THEN
    IF caller_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING DETAIL = 'No authenticated user context was found';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = caller_uid
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
    INTO authorized_creator_exists;

    IF NOT authorized_creator_exists THEN
      RAISE EXCEPTION 'Only active warehouse staff or admins can create purchase orders';
    END IF;
  END IF;

  IF normalized_po_number = '' THEN
    RAISE EXCEPTION 'PO number is required';
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

  INSERT INTO public.purchase_orders (po_number, status)
  VALUES (normalized_po_number, 'draft')
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
$$;

REVOKE ALL ON FUNCTION public.create_purchase_order_with_items(text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_purchase_order_with_items(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_items(text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_items(text, jsonb) TO service_role;
