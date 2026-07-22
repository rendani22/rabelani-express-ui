-- Customer invite / verification state for the staff directory.
--
-- Verification lives in auth.users (email_confirmed_at, last_sign_in_at), which
-- the browser cannot read and which receiver_profiles does not mirror. This
-- SECURITY DEFINER function is the one read path, and it returns timestamps
-- only -- no emails, no tokens, nothing that isn't already on the customer card.
--
-- email_confirmed_at IS NULL is not just a convenient proxy for "never accepted
-- the invite": it is the same predicate GoTrue itself uses in adminGenerateLink
-- to decide whether a re-invite is allowed or is a duplicate-email error. The
-- badge this drives and the auth server therefore cannot disagree.
--
-- The permission test sits in the WHERE clause on purpose. A caller without
-- customers.read gets zero rows rather than an error, so the directory degrades
-- to "no badges" instead of failing to render.

CREATE OR REPLACE FUNCTION public.customer_invite_status()
RETURNS TABLE (
  receiver_id uuid,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, u.email_confirmed_at, u.last_sign_in_at
  FROM public.receiver_profiles r
  JOIN auth.users u ON u.id = r.auth_user_id
  WHERE r.auth_user_id IS NOT NULL
    AND public.has_permission('customers.read');
$$;

COMMENT ON FUNCTION public.customer_invite_status() IS
  'Staff-only. Per-customer auth verification state: confirmed_at NULL = invite never accepted. Returns zero rows without customers.read.';

GRANT EXECUTE ON FUNCTION public.customer_invite_status() TO authenticated;
