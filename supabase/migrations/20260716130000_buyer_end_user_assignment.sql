-- Buyer → end user assignment.
--
-- Before: a Buyer saw every package belonging to any receiver in their company.
-- After:  a Buyer sees only their own packages plus the packages of the end
--         users assigned to them. Assignment is a one-to-many self-reference on
--         receiver_profiles: an end user has at most one buyer, a buyer has many
--         end users.
--
-- No backfill. buyer_id starts NULL everywhere, so on deploy every Buyer sees
-- only their own orders until staff assign end users to them. This is the
-- intended rollout, not an oversight.
--
-- Validity of an assignment (target is a buyer, in the same company, not self)
-- is enforced in the invite/edit dialog only — there is deliberately no trigger.
-- An assignment written outside that dialog is therefore not checked.

ALTER TABLE public.receiver_profiles
  ADD COLUMN IF NOT EXISTS buyer_id uuid REFERENCES public.receiver_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.receiver_profiles.buyer_id IS
  'For role = ''runner'' (End user): the buyer who may see this person''s packages. NULL = no buyer sees them.';

CREATE INDEX IF NOT EXISTS receiver_profiles_buyer_id_idx
  ON public.receiver_profiles(buyer_id);

-- Re-create the portal view with the new scope, and expose the receiver's name
-- so a Buyer can tell whose package is whose (appended last — CREATE OR REPLACE
-- only allows adding columns at the end).
CREATE OR REPLACE VIEW public.customer_packages
WITH (security_invoker = false) AS
SELECT
  p.id,
  p.po_number,
  p.status,
  p.customer_notes,
  p.created_at,
  p.updated_at,
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'description', pi.description, 'quantity', pi.quantity)
             ORDER BY pi.created_at)
    FROM public.package_items pi
    WHERE pi.package_id = p.id
  ), '[]'::jsonb) AS items,
  p.reschedule_requested,
  EXISTS (
    SELECT 1 FROM public.receiver_profiles me
    WHERE me.auth_user_id = auth.uid() AND me.id = p.receiver_id
  ) AS is_receiver,
  NULLIF(TRIM(COALESCE(rcv.name, '') || ' ' || COALESCE(rcv.surname, '')), '') AS receiver_name
FROM public.packages p
LEFT JOIN public.receiver_profiles rcv ON rcv.id = p.receiver_id
WHERE p.deleted_at IS NULL
  AND p.status <> 'draft'
  AND EXISTS (
    SELECT 1 FROM public.receiver_profiles me
    WHERE me.auth_user_id = auth.uid()
      AND me.role IS NOT NULL
      AND me.is_active
      AND (
        -- Everyone sees their own parcels, whatever their role.
        p.receiver_id = me.id
        OR
        -- A buyer additionally sees the parcels of end users assigned to them.
        -- Deactivated end users stay visible: the buyer keeps the history.
        (me.role = 'buyer' AND p.receiver_id IN (
           SELECT r.id FROM public.receiver_profiles r WHERE r.buyer_id = me.id))
      )
  );

REVOKE ALL ON public.customer_packages FROM anon;
GRANT SELECT ON public.customer_packages TO authenticated;
