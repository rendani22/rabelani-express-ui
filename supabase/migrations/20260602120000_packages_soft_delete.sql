-- ============================================================================
-- Soft-delete support for packages
--
-- Adds nullable `deleted_at` / `deleted_by` columns to `public.packages` so an
-- authorized account can move orders to a "deleted" state without destroying
-- the underlying row (and its `package_items`, POD record, inventory movement
-- references, etc.). A partial index keeps queries against live orders fast,
-- and an RLS policy hides deleted rows from non-privileged roles.
--
-- A SECURITY DEFINER RPC (`soft_delete_package`) provides an atomic delete +
-- timestamp update that respects the deletion policy.
-- ============================================================================

-- Clean up old policies/functions if they exist (safe to rerun)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'Hide soft-deleted packages from non-privileged users') THEN
    DROP POLICY "Hide soft-deleted packages from non-privileged users" ON public.packages;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'packages' AND policyname = 'Block mutations on soft-deleted packages') THEN
    DROP POLICY "Block mutations on soft-deleted packages" ON public.packages;
  END IF;
END $$;

-- ── Columns ──────────────────────────────────────────────────────────────────
ALTER TABLE public.packages
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID        NULL REFERENCES auth.users(id) ON DELETE SET NULL;

-- ── Indexes ──────────────────────────────────────────────────────────────────
-- Partial index for live-order lookups (the common case).
CREATE INDEX IF NOT EXISTS idx_packages_live
  ON public.packages (created_at DESC)
  WHERE deleted_at IS NULL;

-- Index for the "Deleted orders" recycle-bin view.
CREATE INDEX IF NOT EXISTS idx_packages_deleted_at
  ON public.packages (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Existing SELECT policies typically allow authenticated users to read all
-- package rows. Add an additional policy that hides soft-deleted rows from
-- everyone EXCEPT the privileged "delete-allowed" account. The existing
-- broad policies still apply to live rows.
--
-- NOTE: The privileged account is matched by email
-- (`rendani@email.com`). Update this list if more accounts gain the
-- permission in the future.

-- Restrictive policy: SELECTs only see rows where deleted_at IS NULL, unless
-- the requesting auth user's email is on the allow-list. We use auth.jwt()
-- to extract the email from the JWT token (available to all authenticated users)
-- rather than querying auth.users (which has no SELECT grant).
CREATE POLICY "Hide soft-deleted packages from non-privileged users"
  ON public.packages
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    deleted_at IS NULL
    OR (auth.jwt() ->> 'email')::text = ANY (ARRAY['rendani@email.com'])
  );

-- Prevent UPDATEs/DELETEs against soft-deleted rows by everyone except the
-- privileged account (so accidental edge-function calls on a "deleted"
-- package no-op cleanly instead of mutating audit data).
CREATE POLICY "Block mutations on soft-deleted packages"
  ON public.packages
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (
    deleted_at IS NULL
    OR (auth.jwt() ->> 'email')::text = ANY (ARRAY['rendani@email.com'])
  );

-- ── RPC: soft_delete_package ─────────────────────────────────────────────────
-- Atomic update that marks a package as soft-deleted. Returns the updated row
-- so callers can confirm the operation. Throws when the package doesn't
-- exist or is already deleted.
CREATE OR REPLACE FUNCTION public.soft_delete_package(p_package_id UUID)
RETURNS public.packages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.packages;
  v_email TEXT;
BEGIN
  -- Authorization: only the privileged account may soft-delete orders.
  -- Extract email from JWT token (available to all authenticated users).
  v_email := (auth.jwt() ->> 'email')::text;
  IF v_email IS NULL OR v_email <> ALL (ARRAY['rendani@email.com']) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_package(UUID) TO authenticated;

-- ── RPC: restore_package ─────────────────────────────────────────────────────
-- Reverses a soft delete. Inventory must be re-deducted by the caller because
-- stock-return on soft delete may have already shipped to other orders.
CREATE OR REPLACE FUNCTION public.restore_package(p_package_id UUID)
RETURNS public.packages
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.packages;
  v_email TEXT;
BEGIN
  v_email := (auth.jwt() ->> 'email')::text;
  IF v_email IS NULL OR v_email <> ALL (ARRAY['rendani@email.com']) THEN
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
$$;

GRANT EXECUTE ON FUNCTION public.restore_package(UUID) TO authenticated;





