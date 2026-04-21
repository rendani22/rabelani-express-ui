-- ============================================================================
-- Inventory Items Table
-- Run this in your Supabase SQL editor to enable the Inventory feature.
-- ============================================================================

-- Create inventory_items table
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT          NOT NULL,
  sku                 TEXT          UNIQUE,
  description         TEXT,
  category            TEXT,
  unit                TEXT          NOT NULL DEFAULT 'pieces',
  quantity            INTEGER       NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  low_stock_threshold INTEGER       NOT NULL DEFAULT 10 CHECK (low_stock_threshold >= 0),
  unit_price          NUMERIC(12,2),
  is_active           BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER inventory_items_set_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_inventory_items_is_active  ON public.inventory_items (is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_items_category   ON public.inventory_items (category);
CREATE INDEX IF NOT EXISTS idx_inventory_items_sku        ON public.inventory_items (sku);

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

-- Table-level GRANTs for the `authenticated` role.
-- PostgREST derives its CORS preflight Access-Control-Allow-Methods list from
-- these grants, so without them UPDATE (PATCH) / DELETE requests fail in the
-- browser as CORS errors before RLS is even evaluated.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;

-- Authenticated users can read all inventory
CREATE POLICY "Authenticated users can view inventory"
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (TRUE);

-- Only authenticated staff can insert / update / delete
CREATE POLICY "Staff can insert inventory"
  ON public.inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (TRUE);

CREATE POLICY "Staff can update inventory"
  ON public.inventory_items FOR UPDATE
  TO authenticated
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY "Staff can delete inventory"
  ON public.inventory_items FOR DELETE
  TO authenticated
  USING (TRUE);

-- ============================================================================
-- RPC: Atomic inventory stock decrement
-- Used by the UI when a package is created to deduct consumed quantities.
-- GREATEST(0, ...) ensures stock never goes below zero.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.decrement_inventory_quantity(item_id UUID, decrement_by INTEGER)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.inventory_items
  SET quantity = GREATEST(0, quantity - decrement_by)
  WHERE id = item_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.decrement_inventory_quantity(UUID, INTEGER)
  TO authenticated;

-- ============================================================================
-- inventory_item_id foreign key on package_items (optional)
-- Add this column so package items link back to the inventory item they consumed.
-- The UI will deduct stock when a package is created.
-- ============================================================================

ALTER TABLE public.package_items
  ADD COLUMN IF NOT EXISTS inventory_item_id UUID REFERENCES public.inventory_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_package_items_inventory_item_id
  ON public.package_items (inventory_item_id);

-- ============================================================================
-- Sample data (optional – remove or comment out before production)
-- ============================================================================

-- INSERT INTO public.inventory_items (name, sku, category, unit, quantity, low_stock_threshold, unit_price) VALUES
--   ('Cardboard Box (Small)',  'BOX-S',    'Packaging',  'pieces', 200, 20,  5.50),
--   ('Cardboard Box (Medium)', 'BOX-M',    'Packaging',  'pieces', 150, 20,  8.00),
--   ('Cardboard Box (Large)',  'BOX-L',    'Packaging',  'pieces',  80, 15, 12.00),
--   ('Bubble Wrap Roll',       'WRAP-BW',  'Packaging',  'rolls',   30,  5, 35.00),
--   ('Packing Tape',           'TAPE-PKG', 'Supplies',   'rolls',   60, 10, 18.00),
--   ('Fragile Sticker',        'STCK-FRG', 'Supplies',   'sheets', 500, 50,  2.50);
