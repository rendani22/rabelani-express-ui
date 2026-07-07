-- Deactivated customers lose portal access.
-- A receiver with is_active = false can no longer resolve as a portal customer
-- (current_customer) and sees nothing through customer_packages — enforced in
-- the database, so it holds even against a still-valid access token.

CREATE OR REPLACE FUNCTION public.current_customer()
RETURNS public.receiver_profiles
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT * FROM public.receiver_profiles
  WHERE auth_user_id = auth.uid()
    AND role IS NOT NULL
    AND is_active
  LIMIT 1;
$$;

-- Same columns as the current view — only the WHERE gains `me.is_active`, so
-- CREATE OR REPLACE is valid (no column change).
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
  ), '[]'::jsonb) AS items
FROM public.packages p
WHERE p.deleted_at IS NULL
  AND p.status <> 'draft'
  AND EXISTS (
    SELECT 1 FROM public.receiver_profiles me
    WHERE me.auth_user_id = auth.uid()
      AND me.role IS NOT NULL
      AND me.is_active            -- deactivated customers see nothing
      AND (
        (me.role = 'runner' AND p.receiver_id = me.id)
        OR
        (me.role = 'buyer' AND p.receiver_id IN (
           SELECT r.id FROM public.receiver_profiles r
           WHERE r.company_id = me.company_id))
      )
  );
