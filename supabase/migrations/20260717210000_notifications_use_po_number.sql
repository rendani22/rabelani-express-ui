-- Identify notifications by PO number rather than package reference.
--
-- The PO number is what customers and staff actually quote to each other; the
-- package reference is an internal waybill. Notification titles and the token
-- rendered in the bell menu should match the number people already have.
--
-- packages.po_number is nullable and non-unique (unlike packages.reference,
-- which is NOT NULL + unique), so every use falls back to the reference:
--   • a bare `||` against a NULL po_number would make the whole title NULL and
--     violate notifications.title NOT NULL, aborting the package insert or
--     status update that fired this trigger;
--   • a package genuinely created without a PO still needs *some* identifier.
-- v_ident is that resolved identifier, and it is also what lands in
-- notifications.reference (the column the menu renders) — so that column now
-- holds "the number shown on this notification", PO-first.
--
-- Existing notification rows are left alone: they keep the reference they were
-- written with. Only the function body changes; the existing
-- trg_notify_staff_on_package_change trigger keeps pointing at it, and the
-- recipient targeting from 20260717190000 is carried over unchanged.

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
begin
  -- Only react to genuine status changes on UPDATE.
  if tg_op = 'UPDATE' and new.status is not distinct from old.status then
    return new;
  end if;

  -- Drafts are work-in-progress and should not notify anyone.
  if new.status = 'draft' then
    return new;
  end if;

  -- PO number when there is one, otherwise the waybill. NULLIF/TRIM mirrors
  -- create_package_with_items, which stores '' as NULL — but a PO written by
  -- another path could still be whitespace, and that must not surface as an
  -- empty '()' in the title.
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
  select r.user_id, new.status, v_emoji, v_title, v_description, v_ident, new.id, r.href
  from (
    select user_id, min(href) as href
    from recipients
    where user_id is not null
    group by user_id
  ) r;

  return new;
end;
$function$;
