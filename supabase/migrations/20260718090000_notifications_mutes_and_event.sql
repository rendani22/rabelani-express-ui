-- ============================================================================
-- Meaningful notifications, part 1: event key + per-user mutes (opt-out)
--
-- Groundwork for the retargeting in the next migration. Two things:
--
--  1. notifications.event — a canonical text event key. `notifications.type` is
--     the package_status ENUM, so it can only hold package statuses; the new
--     exception events ('reschedule', 'overdue', 'stuck') don't fit it. `event`
--     carries the full vocabulary (every status text PLUS those exceptions) and
--     becomes the key user mutes are matched against. Existing rows are
--     backfilled from their status; `type` is kept as-is for the bell's
--     StatusStamp.
--
--  2. Two mute tables backing the opt-out model — everyone is subscribed to
--     their relevant events by default; a row here suppresses one of them:
--       • notification_type_mutes    — "stop notifying me about <event> at all"
--       • notification_package_mutes — "stop notifying me about this one parcel"
--     RLS scopes every row to its owner; the retargeted trigger (next migration)
--     filters candidates against both before inserting.
-- ============================================================================

-- ── 1. Canonical event key on notifications ─────────────────────────────────
alter table "public"."notifications"
  add column if not exists "event" text;

-- Backfill: existing rows are all status events, so event = the stored status.
update "public"."notifications"
  set "event" = "type"::text
  where "event" is null and "type" is not null;

-- ── 2a. Type mutes — "I don't want <event_type> notifications" ──────────────
create table if not exists "public"."notification_type_mutes" (
  "user_id"    uuid not null references "auth"."users" ("id") on delete cascade,
  "event_type" text not null,
  "created_at" timestamp with time zone not null default now(),
  constraint "notification_type_mutes_pkey" primary key ("user_id", "event_type")
);

alter table "public"."notification_type_mutes" enable row level security;

create policy "Users manage their own type mutes"
  on "public"."notification_type_mutes"
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on table "public"."notification_type_mutes" to authenticated;

-- ── 2b. Package mutes — "I don't want notifications about this parcel" ──────
create table if not exists "public"."notification_package_mutes" (
  "user_id"    uuid not null references "auth"."users" ("id") on delete cascade,
  "package_id" uuid not null references "public"."packages" ("id") on delete cascade,
  "created_at" timestamp with time zone not null default now(),
  constraint "notification_package_mutes_pkey" primary key ("user_id", "package_id")
);

alter table "public"."notification_package_mutes" enable row level security;

create policy "Users manage their own package mutes"
  on "public"."notification_package_mutes"
  as permissive for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete
  on table "public"."notification_package_mutes" to authenticated;
