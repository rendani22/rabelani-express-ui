-- ============================================================================
-- Meaningful notifications, part 2: retarget the fan-out
--
-- Replaces the "every admin hears about everything, and everyone who ever
-- touched a parcel hears about it forever" model with a layered one:
--
--   • Involvement (any role) — the parcel's CREATOR, its CURRENTLY-assigned
--     driver, and the person who JUST made this change. The permanent
--     "every historical actor" trail is dropped: acting once no longer
--     subscribes you for life.
--   • Role relevance (across all parcels) — event types that match the job:
--       warehouse  → created (pending) + ready_for_collection
--       collection → ready_for_collection + collected
--       admin/manager → EXCEPTIONS ONLY (here: 'returned'); routine flow is
--         handled for them through involvement, not a firehose.
--       driver/staff/viewer → nothing broad (driver hears its own parcels via
--         involvement; staff/viewer have no cross-parcel feed).
--   • Customers — unchanged, still portal-scoped (receiver + assigned buyer).
--   • Minus mutes — a candidate is dropped if they muted this event type or
--     this parcel (notification_type_mutes / notification_package_mutes).
--
-- Also introduces notify_package_exception(), a reusable fan-out for the
-- non-status exception events (reschedule / overdue / stuck) added in the
-- following migrations. It is owner-only (no authenticated/anon EXECUTE) so it
-- can't be used to spam staff; the SECURITY DEFINER callers reach it as owner.
--
-- Only function bodies change; the trg_notify_staff_on_package_change trigger
-- keeps pointing at notify_staff_on_package_change.
-- ============================================================================

-- ── Reusable exception fan-out ──────────────────────────────────────────────
-- Notifies the oversight tier (active admins + managers) plus the parcel's
-- creator and currently-assigned driver, honouring both mute tables. Returns
-- the number of notifications inserted. Callers own dedup/rate-limiting.
create or replace function "public"."notify_package_exception"(
  p_package_id uuid,
  p_event      text,
  p_emoji      text,
  p_title      text,
  p_description text
) returns integer
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_pkg   record;
  v_ident text;
  v_count integer;
begin
  select p.id, p.reference, p.po_number, p.receiver_email, p.created_by, p.picked_up_by
    into v_pkg
  from public.packages p
  where p.id = p_package_id and p.deleted_at is null;

  if not found then
    return 0;
  end if;

  v_ident := coalesce(nullif(trim(v_pkg.po_number), ''), v_pkg.reference);

  with candidates (user_id) as (
    -- oversight tier: active admins + managers
    select sp.user_id
    from public.staff_profiles sp
    where sp.is_active = true and sp.role in ('admin', 'manager')

    union
    select v_pkg.created_by where v_pkg.created_by is not null

    union
    select v_pkg.picked_up_by where v_pkg.picked_up_by is not null
  )
  insert into public.notifications
    (user_id, type, event, emoji, title, description, reference, package_id, href)
  select c.user_id, null, p_event, p_emoji, p_title, p_description,
         v_ident, v_pkg.id, '/orders?id=' || v_pkg.id::text
  from (
    select distinct user_id
    from candidates
    where user_id is not null
      and not exists (
        select 1 from public.notification_type_mutes tm
        where tm.user_id = candidates.user_id and tm.event_type = p_event
      )
      and not exists (
        select 1 from public.notification_package_mutes pm
        where pm.user_id = candidates.user_id and pm.package_id = v_pkg.id
      )
  ) c;

  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

-- Owner-only: strip the default PUBLIC execute so customers can't call it
-- directly. The SECURITY DEFINER callers (reschedule RPC, overdue/stuck sweep)
-- run as the owner and reach it regardless.
revoke all on function "public"."notify_package_exception"(uuid, text, text, text, text) from public;

-- ── Retargeted status-change fan-out ────────────────────────────────────────
create or replace function "public"."notify_staff_on_package_change"()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_emoji       text;
  v_ident       text;
  v_title       text;
  v_description text;
  v_href        text;
  v_event       text;
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

  v_event := new.status::text;
  v_href  := '/orders?id=' || new.id::text;

  -- PO number when there is one, otherwise the waybill (see 20260717210000).
  v_ident := coalesce(nullif(trim(new.po_number), ''), new.reference);

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
    when 'pending'              then 'New package created (' || v_ident || ')'
    when 'notified'             then 'Receiver notified (' || v_ident || ')'
    when 'in_transit'           then 'Package picked up – in transit (' || v_ident || ')'
    when 'ready_for_collection' then 'Ready for collection (' || v_ident || ')'
    when 'delivered'            then 'Package delivered (' || v_ident || ')'
    when 'collected'            then 'Package collected (' || v_ident || ')'
    when 'returned'             then 'Package canceled (' || v_ident || ')'
    else 'Package updated (' || v_ident || ')'
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

  -- Candidate recipients: one row per (user_id, href). Filtered against mutes
  -- and grouped so each user gets a single notification per event.
  with candidates (user_id, href) as (
    -- Involvement (any role): creator, currently-assigned driver, current actor.
    select new.created_by, v_href where new.created_by is not null
    union
    select new.picked_up_by, v_href where new.picked_up_by is not null
    union
    select new.status_changed_by, v_href where new.status_changed_by is not null

    union
    -- Role relevance across all packages (admins/managers = exceptions only).
    select sp.user_id, v_href
    from public.staff_profiles sp
    where sp.is_active = true
      and (
            (sp.role in ('admin', 'manager') and new.status = 'returned')
         or (sp.role = 'warehouse'  and new.status in ('pending', 'ready_for_collection'))
         or (sp.role = 'collection' and new.status in ('ready_for_collection', 'collected'))
      )

    union
    -- Customers: portal accounts that can see this package in customer_packages
    -- (the receiver, plus the buyer this receiver is assigned to). Unchanged.
    select rp.auth_user_id, '/my-packages'
    from public.receiver_profiles rp
    where rp.auth_user_id is not null
      and rp.role is not null
      and rp.is_active
      and (
        rp.id = new.receiver_id
        or (
          rp.role = 'buyer'
          and exists (
            select 1
            from public.receiver_profiles r
            where r.id = new.receiver_id
              and r.buyer_id = rp.id
          )
        )
      )
  )
  insert into public.notifications
    (user_id, type, event, emoji, title, description, reference, package_id, href)
  select r.user_id, new.status, v_event, v_emoji, v_title, v_description, v_ident, new.id, r.href
  from (
    select user_id, min(href) as href
    from candidates
    where user_id is not null
      and not exists (
        select 1 from public.notification_type_mutes tm
        where tm.user_id = candidates.user_id and tm.event_type = v_event
      )
      and not exists (
        select 1 from public.notification_package_mutes pm
        where pm.user_id = candidates.user_id and pm.package_id = new.id
      )
    group by user_id
  ) r;

  return new;
end;
$function$;
