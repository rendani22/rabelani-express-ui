-- Re-link historical packages to receiver profiles by email.
--
-- 20260707130000 backfilled packages.receiver_id from receiver_email, but it
-- runs ONCE and matches only the receiver_profiles that existed at that instant.
-- Pre-portal, create-package stored receiver_email as free text and never
-- created a receiver_profiles row, and invite-customer upserts a profile by
-- email at invite time but never re-links packages. So every customer whose
-- profile was created when they were invited (most of them) has all their
-- pre-portal orders left at receiver_id = NULL — invisible to them in the
-- portal whatever their role, because customer_packages requires receiver_id:
--   * End user  → WHERE p.receiver_id = me.id
--   * Buyer     → WHERE p.receiver_id IN (their assigned end users)
-- This is why even an End user's own package history is empty, and why the
-- companion buyer_id backfill (20260721120000) has nothing to surface on its own.
--
-- Re-run the exact same case-insensitive email backfill now that those profiles
-- exist. Idempotent and non-destructive: only packages with receiver_id IS NULL
-- are touched, so already-linked rows are untouched and packages whose email
-- still matches no profile stay staff-only (the original decision (b)).

UPDATE public.packages p
SET    receiver_id = rp.id
FROM   public.receiver_profiles rp
WHERE  lower(p.receiver_email) = lower(rp.email)
  AND  p.receiver_id IS NULL;
