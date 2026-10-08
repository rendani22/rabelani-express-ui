-- Record where a purchase order is to be delivered.
--
-- `ingest-coupa-po` reads the `Shipping` address block off the Coupa email
-- (e.g. "DA01-Main Store") and stores it here. When an order is raised against
-- the PO, the New package dialog matches it against `delivery_locations` to
-- pre-select the delivery location, alongside the PO's customer (receiver_id).
--
-- Kept as text rather than a foreign key: the match is made at order time, so
-- a delivery location created after the PO arrived is still picked up, and an
-- unmatched ship-to costs nothing (the user simply picks a location).

alter table "public"."purchase_orders"
  add column if not exists "ship_to_name" text,
  add column if not exists "ship_to_address" text;
