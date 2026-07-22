-- Follow-up hardening for customer_invite_status(): strip the default PUBLIC grant.
--
-- CREATE FUNCTION grants EXECUTE to PUBLIC unless told otherwise, and `anon` is
-- a member of PUBLIC. 20260722120000_customer_invite_status.sql only added
-- `GRANT ... TO authenticated`, so it never revoked the implicit PUBLIC grant —
-- an unauthenticated PostgREST caller could still invoke the function. It
-- returns zero rows today (auth.uid() is null, so has_permission('customers.read')
-- is false), so there is no live data leak, but the access shape is wrong.
--
-- 20260714190000_phase0_access_control_hardening.sql already revoked PUBLIC/anon
-- from the equivalent dashboard RPCs in one pass (see its lines 807-812); that
-- pass was a one-shot sweep over the functions that existed at the time, not a
-- standing default, so a function added afterwards — this one — silently opted
-- back into the PUBLIC grant. This migration closes that gap for
-- customer_invite_status() specifically.

REVOKE ALL ON FUNCTION public.customer_invite_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_invite_status() TO authenticated;
