-- Backfill buyer_id so existing customers regain their historical orders.
--
-- 20260716130000_buyer_end_user_assignment narrowed a Buyer's portal scope from
-- "every package under my company" (the original customer-portal design) to
-- "my own packages + the end users assigned to me" — where an assignment is a
-- receiver_profiles.buyer_id pointing at the Buyer. It shipped WITH NO BACKFILL,
-- so on deploy every buyer_id was NULL and every Buyer instantly lost sight of
-- all company orders not placed under their own email — including the entire
-- pre-portal history. That is the "customers can't see their old orders" bug.
--
-- We keep the assignment model but seed it from company membership: for every
-- company that has EXACTLY ONE active Buyer, assign every other (non-buyer)
-- receiver in that company that has no buyer yet to that Buyer. Their packages
-- (linked to receiver_id by the 20260707130000 email backfill) then reappear in
-- the Buyer's portal via customer_packages.
--
-- Companies with zero or with multiple active Buyers are left untouched: there
-- is no unambiguous Buyer to pick, so staff assign those by hand (the Customers
-- page already flags end users with no buyer). Multi-buyer companies are logged
-- below so they aren't silently skipped.
--
-- Idempotent and non-destructive: only rows with buyer_id IS NULL are written,
-- so re-running this migration — or a later manual (re)assignment — is
-- preserved. Only role='buyer' receivers are excluded as targets, matching the
-- column's documented meaning (buyer_id is for end users / uninvited receivers).

WITH sole_buyer AS (
  -- Companies whose single active Buyer is unambiguous.
  SELECT company_id, min(id) AS buyer_id
  FROM   public.receiver_profiles
  WHERE  role = 'buyer' AND is_active AND company_id IS NOT NULL
  GROUP  BY company_id
  HAVING count(*) = 1
)
UPDATE public.receiver_profiles r
SET    buyer_id = sb.buyer_id
FROM   sole_buyer sb
WHERE  r.company_id = sb.company_id
  AND  r.id <> sb.buyer_id            -- never assign the Buyer to themselves
  AND  r.role IS DISTINCT FROM 'buyer' -- only end users / uninvited receivers
  AND  r.buyer_id IS NULL;            -- preserve any existing/manual assignment

-- Surface companies we could not disambiguate so their history isn't silently
-- left unassigned — staff must pick a Buyer for these end users by hand.
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM (
    SELECT company_id
    FROM   public.receiver_profiles
    WHERE  role = 'buyer' AND is_active AND company_id IS NOT NULL
    GROUP  BY company_id
    HAVING count(*) > 1
  ) multi;
  IF n > 0 THEN
    RAISE NOTICE 'buyer_id backfill: % company(ies) have multiple active buyers; their end users were left unassigned for manual assignment.', n;
  END IF;
END $$;
