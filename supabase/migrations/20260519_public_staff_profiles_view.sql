-- Migration: create a read-only view exposing public staff info
-- Run this in the Supabase SQL editor or as a migration.

-- Drop if exists to make the migration repeatable in dev
DROP VIEW IF EXISTS public.public_staff_profiles;

CREATE VIEW public.public_staff_profiles AS
SELECT id, user_id, full_name, avatar_url
FROM public.staff_profiles;

-- NOTE: PostgreSQL does not support enabling RLS on views. Instead, create
-- the view (to expose only non-sensitive columns) and grant SELECT to the
-- `authenticated` role so that authenticated clients can query it. If you
-- need per-row filtering, create appropriate RLS policies on the underlying
-- `staff_profiles` table (not on the view), or expose the data via a
-- server-side function/Edge Function.

-- Grant SELECT to the Supabase "authenticated" role so logged-in clients
-- can query the view. This is intentionally permissive for the limited
-- columns exposed by the view; review it for your privacy requirements.
GRANT SELECT ON public.public_staff_profiles TO authenticated;



