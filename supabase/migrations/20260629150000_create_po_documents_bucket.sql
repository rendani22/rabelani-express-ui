-- ============================================================================
-- Create the `po-documents` storage bucket + access policies
--
-- PurchaseOrderCrudService.uploadPODocument uploads PO attachments to a
-- `po-documents` bucket and stores the file's public URL on
-- purchase_orders.document_url. The bucket was never created by a migration, so
-- uploads (and the resulting public URLs) failed.
--
-- Mirrors the existing `pod-documents` convention: a public-read bucket so the
-- stored publicUrl resolves, with inserts restricted to active staff.
-- ============================================================================

-- Public bucket so getPublicUrl(...) links resolve for anyone with the URL.
insert into storage.buckets (id, name, public)
values ('po-documents', 'po-documents', true)
on conflict (id) do nothing;

-- Anyone with the link can read a PO document (matches "Public can read POD documents").
drop policy if exists "Public can read PO documents" on "storage"."objects";
create policy "Public can read PO documents"
  on "storage"."objects"
  as permissive
  for select
  to public
  using ((bucket_id = 'po-documents'::text));

-- Only active staff may upload PO documents (matches "Staff can upload POD documents").
drop policy if exists "Staff can upload PO documents" on "storage"."objects";
create policy "Staff can upload PO documents"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
  with check (((bucket_id = 'po-documents'::text) AND (EXISTS ( SELECT 1
     FROM public.staff_profiles
    WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true))))));

-- Allow active staff to replace/remove an attachment.
drop policy if exists "Staff can update PO documents" on "storage"."objects";
create policy "Staff can update PO documents"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
  using (((bucket_id = 'po-documents'::text) AND (EXISTS ( SELECT 1
     FROM public.staff_profiles
    WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true))))))
  with check (((bucket_id = 'po-documents'::text) AND (EXISTS ( SELECT 1
     FROM public.staff_profiles
    WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true))))));

drop policy if exists "Staff can delete PO documents" on "storage"."objects";
create policy "Staff can delete PO documents"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
  using (((bucket_id = 'po-documents'::text) AND (EXISTS ( SELECT 1
     FROM public.staff_profiles
    WHERE ((staff_profiles.user_id = auth.uid()) AND (staff_profiles.is_active = true))))));
