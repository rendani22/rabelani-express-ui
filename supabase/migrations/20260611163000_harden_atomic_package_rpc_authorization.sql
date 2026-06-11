SET search_path = public;

CREATE OR REPLACE FUNCTION public.create_package_with_items_and_allocations(
  p_receiver_email text,
  p_notes text,
  p_created_by uuid,
  p_status text,
  p_delivery_location_id uuid,
  p_po_number text,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_po_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE(package_id uuid, package_item_ids uuid[])
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_uid uuid;
  caller_role text;
  effective_created_by uuid;
  authorized_creator_exists boolean;
  payload_items jsonb;
  payload_allocations jsonb;
  item_row jsonb;
  item_index integer;
  item_quantity numeric;
  item_quantity_text text;
  item_description text;
  item_inventory_item_id uuid;
  created_package_item_id uuid;
  inserted_item_ids uuid[] := ARRAY[]::uuid[];
  inserted_item_indexes integer[] := ARRAY[]::integer[];
  invalid_allocation_item_index integer;
  missing_po_item_ids text;
  over_allocated_po_item_ids text;
BEGIN
  caller_uid := auth.uid();
  caller_role := current_setting('request.jwt.claim.role', true);

  IF caller_role = 'service_role' THEN
    effective_created_by := p_created_by;

    IF effective_created_by IS NULL THEN
      RAISE EXCEPTION 'Missing package creator'
        USING DETAIL = 'Service role calls must provide p_created_by';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = effective_created_by
        AND sp.is_active
        AND sp.role = ANY (ARRAY['warehouse'::public.staff_role, 'admin'::public.staff_role])
    )
    INTO authorized_creator_exists;

    IF NOT authorized_creator_exists THEN
      RAISE EXCEPTION 'Only active warehouse staff or admins can create packages';
    END IF;
  ELSE
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
      RAISE EXCEPTION 'Only active warehouse staff or admins can create packages';
    END IF;

    -- Never trust caller-supplied p_created_by for authenticated RPC callers.
    effective_created_by := caller_uid;
  END IF;

  payload_items := COALESCE(p_items, '[]'::jsonb);
  payload_allocations := COALESCE(p_po_allocations, '[]'::jsonb);

  IF jsonb_typeof(payload_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid package items payload'
      USING DETAIL = 'p_items must be a JSON array';
  END IF;

  IF jsonb_typeof(payload_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order allocations payload'
      USING DETAIL = 'p_po_allocations must be a JSON array';
  END IF;

  INSERT INTO public.packages (
    receiver_email,
    notes,
    created_by,
    status,
    delivery_location_id,
    po_number
  )
  VALUES (
    p_receiver_email,
    p_notes,
    effective_created_by,
    p_status::public.package_status,
    p_delivery_location_id,
    p_po_number
  )
  RETURNING id INTO package_id;

  FOR item_row, item_index IN
    SELECT row_data, (ordinality - 1)::integer AS item_index
    FROM jsonb_array_elements(payload_items) WITH ORDINALITY AS source(row_data, ordinality)
    ORDER BY ordinality
  LOOP
    item_description := btrim(COALESCE(item_row->>'description', ''));
    item_quantity_text := btrim(COALESCE(item_row->>'quantity', ''));

    IF item_quantity_text !~ '^-?[0-9]+(\.[0-9]+)?$' THEN
      CONTINUE;
    END IF;

    item_quantity := item_quantity_text::numeric;
    IF item_description = '' OR item_quantity IS NULL OR item_quantity <= 0 THEN
      CONTINUE;
    END IF;

    item_inventory_item_id := NULLIF(btrim(COALESCE(item_row->>'inventory_item_id', '')), '')::uuid;

    INSERT INTO public.package_items (
      package_id,
      quantity,
      description,
      inventory_item_id
    )
    VALUES (
      package_id,
      item_quantity::integer,
      item_description,
      item_inventory_item_id
    )
    RETURNING id INTO created_package_item_id;

    inserted_item_ids := array_append(inserted_item_ids, created_package_item_id);
    inserted_item_indexes := array_append(inserted_item_indexes, item_index);
  END LOOP;

  IF jsonb_array_length(payload_allocations) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM (
        SELECT
          (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
          (row_data->>'item_index')::integer AS item_index,
          (row_data->>'quantity')::numeric AS quantity
        FROM jsonb_array_elements(payload_allocations) row_data
      ) allocation_rows
      WHERE allocation_rows.purchase_order_item_id IS NULL
        OR allocation_rows.item_index IS NULL
        OR allocation_rows.quantity IS NULL
        OR allocation_rows.quantity <= 0
    ) THEN
      RAISE EXCEPTION 'Invalid purchase order allocations payload'
        USING DETAIL = 'Each allocation row must include purchase_order_item_id, item_index, and quantity > 0';
    END IF;

    SELECT allocation_rows.item_index
    INTO invalid_allocation_item_index
    FROM (
      SELECT DISTINCT (row_data->>'item_index')::integer AS item_index
      FROM jsonb_array_elements(payload_allocations) row_data
    ) allocation_rows
    WHERE array_position(inserted_item_indexes, allocation_rows.item_index) IS NULL
    LIMIT 1;

    IF invalid_allocation_item_index IS NOT NULL THEN
      RAISE EXCEPTION 'Purchase order allocation references a package item that was not inserted (item_index: %)', invalid_allocation_item_index;
    END IF;

    WITH allocation_rows AS (
      SELECT
        (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
        (row_data->>'item_index')::integer AS item_index,
        (row_data->>'quantity')::numeric AS allocated_quantity
      FROM jsonb_array_elements(payload_allocations) row_data
    )
    SELECT string_agg(ar.purchase_order_item_id::text, ',')
    INTO missing_po_item_ids
    FROM (
      SELECT DISTINCT ar.purchase_order_item_id
      FROM allocation_rows ar
      LEFT JOIN public.purchase_order_items poi ON poi.id = ar.purchase_order_item_id
      WHERE poi.id IS NULL
    ) ar;

    IF missing_po_item_ids IS NOT NULL THEN
      RAISE EXCEPTION 'Purchase order item(s) not found'
        USING DETAIL = missing_po_item_ids;
    END IF;

    PERFORM 1
    FROM public.purchase_order_items poi
    WHERE poi.id IN (
      SELECT DISTINCT (row_data->>'purchase_order_item_id')::uuid
      FROM jsonb_array_elements(payload_allocations) row_data
    )
    FOR UPDATE;

    WITH allocation_rows AS (
      SELECT
        (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
        (row_data->>'item_index')::integer AS item_index,
        (row_data->>'quantity')::numeric AS allocated_quantity,
        inserted_item_ids[array_position(inserted_item_indexes, (row_data->>'item_index')::integer)] AS package_item_id
      FROM jsonb_array_elements(payload_allocations) row_data
    ),
    requested_totals AS (
      SELECT
        ar.purchase_order_item_id,
        SUM(ar.allocated_quantity) AS requested_quantity
      FROM allocation_rows ar
      GROUP BY ar.purchase_order_item_id
    ),
    remaining_totals AS (
      SELECT
        poi.id AS purchase_order_item_id,
        (poi.ordered_quantity - COALESCE(SUM(poa.allocated_quantity), 0)) AS remaining_quantity
      FROM public.purchase_order_items poi
      LEFT JOIN public.purchase_order_item_allocations poa
        ON poa.purchase_order_item_id = poi.id
      WHERE poi.id IN (SELECT purchase_order_item_id FROM requested_totals)
      GROUP BY poi.id, poi.ordered_quantity
    )
    SELECT string_agg(rt.purchase_order_item_id::text, ',')
    INTO over_allocated_po_item_ids
    FROM requested_totals rt
    JOIN remaining_totals rem ON rem.purchase_order_item_id = rt.purchase_order_item_id
    WHERE rt.requested_quantity > rem.remaining_quantity;

    IF over_allocated_po_item_ids IS NOT NULL THEN
      RAISE EXCEPTION 'Selected quantity exceeds remaining purchase order quantity'
        USING DETAIL = over_allocated_po_item_ids;
    END IF;

    INSERT INTO public.purchase_order_item_allocations (
      purchase_order_item_id,
      package_item_id,
      allocated_quantity
    )
    SELECT
      (row_data->>'purchase_order_item_id')::uuid,
      inserted_item_ids[array_position(inserted_item_indexes, (row_data->>'item_index')::integer)],
      (row_data->>'quantity')::numeric
    FROM jsonb_array_elements(payload_allocations) row_data;
  END IF;

  package_item_ids := inserted_item_ids;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_package_with_items_and_allocations(text, text, uuid, text, uuid, text, jsonb, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_package_with_items_and_allocations(text, text, uuid, text, uuid, text, jsonb, jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_package_with_items_and_allocations(text, text, uuid, text, uuid, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_package_with_items_and_allocations(text, text, uuid, text, uuid, text, jsonb, jsonb) TO service_role;

-- Restrict internal helper RPC exposure.
REVOKE EXECUTE ON FUNCTION public.allocate_purchase_order_item_allocations(jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION public.allocate_purchase_order_item_allocations(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_purchase_order_item_allocations(jsonb) TO service_role;
