-- ============================================================================
-- Nightly revert: in-transit orders → notified (end of day, 20:00 SAST)
--
-- Any order still `in_transit` at the end of the operating day is returned to
-- `notified` and unassigned from its driver, so it re-enters the dispatch queue
-- the next day. Runs SILENTLY: status history still records each change (as a
-- System change — changed_by is null), but the per-order "Receiver notified"
-- notifications are suppressed so the batch doesn't spam admins/customers.
--
-- Mechanism:
--   1. notify_staff_on_package_change() gains a guard that skips when the
--      transaction-local `app.suppress_notifications` flag is set.
--   2. revert_stale_in_transit() sets that flag, then does the bulk UPDATE.
--   3. pg_cron runs it at 18:00 UTC daily (= 20:00 Africa/Johannesburg).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── 1. Notify trigger: honour the silent-batch flag ─────────────────────────
create or replace function "public"."notify_staff_on_package_change"()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_emoji       text;
  v_title       text;
  v_description text;
  v_company     uuid;
begin
  -- Only react to genuine status changes on UPDATE.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- Drafts are work-in-progress and should not notify anyone.
  if new.status = 'draft' then
    return new;
  end if;

  -- Silent system batches (e.g. the nightly in-transit revert) suppress the
  -- per-order notifications; status history is still recorded by its own trigger.
  if current_setting('app.suppress_notifications', true) in ('on', 'true', '1') then
    return new;
  end if;

  v_emoji := case new.status::text
    when 'pending'              then '📦'
    when 'notified'             then '🔔'
    when 'in_transit'           then '🚚'
    when 'ready_for_collection' then '📬'
    when 'delivered'            then '✅'
    when 'collected'            then '✅'
    when 'returned'             then '↩️'
    else '📦'
  end;

  v_title := case new.status::text
    when 'pending'              then 'New package created (' || new.reference || ')'
    when 'notified'             then 'Receiver notified (' || new.reference || ')'
    when 'in_transit'           then 'Package picked up – in transit (' || new.reference || ')'
    when 'ready_for_collection' then 'Ready for collection (' || new.reference || ')'
    when 'delivered'            then 'Package delivered (' || new.reference || ')'
    when 'collected'            then 'Package collected (' || new.reference || ')'
    when 'returned'             then 'Package canceled (' || new.reference || ')'
    else 'Package updated (' || new.reference || ')'
  end;

  v_description := case new.status::text
    when 'pending'              then 'A new package has been created for ' || new.receiver_email || '.'
    when 'notified'             then 'The receiver (' || new.receiver_email || ') has been notified.'
    when 'in_transit'           then 'A driver has picked up the package for ' || new.receiver_email || '.'
    when 'ready_for_collection' then 'The package for ' || new.receiver_email || ' has arrived at the collection point.'
    when 'delivered'            then 'Package successfully delivered to ' || new.receiver_email || '.'
    when 'collected'            then 'Package collected by ' || new.receiver_email || '.'
    when 'returned'             then 'The package for ' || new.receiver_email || ' was canceled because it has no remaining items.'
    else 'Package status updated for ' || new.receiver_email || '.'
  end;

  -- Company that owns this package (via its receiver), for buyer fan-out.
  select rp.company_id into v_company
  from public.receiver_profiles rp
  where rp.id = new.receiver_id;

  -- Recipients: one row per (user_id, href). Grouped below so each user gets a
  -- single notification even if they qualify through several routes.
  with recipients (user_id, href) as (
    -- all active admins
    select sp.user_id, '/orders?id=' || new.id::text
    from public.staff_profiles sp
    where sp.is_active = true and sp.role = 'admin'

    union
    -- creator
    select new.created_by, '/orders?id=' || new.id::text
    where new.created_by is not null

    union
    -- assigned driver
    select new.picked_up_by, '/orders?id=' || new.id::text
    where new.picked_up_by is not null

    union
    -- current actor
    select new.status_changed_by, '/orders?id=' || new.id::text
    where new.status_changed_by is not null

    union
    -- every staff member who has acted on this package
    select psh.changed_by, '/orders?id=' || new.id::text
    from public.package_status_history psh
    where psh.package_id = new.id and psh.changed_by is not null

    union
    -- the receiver + buyers in its company (portal accounts only)
    select rp.auth_user_id, '/my-packages'
    from public.receiver_profiles rp
    where rp.auth_user_id is not null
      and (
        rp.id = new.receiver_id
        or (rp.role = 'buyer' and v_company is not null and rp.company_id = v_company)
      )
  )
  insert into public.notifications
    (user_id, type, emoji, title, description, reference, package_id, href)
  select r.user_id, new.status, v_emoji, v_title, v_description, new.reference, new.id, r.href
  from (
    select user_id, min(href) as href
    from recipients
    where user_id is not null
    group by user_id
  ) r;

  return new;
end;
$function$;

-- ── 2. The revert function ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.revert_stale_in_transit()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_count integer;
BEGIN
  -- Run silently for this system batch (transaction-local; auto-resets).
  PERFORM set_config('app.suppress_notifications', 'on', true);

  UPDATE public.packages
  SET status            = 'notified',
      picked_up_by      = NULL,   -- back to awaiting dispatch
      status_changed_by = NULL    -- attribute the change to "System"
  WHERE status = 'in_transit'
    AND deleted_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.revert_stale_in_transit() TO service_role;

-- ── 3. Schedule at 18:00 UTC (20:00 SAST) daily ─────────────────────────────
-- Replace any prior job of the same name so the migration is idempotent.
DO $$
BEGIN
  PERFORM cron.unschedule('revert-stale-in-transit');
EXCEPTION WHEN OTHERS THEN
  NULL; -- no existing job
END $$;

SELECT cron.schedule(
  'revert-stale-in-transit',
  '0 18 * * *',
  $$ SELECT public.revert_stale_in_transit(); $$
);
