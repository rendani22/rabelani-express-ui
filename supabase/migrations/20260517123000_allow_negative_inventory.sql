-- Migration: allow negative inventory quantities and change decrement RPC
-- Date: 2026-05-17
-- Purpose: remove the CHECK constraint that prevented negative quantities
-- and replace the atomic decrement RPC so it subtracts without clamping.
-- IMPORTANT: Run on a staging database first and take a backup before
-- applying to production.

BEGIN;

-- 1) Remove check constraint that enforces quantity >= 0 (if present).
ALTER TABLE IF EXISTS public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_quantity_check;

-- 2) Replace the decrement RPC to allow quantities to go negative.
CREATE OR REPLACE FUNCTION public.decrement_inventory_quantity(item_id UUID, decrement_by INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.inventory_items
  SET quantity = quantity - decrement_by
  WHERE id = item_id;
END;
$$;

-- 3) Ensure execute privileges for the authenticated role (migrations sometimes
-- recreate privileges differently; grant explicitly to be safe).
GRANT EXECUTE ON FUNCTION public.decrement_inventory_quantity(UUID, INTEGER) TO authenticated;

COMMIT;

-- End migration

