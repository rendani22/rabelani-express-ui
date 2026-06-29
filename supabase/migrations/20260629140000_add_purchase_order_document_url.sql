-- ============================================================================
-- Add purchase_orders.document_url
--
-- The purchase-orders feature lets staff attach a PO document: the file is
-- uploaded to the `po-documents` storage bucket and its public URL stored on
-- the row (PurchaseOrderCrudService.uploadPODocument). The list query also
-- selects this column. The column was never added by an earlier migration, so
-- every read failed with "column purchase_orders.document_url does not exist".
-- ============================================================================

alter table "public"."purchase_orders"
  add column if not exists "document_url" text;
