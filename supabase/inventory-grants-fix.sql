-- ============================================================================
-- Fix: CORS "Method PATCH/DELETE not allowed" on inventory_items /
-- inventory_movements.
--
-- Root cause:
--   PostgREST builds the Access-Control-Allow-Methods preflight header from the
--   GRANTs of the *requesting* role. CORS preflight OPTIONS requests are
--   anonymous per the CORS spec (no Authorization header is sent), so
--   PostgREST evaluates them against the `anon` role – NOT the `authenticated`
--   role, even when your app is logged in. Granting only to `authenticated`
--   leaves PATCH/DELETE out of the preflight allow-list and the browser blocks
--   the request as a CORS error before it ever hits the server's RLS check.
--
--   RLS policies still gate actual row access, so granting table privileges to
--   `anon` is safe – anon cannot satisfy the "TO authenticated" policies, it
--   just means the preflight correctly advertises the methods as allowed.
--
-- Run this once in the Supabase SQL editor, then HARD-RELOAD your browser to
-- bust the cached preflight response (⌘⇧R on Mac, Ctrl+Shift+R on Windows),
-- or open an Incognito window.
-- ============================================================================

-- Inventory items – full CRUD methods must be advertised in the preflight.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items
  TO anon, authenticated;

-- Inventory movements – append-only audit log.
GRANT SELECT, INSERT ON public.inventory_movements
  TO anon, authenticated;

-- Atomic decrement RPC used by package creation.
GRANT EXECUTE ON FUNCTION public.decrement_inventory_quantity(UUID, INTEGER)
  TO anon, authenticated;

-- Tell PostgREST to reload its schema cache so the grants take effect now.
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- Verify (optional – run separately and confirm both roles appear for each
-- table with SELECT / INSERT / UPDATE / DELETE as applicable).
-- ============================================================================
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name   IN ('inventory_items','inventory_movements')
-- ORDER BY table_name, grantee, privilege_type;
