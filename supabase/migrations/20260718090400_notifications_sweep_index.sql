-- ============================================================================
-- Index supporting the overdue/stuck sweep's dedup lookups.
--
-- detect_overdue_and_stuck_packages() checks, per candidate parcel, whether a
-- recent notification of a given event already exists:
--   where package_id = $1 and event = $2 and created_at > now() - interval '…'
-- and notify_package_exception writes rows keyed the same way. The existing
-- indexes are (user_id, created_at) and a partial (user_id) — neither serves a
-- package_id + event lookup, so this adds a composite btree for it.
-- ============================================================================

create index if not exists "notifications_package_event_idx"
  on "public"."notifications" ("package_id", "event", "created_at" desc);
