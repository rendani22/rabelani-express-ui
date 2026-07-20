-- ============================================================================
-- Fix the service_role bypass in create_purchase_order_with_items
--
-- The function means to let service_role through without a user context:
--
--   caller_role := current_setting('request.jwt.claim.role', true);
--   IF COALESCE(caller_role, '') <> 'service_role' THEN
--     IF caller_uid IS NULL THEN RAISE EXCEPTION 'Authentication required';
--
-- but `request.jwt.claim.role` is the LEGACY PostgREST GUC. Current PostgREST
-- exposes the token as a single `request.jwt.claims` JSON document and no
-- longer sets the per-claim GUCs, so that current_setting() returns NULL. The
-- bypass therefore never fires; auth.uid() is NULL for a service key (no `sub`
-- claim); and every service_role call dies on 'Authentication required'.
--
-- This was latent until now. Nothing called this RPC as service_role -- the
-- Global PO page calls it as a logged-in user, where auth.uid() is set and the
-- bypass is not needed. `ingest-coupa-po` is the first service_role caller (a
-- webhook has no user to authenticate as), which is what surfaced it.
--
-- THE FIX is the pattern this codebase already settled on. Its sibling
-- `update_purchase_order_with_items` reads:
--
--   caller_role := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');
--
-- `auth.role()` is Supabase's own helper and reads whichever GUC shape the
-- platform provides (it checks the legacy per-claim GUC first, then falls back
-- to `request.jwt.claims`->>'role'), so it survives both. The legacy GUC is
-- kept in the COALESCE for the same reason the sibling keeps it: it costs
-- nothing and covers an older platform.
--
-- Only that one line changes. The permission check, validation, and inserts are
-- reproduced verbatim from 20260714210000_phase2_enforce_permissions.sql so
-- this migration is a fix and not an accidental rewrite.
--
-- SECURITY: this does not widen access. It makes a bypass that was intended,
-- documented, and already live in the sibling function actually work for
-- service_role. Authenticated users still go through
-- has_permission('purchase_orders.create'); an anonymous caller (no role claim,
-- no uid) still gets 'Authentication required', because auth.role() returns
-- 'anon' for them, not 'service_role'.
-- ============================================================================

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
  -- CHANGED: was current_setting('request.jwt.claim.role', true) alone, which
  -- is NULL on current PostgREST. Matches update_purchase_order_with_items.
  caller_role := COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '');
  normalized_po_number := btrim(COALESCE(p_po_number, ''));
  normalized_details := NULLIF(btrim(COALESCE(p_details, '')), '');
  payload_items := COALESCE(p_items, '[]'::jsonb);

  IF COALESCE(caller_role, '') <> 'service_role' THEN
    IF caller_uid IS NULL THEN
      RAISE EXCEPTION 'Authentication required'
        USING DETAIL = 'No authenticated user context was found';
    END IF;

    SELECT public.has_permission('purchase_orders.create')
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
