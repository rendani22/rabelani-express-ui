-- ============================================================================
-- Inventory Movements Table
-- Provides a full audit trail of every stock change: creation, manual edits,
-- and automatic deductions when packages are created.
-- Run this in your Supabase SQL editor after inventory-schema.sql.
-- ============================================================================

-- Movement source values:
--   'initial'        – item created with non-zero opening stock
--   'manual_edit'    – quantity changed via the edit form
--   'package_deduct' – stock deducted when a delivery package was created
--   'restock'        – stock added via a dedicated restock action

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id          UUID          NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  user_id          UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  delta            INTEGER       NOT NULL,            -- positive = added, negative = removed
  quantity_before  INTEGER       NOT NULL DEFAULT 0,
  quantity_after   INTEGER       NOT NULL DEFAULT 0,
  source           TEXT          NOT NULL DEFAULT 'manual_edit'
                                 CHECK (source IN ('initial','manual_edit','package_deduct','restock')),
  reference        TEXT,                              -- e.g. package reference number
  note             TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_inventory_movements_item_id
  ON public.inventory_movements (item_id);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_created_at
  ON public.inventory_movements (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_user_id
  ON public.inventory_movements (user_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Table-level GRANTs. Movements are an append-only audit log: SELECT + INSERT
-- only (no UPDATE/DELETE, which mirrors the "immutable" intent below).
-- These grants are required for PostgREST to allow the corresponding HTTP
-- methods in its CORS preflight response.
GRANT SELECT, INSERT ON public.inventory_movements TO authenticated;

-- Any authenticated user can view the full movement history
CREATE POLICY "Authenticated users can view inventory movements"
  ON public.inventory_movements FOR SELECT
  TO authenticated
  USING (TRUE);

-- Any authenticated user can insert movement records
CREATE POLICY "Authenticated users can insert inventory movements"
  ON public.inventory_movements FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

-- Movements are immutable – no UPDATE / DELETE allowed

