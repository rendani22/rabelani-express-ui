-- Attribute package status changes to the acting user.
--
-- Problem: package_status_history.changed_by was always NULL, so the Activity
-- timeline attributed every event to "System". The record_package_status_change
-- trigger populated changed_by from auth.uid(), but all package mutations run
-- through edge functions using the service_role key, where auth.uid() is NULL.
--
-- Fix: add a packages.status_changed_by column that the edge functions set to
-- the calling user, and have the trigger read it (falling back to auth.uid()
-- for any path that still runs under a user JWT, e.g. RPCs like restore_package).

-- 1. Column to carry the acting user into the trigger.
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS status_changed_by uuid;

ALTER TABLE public.packages
  DROP CONSTRAINT IF EXISTS packages_status_changed_by_fkey;

ALTER TABLE public.packages
  ADD CONSTRAINT packages_status_changed_by_fkey
  FOREIGN KEY (status_changed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Trigger now prefers the explicit column, falling back to auth.uid().
CREATE OR REPLACE FUNCTION public.record_package_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
begin
  if tg_op = 'INSERT' then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, coalesce(new.status_changed_by, auth.uid()));
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, coalesce(new.status_changed_by, auth.uid()));
  end if;

  return new;
end;
$function$
;

-- 3. Attribute the initial status on atomic package creation.
--    Body reproduced verbatim from
--    20260621_add_create_package_with_items_and_allocations.sql, with
--    status_changed_by added to the packages INSERT.
CREATE OR REPLACE FUNCTION public.create_package_with_items_and_allocations(
  p_receiver_email text,
  p_created_by uuid,
  p_notes text DEFAULT NULL,
  p_status public.package_status DEFAULT 'pending'::public.package_status,
  p_delivery_location_id uuid DEFAULT NULL,
  p_po_number text DEFAULT NULL,
  p_items jsonb DEFAULT '[]'::jsonb,
  p_po_allocations jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_package_id uuid;
  v_package_reference text;
  v_package_item_ids uuid[];
  v_item jsonb;
  v_new_item_id uuid;
  v_allocation jsonb;
  v_allocation_item_index integer;
  v_allocation_quantity numeric;
  v_allocation_po_item_id uuid;
  v_item_count integer;
BEGIN
  -- Validate inputs
  IF p_receiver_email IS NULL OR p_receiver_email = '' THEN
    RAISE EXCEPTION 'receiver_email is required' USING ERRCODE = 'P0001';
  END IF;

  IF p_created_by IS NULL THEN
    RAISE EXCEPTION 'created_by is required' USING ERRCODE = 'P0001';
  END IF;

  -- Create the package
  v_package_reference := public.generate_package_reference();

  INSERT INTO public.packages (
    reference,
    receiver_email,
    notes,
    status,
    created_by,
    status_changed_by,
    delivery_location_id,
    po_number
  )
  VALUES (
    v_package_reference,
    LOWER(TRIM(p_receiver_email)),
    NULLIF(TRIM(COALESCE(p_notes, '')), ''),
    p_status,
    p_created_by,
    p_created_by,
    p_delivery_location_id,
    NULLIF(TRIM(COALESCE(p_po_number, '')), '')
  )
  RETURNING id INTO v_package_id;

  -- Initialize array to track created item IDs
  v_package_item_ids := ARRAY[]::uuid[];

  -- Process items if provided
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    FOR v_item IN SELECT jsonb_array_elements(p_items)
    LOOP
      INSERT INTO public.package_items (
        package_id,
        quantity,
        description,
        inventory_item_id
      )
      VALUES (
        v_package_id,
        COALESCE((v_item->>'quantity')::integer, 1),
        COALESCE(v_item->>'description', ''),
        CASE
          WHEN v_item->>'inventory_item_id' IS NOT NULL
            AND v_item->>'inventory_item_id' != ''
            AND v_item->>'inventory_item_id' != 'null'
          THEN (v_item->>'inventory_item_id')::uuid
          ELSE NULL
        END
      )
      RETURNING id INTO v_new_item_id;

      -- Add to tracking array
      v_package_item_ids := array_append(v_package_item_ids, v_new_item_id);
    END LOOP;
  END IF;

  -- Process PO allocations if provided
  IF p_po_allocations IS NOT NULL AND jsonb_array_length(p_po_allocations) > 0 THEN
    FOR v_allocation IN SELECT jsonb_array_elements(p_po_allocations)
    LOOP
      v_allocation_item_index := COALESCE((v_allocation->>'item_index')::integer, -1);
      v_allocation_quantity := COALESCE((v_allocation->>'quantity')::numeric, 0);
      v_allocation_po_item_id := COALESCE((v_allocation->>'purchase_order_item_id')::uuid, NULL);

      -- Validate allocation item_index is within bounds
      IF v_allocation_item_index < 0 OR v_allocation_item_index >= array_length(v_package_item_ids, 1) THEN
        RAISE EXCEPTION 'allocation item_index % is out of bounds', v_allocation_item_index
          USING ERRCODE = 'P0001';
      END IF;

      -- Validate quantity is positive
      IF v_allocation_quantity <= 0 THEN
        RAISE EXCEPTION 'allocation quantity must be greater than 0'
          USING ERRCODE = 'P0001';
      END IF;

      -- Insert allocation
      INSERT INTO public.purchase_order_item_allocations (
        purchase_order_item_id,
        package_item_id,
        allocated_quantity
      )
      VALUES (
        v_allocation_po_item_id,
        v_package_item_ids[v_allocation_item_index + 1],
        v_allocation_quantity
      );
    END LOOP;
  END IF;

  -- Return success response with created IDs
  RETURN jsonb_build_object(
    'package_id', v_package_id,
    'package_item_ids', v_package_item_ids
  );
END;
$function$;
