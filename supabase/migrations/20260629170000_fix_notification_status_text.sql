-- Fix: notify_staff_on_package_change referenced a 'delivered' enum literal,
-- but the public.package_status enum has no 'delivered' value. Casting the
-- string literal to the enum raised:
--   invalid input value for enum package_status: "delivered"
-- at trigger runtime, which broke every package insert / status change.
--
-- Compare on new.status::text against plain text literals instead, so no enum
-- validation occurs and any unrecognised status simply falls through to the
-- default branch. Safe to run repeatedly (CREATE OR REPLACE).

create or replace function "public"."notify_staff_on_package_change"()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_actor       uuid := auth.uid();
  v_status      text := new.status::text;
  v_emoji       text;
  v_title       text;
  v_description text;
begin
  -- Only react to genuine status changes on UPDATE.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- Drafts are work-in-progress and should not notify anyone.
  if v_status = 'draft' then
    return new;
  end if;

  v_emoji := case v_status
    when 'pending'              then '📦'
    when 'notified'             then '🔔'
    when 'in_transit'           then '🚚'
    when 'ready_for_collection' then '📬'
    when 'delivered'            then '✅'
    when 'collected'            then '✅'
    when 'returned'             then '↩️'
    else '📦'
  end;

  v_title := case v_status
    when 'pending'              then 'New package created (' || new.reference || ')'
    when 'notified'             then 'Receiver notified (' || new.reference || ')'
    when 'in_transit'           then 'Package picked up – in transit (' || new.reference || ')'
    when 'ready_for_collection' then 'Ready for collection (' || new.reference || ')'
    when 'delivered'            then 'Package delivered (' || new.reference || ')'
    when 'collected'            then 'Package collected (' || new.reference || ')'
    when 'returned'             then 'Package canceled (' || new.reference || ')'
    else 'Package updated (' || new.reference || ')'
  end;

  v_description := case v_status
    when 'pending'              then 'A new package has been created for ' || new.receiver_email || '.'
    when 'notified'             then 'The receiver (' || new.receiver_email || ') has been notified.'
    when 'in_transit'           then 'A driver has picked up the package for ' || new.receiver_email || '.'
    when 'ready_for_collection' then 'The package for ' || new.receiver_email || ' has arrived at the collection point.'
    when 'delivered'            then 'Package successfully delivered to ' || new.receiver_email || '.'
    when 'collected'            then 'Package collected by ' || new.receiver_email || '.'
    when 'returned'             then 'The package for ' || new.receiver_email || ' was canceled because it has no remaining items.'
    else 'Package status updated for ' || new.receiver_email || '.'
  end;

  insert into public.notifications
    (user_id, type, emoji, title, description, reference, package_id, href)
  select
    sp.user_id, new.status, v_emoji, v_title, v_description, new.reference, new.id, '/orders'
  from public.staff_profiles sp
  where sp.is_active = true
    and (v_actor is null or sp.user_id <> v_actor);

  return new;
end;
$function$;
