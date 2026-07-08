-- ============================================================================
-- Notification targeting: admins get everything, others only what's theirs
--
-- The original fan-out inserted a notification for EVERY active staff member on
-- every package event (and never notified customers). This reworks the trigger
-- so a package event notifies:
--   • all active ADMIN staff                          → everything (link: /orders)
--   • the staff member who CREATED it (created_by)     → /orders
--   • the assigned DRIVER (picked_up_by)               → /orders
--   • staff who ACTED on it (status_changed_by + every
--     distinct actor in package_status_history)        → /orders
--   • the CUSTOMER/receiver + BUYERS in its company    → /my-packages
--       (receiver_profiles.auth_user_id; buyers see the whole company, runners
--        only their own — mirrors the customer_packages portal rule)
--
-- One row per recipient (deduped), so nobody is notified twice for one event.
-- Unlike the old version the acting user is NOT excluded — "staff who acted on
-- it" was explicitly requested as a recipient class.
--
-- Only the function body changes; the existing trg_notify_staff_on_package_change
-- trigger keeps pointing at it.
-- ============================================================================

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

-- Ensure signed-in users (staff and customers) can actually reach their own
-- rows. RLS already restricts them to auth.uid() = user_id; these table grants
-- make those policies effective regardless of default-privilege setup. INSERT is
-- intentionally withheld — rows are created only by the SECURITY DEFINER trigger.
grant select, update, delete on table "public"."notifications" to authenticated;
