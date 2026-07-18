-- ============================================================================
-- Meaningful notifications, part 4: overdue + stuck detection
--
-- 'returned' and 'reschedule' exceptions fire off real events. 'overdue' and
-- 'stuck' have no triggering event — a parcel becomes overdue precisely by
-- NOT changing — so a scheduled sweep detects them and fans them out through
-- notify_package_exception (admins/managers + creator + assigned driver).
--
--   • overdue  — in_transit longer than overdue_in_transit_hours, or
--                ready_for_collection longer than overdue_ready_hours
--   • stuck    — no status change at all in stuck_days
--
-- "How long in this status" is measured from the latest package_status_history
-- row for the current status (falling back to updated_at). Thresholds live in a
-- one-row notification_settings table so admins can tune them from Settings.
-- A short per-event dedup window keeps the periodic sweep from re-alerting.
-- ============================================================================

-- ── Tunable thresholds (single row) ─────────────────────────────────────────
create table if not exists "public"."notification_settings" (
  "id"                       boolean not null default true,
  "overdue_in_transit_hours" integer not null default 24,
  "overdue_ready_hours"      integer not null default 72,
  "stuck_days"               integer not null default 5,
  "updated_at"               timestamp with time zone not null default now(),
  constraint "notification_settings_pkey" primary key ("id"),
  -- Enforce a single row: id can only ever be true.
  constraint "notification_settings_singleton" check ("id")
);

insert into "public"."notification_settings" ("id") values (true)
  on conflict ("id") do nothing;

alter table "public"."notification_settings" enable row level security;

-- Everyone signed in can read the thresholds (the sweep aside, the Settings UI
-- shows them); only admins can change them.
create policy "Signed-in users can read notification settings"
  on "public"."notification_settings"
  as permissive for select to authenticated
  using (true);

create policy "Admins can update notification settings"
  on "public"."notification_settings"
  as permissive for update to authenticated
  using (exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = (select auth.uid()) and sp.role = 'admin' and sp.is_active
  ))
  with check (exists (
    select 1 from public.staff_profiles sp
    where sp.user_id = (select auth.uid()) and sp.role = 'admin' and sp.is_active
  ));

grant select, update on table "public"."notification_settings" to authenticated;

-- ── The sweep ───────────────────────────────────────────────────────────────
create or replace function "public"."detect_overdue_and_stuck_packages"()
  returns integer
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_cfg         record;
  v_pkg         record;
  v_entered     timestamptz;
  v_last_change timestamptz;
  v_total       integer := 0;
begin
  select * into v_cfg from public.notification_settings where id = true;
  if not found then
    return 0;
  end if;

  for v_pkg in
    select p.id, p.status, p.updated_at
    from public.packages p
    where p.deleted_at is null
      and p.status in ('pending', 'notified', 'in_transit', 'ready_for_collection')
  loop
    -- When it entered its current status (fall back to updated_at).
    select max(changed_at) into v_entered
    from public.package_status_history
    where package_id = v_pkg.id and status = v_pkg.status::text;
    v_entered := coalesce(v_entered, v_pkg.updated_at);

    -- Its last movement of any kind (fall back to updated_at).
    select max(changed_at) into v_last_change
    from public.package_status_history
    where package_id = v_pkg.id;
    v_last_change := coalesce(v_last_change, v_pkg.updated_at);

    -- OVERDUE — only for the two "waiting" statuses, deduped within 24h.
    if not exists (
      select 1 from public.notifications n
      where n.package_id = v_pkg.id and n.event = 'overdue'
        and n.created_at > now() - interval '24 hours'
    ) then
      if v_pkg.status = 'in_transit'
         and v_entered < now() - make_interval(hours => v_cfg.overdue_in_transit_hours) then
        v_total := v_total + public.notify_package_exception(
          v_pkg.id, 'overdue', '⏰',
          'Overdue — still in transit',
          'This parcel has been out for delivery longer than expected and has not been delivered.'
        );
      elsif v_pkg.status = 'ready_for_collection'
         and v_entered < now() - make_interval(hours => v_cfg.overdue_ready_hours) then
        v_total := v_total + public.notify_package_exception(
          v_pkg.id, 'overdue', '⏰',
          'Overdue — awaiting collection',
          'This parcel has been waiting at the collection point longer than expected.'
        );
      end if;
    end if;

    -- STUCK — any active status with no movement in stuck_days, deduped so a
    -- still-stuck parcel re-alerts at most once every 3 days.
    if v_last_change < now() - make_interval(days => v_cfg.stuck_days)
       and not exists (
         select 1 from public.notifications n
         where n.package_id = v_pkg.id and n.event = 'stuck'
           and n.created_at > now() - interval '3 days'
       ) then
      v_total := v_total + public.notify_package_exception(
        v_pkg.id, 'stuck', '🕒',
        'No movement in ' || v_cfg.stuck_days || ' days',
        'This parcel has not changed status in a while and may need attention.'
      );
    end if;
  end loop;

  return v_total;
end;
$function$;

grant execute on function "public"."detect_overdue_and_stuck_packages"() to service_role;

-- ── Schedule every 3 hours (offset from the 18:00 nightly revert) ───────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('detect-overdue-stuck');
EXCEPTION WHEN OTHERS THEN
  NULL; -- no existing job
END $$;

SELECT cron.schedule(
  'detect-overdue-stuck',
  '15 */3 * * *',
  $$ SELECT public.detect_overdue_and_stuck_packages(); $$
);
