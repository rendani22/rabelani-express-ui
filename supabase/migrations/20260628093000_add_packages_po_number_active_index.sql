-- Speed up the Purchase Orders page load.
--
-- `PurchaseOrdersService.load()` fetches every package that carries a po_number
-- (and is not soft-deleted), ordered by created_at desc, in a single query to
-- group them by PO:
--
--   .not('po_number', 'is', null).is('deleted_at', null).order('created_at', desc)
--
-- The existing `idx_packages_po_number` indexes every row (including nulls) and
-- is built for po_number equality lookups, so it does not serve this scan well.
-- This partial index is keyed on created_at DESC and restricted to exactly the
-- rows the query returns, so the planner reads just the relevant packages in the
-- required order — no full scan and no separate sort — and it stays small as the
-- packages table grows.

create index if not exists idx_packages_po_number_active
  on public.packages (created_at desc)
  where po_number is not null and deleted_at is null;
