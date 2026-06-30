-- Restrict `packages` SELECT to active staff. See RLS-AUDIT.md (Finding 1).
--
-- Before: a world-readable catch-all (`USING (true)`) let ANY authenticated
-- account read every package row, including PII (receiver_email, po_number,
-- notes) and — via delivery_location_id — addresses.
--
-- After: only an active `staff_profile` (driver / collection / warehouse / admin)
-- can read packages. Service-role jobs bypass RLS and are unaffected.
--
-- ⚠️ DEPLOYMENT ASSUMPTION: every legitimate reader of `packages` is an active
-- staff member. If you have a NON-staff consumer (e.g. a public package-tracking
-- page backed by a user JWT), give it its own scoped policy BEFORE applying this,
-- and test in staging — dropping the catch-all will otherwise remove its access.

-- New staff-scoped read policy (covers all roles via is_active staff_profile).
DROP POLICY IF EXISTS "Active staff can view packages" ON public.packages;
CREATE POLICY "Active staff can view packages"
  ON public.packages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff_profiles sp
      WHERE sp.user_id = auth.uid()
        AND sp.is_active = true
    )
  );

-- Remove the world-readable catch-all.
DROP POLICY IF EXISTS "Authenticated users can view packages" ON public.packages;

-- The per-role read policies are now redundant subsets of the policy above.
-- Left in place (harmless — permissive policies are OR-ed); uncomment to tidy up
-- once the new policy is confirmed in staging.
-- DROP POLICY IF EXISTS "Drivers can view packages" ON public.packages;
-- DROP POLICY IF EXISTS "Collection staff can view packages" ON public.packages;
