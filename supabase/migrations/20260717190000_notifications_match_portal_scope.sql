-- Scope customer notifications to what the portal actually shows.
--
-- The customer fan-out in 20260708140000 predates 20260716130000, which narrowed
-- customer_packages from "a buyer sees their whole company" to "a buyer sees the
-- end users assigned to them". The trigger kept the company-wide rule, so a buyer
-- could be notified about a package they cannot open — and the notification body
-- leaks receiver_email and reference for it.
--
-- After this, the customer recipient set is exactly the view's WHERE clause:
--   • the receiver of the package, whatever their role
--   • a buyer, only if the receiver is an end user assigned to them (buyer_id)
-- plus the view's account guards (role IS NOT NULL, is_active), so deactivated or
-- never-invited receivers stop being notified about parcels they can't see.
--
-- Staff targeting is unchanged. Only the function body changes; the existing
-- trg_notify_staff_on_package_change trigger keeps pointing at it.

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
    -- portal accounts that can see this package in customer_packages: the
    -- receiver, plus the buyer this receiver is assigned to.
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
