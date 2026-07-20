-- inventory_items.sku carries the Coupa item code (e.g. 37869) that inbound
-- Exxaro purchase-order emails are matched on. Ingestion resolves a code to an
-- inventory item through this column alone, so a null sku makes an item
-- unreachable from a PO -- and because create_purchase_order_with_items
-- validates every line before inserting any, one unresolvable code rolls back
-- the whole purchase order rather than just its own line.
--
-- This migration fails if any inventory_items row has a null or blank sku.
-- That is deliberate. The codes must be backfilled from the Coupa catalogue by
-- hand first; there is no safe automatic default, because an invented code
-- would occupy the same unique namespace the parser searches and could later
-- collide with a real Coupa code.

alter table "public"."inventory_items"
  alter column "sku" set not null;

-- NOT NULL alone still admits '', which would satisfy the constraint while
-- remaining just as unresolvable.
alter table "public"."inventory_items"
  add constraint "inventory_items_sku_not_blank"
  check (length(btrim("sku")) > 0);
