-- ============================================================================
-- Meaningful notifications, part 3: reschedule is an exception
--
-- customer_reschedule_package still runs the status flip SILENTLY (so it never
-- fires a misleading "Receiver notified"), but a customer-initiated reschedule
-- is exactly the kind of exception the oversight tier wants to see. After the
-- flip we fan out a dedicated 'reschedule' exception to admins/managers + the
-- parcel's creator via notify_package_exception (which honours mutes).
--
-- notify_package_exception reads the parcel AFTER the update, where picked_up_by
-- has been cleared — so the just-dropped driver is correctly not notified.
--
-- Body is otherwise identical to 20260708190000; only the fan-out call is added.
-- ============================================================================

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

  -- Fan out the reschedule as an exception (bypasses the suppressed trigger;
  -- this is a direct insert, not a status-change notification).
  PERFORM public.notify_package_exception(
    p_package_id,
    'reschedule',
    '📅',
    'Reschedule requested',
    'The receiver (' || COALESCE(v_email, 'customer') || ') requested a new delivery time.'
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.customer_reschedule_package(uuid, text) TO authenticated;
