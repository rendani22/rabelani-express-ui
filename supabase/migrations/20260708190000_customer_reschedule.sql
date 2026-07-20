-- ============================================================================
-- Customer delivery reschedule (in-transit → notified)
--
-- When a parcel is out for delivery (`in_transit`), the receiving customer may
-- request a reschedule from the portal. This is a privileged action a customer
-- otherwise can't do (they have no write access), so it runs through a
-- SECURITY DEFINER RPC that:
--   • verifies the caller is the ACTUAL receiver of the parcel (not another
--     buyer in the company) and that it is still `in_transit`
--   • flips status → `notified` and clears the driver (`picked_up_by`), so it
--     drops off the driver's app and re-enters the dispatch queue
--   • appends the reason to the INTERNAL `notes` (where warehouse looks),
--     attributed + timestamped + namespaced so it can't trip the
--     `/delivery photo/i` Delivered-vs-Collected heuristic
--   • sets a persistent `reschedule_requested` flag (never clears) that the
--     Orders list badges
--   • runs SILENTLY (suppress flag) so the status flip doesn't fire a
--     misleading "Receiver notified" notification; the change is still recorded
--     in status history, attributed to the customer (auth.uid()).
-- No cap on repeats; no "failed attempt" state — accepted trade-offs.
-- ============================================================================

ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS reschedule_requested boolean NOT NULL DEFAULT false;

-- Expose the flag + whether the viewer is the parcel's actual receiver (buyers
-- see the whole company, but only the receiver may reschedule).
CREATE OR REPLACE VIEW public.customer_packages
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.po_number,
  p.status,
  p.customer_notes,
  p.created_at,
  p.updated_at,
  -- Existing columns must keep their positions (CREATE OR REPLACE VIEW can only
  -- APPEND) — so `items` stays here and the new columns go at the end.
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'description', pi.description, 'quantity', pi.quantity)
             ORDER BY pi.created_at)
    FROM public.package_items pi
    WHERE pi.package_id = p.id
  ), '[]'::jsonb) AS items,
  p.reschedule_requested,
  EXISTS (
    SELECT 1 FROM public.receiver_profiles me
    WHERE me.auth_user_id = auth.uid() AND me.id = p.receiver_id
  ) AS is_receiver
FROM public.packages p
WHERE p.deleted_at IS NULL
  AND p.status <> 'draft'
  AND EXISTS (
    SELECT 1 FROM public.receiver_profiles me
    WHERE me.auth_user_id = auth.uid()
      AND me.role IS NOT NULL
      AND me.is_active
      AND (
        (me.role = 'runner' AND p.receiver_id = me.id)
        OR
        (me.role = 'buyer' AND p.receiver_id IN (
           SELECT r.id FROM public.receiver_profiles r
           WHERE r.company_id = me.company_id))
      )
  );

REVOKE ALL ON public.customer_packages FROM anon;
GRANT SELECT ON public.customer_packages TO authenticated;

-- ── The reschedule action ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.customer_reschedule_package(
  p_package_id uuid,
  p_reason     text DEFAULT NULL
)
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_receiver_id uuid;
  v_email       text;
  v_status      public.package_status;
  v_receiver    uuid;
  v_note        text;
BEGIN
  -- Caller must be an active customer.
  SELECT id, email INTO v_receiver_id, v_email
  FROM public.receiver_profiles
  WHERE auth_user_id = auth.uid() AND is_active = true;

  IF v_receiver_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Load the target parcel.
  SELECT status, receiver_id INTO v_status, v_receiver
  FROM public.packages
  WHERE id = p_package_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found' USING ERRCODE = 'P0002';
  END IF;

  -- Only the actual receiver of the parcel may reschedule it.
  IF v_receiver IS DISTINCT FROM v_receiver_id THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Only meaningful while it is out for delivery.
  IF v_status <> 'in_transit' THEN
    RAISE EXCEPTION 'This order is not out for delivery' USING ERRCODE = 'P0001';
  END IF;

  v_note :=
    '[Reschedule request · ' || COALESCE(v_email, 'customer') || ' · '
    || to_char(now() AT TIME ZONE 'Africa/Johannesburg', 'YYYY-MM-DD HH24:MI') || '] '
    || COALESCE(NULLIF(btrim(p_reason), ''), '(no reason given)');
  v_note := left(v_note, 600);

  -- Silent: suppress the "Receiver notified" notification for this system-style
  -- change (status history still records it, attributed to the customer).
  PERFORM set_config('app.suppress_notifications', 'on', true);

  UPDATE public.packages
  SET status               = 'notified',
      picked_up_by         = NULL,
      status_changed_by    = auth.uid(),
      reschedule_requested = true,
      notes                = CASE
                               WHEN notes IS NULL OR btrim(notes) = '' THEN v_note
                               ELSE notes || E'\n' || v_note
                             END
  WHERE id = p_package_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.customer_reschedule_package(uuid, text) TO authenticated;
