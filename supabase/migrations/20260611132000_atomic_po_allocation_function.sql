SET search_path = public;

CREATE OR REPLACE FUNCTION public.allocate_purchase_order_item_allocations(
  p_allocations jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  missing_po_item_ids text;
  over_allocated_po_item_ids text;
BEGIN
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    RAISE EXCEPTION 'Invalid purchase order allocations payload'
      USING DETAIL = 'p_allocations must be a JSON array';
  END IF;

  IF jsonb_array_length(p_allocations) = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT
        (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
        (row_data->>'package_item_id')::uuid AS package_item_id,
        (row_data->>'allocated_quantity')::numeric AS allocated_quantity
      FROM jsonb_array_elements(p_allocations) row_data
    ) allocation_rows
    WHERE allocation_rows.purchase_order_item_id IS NULL
      OR allocation_rows.package_item_id IS NULL
      OR allocation_rows.allocated_quantity IS NULL
      OR allocation_rows.allocated_quantity <= 0
  ) THEN
    RAISE EXCEPTION 'Invalid purchase order allocations payload'
      USING DETAIL = 'Each allocation row must include purchase_order_item_id, package_item_id, and allocated_quantity > 0';
  END IF;

  WITH allocation_rows AS (
    SELECT
      (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
      (row_data->>'package_item_id')::uuid AS package_item_id,
      (row_data->>'allocated_quantity')::numeric AS allocated_quantity
    FROM jsonb_array_elements(p_allocations) row_data
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
    FROM jsonb_array_elements(p_allocations) row_data
  )
  FOR UPDATE;

  WITH allocation_rows AS (
    SELECT
      (row_data->>'purchase_order_item_id')::uuid AS purchase_order_item_id,
      (row_data->>'package_item_id')::uuid AS package_item_id,
      (row_data->>'allocated_quantity')::numeric AS allocated_quantity
    FROM jsonb_array_elements(p_allocations) row_data
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
    (row_data->>'package_item_id')::uuid,
    (row_data->>'allocated_quantity')::numeric
  FROM jsonb_array_elements(p_allocations) row_data;
END;
$$;

REVOKE ALL ON FUNCTION public.allocate_purchase_order_item_allocations(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_purchase_order_item_allocations(jsonb) TO service_role;
