-- Add customer (receiver), value, date and details to purchase orders.
--
-- These fields let a PO be created against a customer with a stated value,
-- an order date and free-text details, in addition to the existing line items.

alter table "public"."purchase_orders"
  add column if not exists "receiver_id" uuid,
  add column if not exists "po_value" numeric(14, 2),
  add column if not exists "po_date" date,
  add column if not exists "details" text;

alter table "public"."purchase_orders"
  drop constraint if exists "purchase_orders_receiver_id_fkey";

alter table "public"."purchase_orders"
  add constraint "purchase_orders_receiver_id_fkey"
  foreign key (receiver_id) references public.receiver_profiles(id) on delete set null
  not valid;

alter table "public"."purchase_orders"
  validate constraint "purchase_orders_receiver_id_fkey";

create index if not exists idx_purchase_orders_receiver_id
  on public.purchase_orders using btree (receiver_id);

-- Replace the atomic create RPC so it also persists the customer, value,
-- date and details. The original 2-argument signature is dropped and replaced
-- by a single function whose extra parameters default to NULL, so existing
-- callers that only pass p_po_number / p_items keep working unchanged.
drop function if exists public.create_purchase_order_with_items(text, jsonb);

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

-- Replace the atomic update RPC so it also persists the customer, value,
-- date and details alongside the PO number and line quantities. The original
-- 3-argument signature is dropped and replaced by a single function whose
-- extra parameters default to NULL, so existing callers keep working.
drop function if exists public.update_purchase_order_with_items(uuid, text, jsonb);

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

    UPDATE public.purchase_order_items poi
    SET ordered_quantity = v_ordered_quantity,
        updated_at = timezone('utc', now())
    WHERE poi.id = v_line_id
      AND poi.purchase_order_id = p_purchase_order_id;
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
