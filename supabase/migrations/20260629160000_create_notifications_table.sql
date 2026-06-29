-- Per-user in-app notifications.
--
-- Replaces the old "show the 10 most recent packages to everyone" behaviour
-- (which had no real read/unread state) with a proper per-recipient inbox.
-- A row is created for every active staff member whenever a package is created
-- or its status changes. Read/dismiss state lives in the row, so it survives
-- reloads and syncs across a user's devices.

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists "public"."notifications" (
  "id"          uuid not null default gen_random_uuid(),
  "user_id"     uuid not null,
  -- The package status that produced this notification (null for non-package
  -- events). Stored as the same enum the packages table uses.
  "type"        public.package_status,
  "emoji"       text not null default '📦',
  "title"       text not null,
  "description" text not null,
  "reference"   text,
  "package_id"  uuid,
  "href"        text not null default '/orders',
  "read_at"     timestamp with time zone,
  "created_at"  timestamp with time zone not null default now(),
  constraint "notifications_pkey" primary key ("id"),
  constraint "notifications_user_id_fkey"
    foreign key ("user_id") references "auth"."users" ("id") on delete cascade,
  constraint "notifications_package_id_fkey"
    foreign key ("package_id") references "public"."packages" ("id") on delete cascade
);

-- Newest-first per user (the default feed query).
create index if not exists "notifications_user_created_idx"
  on "public"."notifications" ("user_id", "created_at" desc);

-- Fast unread-count lookups.
create index if not exists "notifications_user_unread_idx"
  on "public"."notifications" ("user_id")
  where "read_at" is null;

-- Realtime DELETE/UPDATE payloads need the full old row to evaluate the
-- per-user filter and RLS on the client.
alter table "public"."notifications" replica identity full;

-- ---------------------------------------------------------------------------
-- Row Level Security — a user only ever sees / touches their own notifications.
-- INSERT is intentionally omitted: rows are created only by the SECURITY
-- DEFINER trigger below, so users cannot forge notifications.
-- ---------------------------------------------------------------------------
alter table "public"."notifications" enable row level security;

create policy "Users can read their own notifications"
  on "public"."notifications"
  as permissive
  for select
  to authenticated
  using ((auth.uid() = user_id));

create policy "Users can update their own notifications"
  on "public"."notifications"
  as permissive
  for update
  to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

create policy "Users can delete their own notifications"
  on "public"."notifications"
  as permissive
  for delete
  to authenticated
  using ((auth.uid() = user_id));

-- ---------------------------------------------------------------------------
-- Fan-out trigger: create a notification for every active staff member when a
-- package is created or changes status. The user that performed the action is
-- excluded — you do not need to be told about your own change.
-- ---------------------------------------------------------------------------
create or replace function "public"."notify_staff_on_package_change"()
  returns trigger
  language plpgsql
  security definer
  set search_path = public
as $function$
declare
  v_actor       uuid := auth.uid();
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

create trigger "trg_notify_staff_on_package_change"
  after insert or update of status on "public"."packages"
  for each row
  execute function "public"."notify_staff_on_package_change"();

-- ---------------------------------------------------------------------------
-- Realtime: publish the table so clients receive live inserts/updates/deletes.
-- The publication is managed by Supabase and already exists; guard against the
-- table already being a member so the migration is idempotent.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'notifications'
     )
  then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
