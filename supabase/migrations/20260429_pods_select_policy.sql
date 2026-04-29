-- ============================================================================
-- POD read access for the dashboard UI
-- ----------------------------------------------------------------------------
-- The proof-of-delivery rows are written by the `update-package` edge
-- function via the service-role admin client, so writes always succeed.
-- However the dashboard ("View POD Document" modal) reads `public.pods`
-- directly using the caller's session, which means RLS applies.
--
-- Without an explicit SELECT policy the query silently returns zero rows
-- and the UI shows "No proof-of-delivery record found for this package."
--
-- This migration adds a SELECT policy that mirrors the read access already
-- granted on `public.packages` for staff users (admin / collection /
-- warehouse / driver). All ALTERs use `IF NOT EXISTS` / `DROP IF EXISTS`
-- so it is safe to re-run.
-- ============================================================================

-- Make sure RLS is on (no-op if already enabled).
ALTER TABLE public.pods ENABLE ROW LEVEL SECURITY;

-- Drop the previous version of the policy (if it exists) so this migration
-- can be re-applied after edits.
DROP POLICY IF EXISTS "Staff can read PODs" ON public.pods;

-- Allow any authenticated user with a staff_profiles row in one of the
-- recognised staff roles to read POD records. Adjust the role list to
-- match your deployment if it differs.
CREATE POLICY "Staff can read PODs"
  ON public.pods
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.role IN ('admin', 'collection', 'warehouse', 'driver')
    )
  );

COMMENT ON POLICY "Staff can read PODs" ON public.pods IS
  'Allows the dashboard UI to render the proof-of-delivery document for delivered/collected packages.';

