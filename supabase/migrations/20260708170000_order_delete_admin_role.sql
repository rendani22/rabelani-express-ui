-- ============================================================================
-- Order deletion: gate on admin ROLE, not a hardcoded email
--
-- Deletion/restore of orders (and visibility of soft-deleted rows) was gated on
-- a single hardcoded email — 'rendani@email.com' — in two RPCs and two RLS
-- policies, while the app UI gated the Delete button on staff_profiles.role =
-- 'admin'. That mismatch meant the button showed for every admin but the server
-- only honoured one personal account.
--
-- Fix: any ACTIVE ADMIN may delete/restore orders and see the deleted-orders
-- view. A SECURITY DEFINER helper `is_order_admin()` centralises the check
-- (bypasses staff_profiles RLS so it is safe to call from within a policy).
-- The client's canDeleteOrders() already returns isCurrentUserAdmin(), so no
-- app change is needed — this just makes the server agree.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_order_admin()
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_profiles
    WHERE user_id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  );
$function$;

GRANT EXECUTE ON FUNCTION public.is_order_admin() TO authenticated;

-- ── Soft-delete: admin-only ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.soft_delete_package(p_package_id uuid)
  RETURNS public.packages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.packages;
BEGIN
  IF NOT public.is_order_admin() THEN
    RAISE EXCEPTION 'Not authorized to delete orders' USING ERRCODE = '42501';
  END IF;

  UPDATE public.packages
  SET deleted_at = NOW(),
      deleted_by = auth.uid()
  WHERE id = p_package_id
    AND deleted_at IS NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found or already deleted', p_package_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$;

-- ── Restore: admin-only ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.restore_package(p_package_id uuid)
  RETURNS public.packages
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $function$
DECLARE
  v_row public.packages;
BEGIN
  IF NOT public.is_order_admin() THEN
    RAISE EXCEPTION 'Not authorized to restore orders' USING ERRCODE = '42501';
  END IF;

  UPDATE public.packages
  SET deleted_at = NULL,
      deleted_by = NULL
  WHERE id = p_package_id
    AND deleted_at IS NOT NULL
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package % not found or not deleted', p_package_id
      USING ERRCODE = 'P0002';
  END IF;

  RETURN v_row;
END;
$function$;

-- ── RLS: admins (not one email) may mutate + see soft-deleted rows ──────────
DROP POLICY IF EXISTS "Block mutations on soft-deleted packages" ON public.packages;
CREATE POLICY "Block mutations on soft-deleted packages"
  ON public.packages
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (((deleted_at IS NULL) OR public.is_order_admin()));

DROP POLICY IF EXISTS "Hide soft-deleted packages from non-privileged users" ON public.packages;
CREATE POLICY "Hide soft-deleted packages from non-privileged users"
  ON public.packages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (((deleted_at IS NULL) OR public.is_order_admin()));
