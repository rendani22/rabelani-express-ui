-- ============================================================================
-- POD diagnostics
-- ----------------------------------------------------------------------------
-- Run these queries in the Supabase SQL editor to figure out *why* no row
-- ended up in `public.pods` after marking a package as collected.
--
-- USAGE: replace :ref with the package reference you tested with, e.g.
--   set ref = 'PKG-2026-001';   -- or just paste it inline below.
-- ============================================================================

-- 1. Confirm the receiver / witness / signature columns actually exist.
--    If this returns 0 rows, the migration `20260426_pod_receiver_witness_fields.sql`
--    has NOT been applied — the edge function's upsert will fail silently.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'pods'
  AND column_name IN (
    'receiver_name', 'receiver_employee_number', 'receiver_phone', 'receiver_signature',
    'witness_name',  'witness_employee_number',  'witness_phone',  'witness_signature',
    'completed_at',  'completed_by'
  )
ORDER BY column_name;

-- 2. List recent collected packages and whether they have a matching POD row.
SELECT
  p.reference,
  p.status,
  p.collected_at,
  pd.id              AS pod_id,
  pd.pod_reference,
  pd.is_locked,
  pd.completed_at,
  pd.receiver_name,
  pd.witness_name
FROM public.packages p
LEFT JOIN public.pods pd ON pd.package_id = p.id
WHERE p.status IN ('collected')
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 20;

-- 3. Inspect the audit log entries written by the `update-package` edge
--    function. The `metadata` JSON contains `pod_captured`, `pod_persisted`,
--    and `pod_persist_error` — that's the smoking gun.
--
--    `pod_captured = true` and `pod_persisted = false` means the UI sent
--    the payload but the upsert failed; `pod_persist_error` will say why
--    (missing column, RLS denial, etc.).
--
--    NOTE: if your `audit_logs` table uses a different timestamp column
--    name (e.g. `performed_at`, `logged_at`), replace `created_at` below.
SELECT
  created_at,
  action,
  entity_id,
  metadata->>'package_reference' AS package_reference,
  metadata->>'previous_status'   AS previous_status,
  metadata->>'new_status'        AS new_status,
  metadata->>'pod_captured'      AS pod_captured,
  metadata->>'pod_persisted'     AS pod_persisted,
  metadata->>'pod_persist_error' AS pod_persist_error
FROM public.audit_logs
WHERE action IN ('PACKAGE_UPDATED', 'PACKAGE_UPDATE_DENIED')
  AND (metadata->>'new_status' = 'collected'
       OR metadata->>'pod_captured' = 'true')
ORDER BY created_at DESC
LIMIT 20;

-- 3b. If you don't know what the timestamp column is called, list the
--     columns of `audit_logs` first:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'audit_logs'
-- ORDER BY ordinal_position;

-- 4. Look at the row for one specific package (replace the reference).
-- SELECT pd.*
-- FROM public.pods pd
-- JOIN public.packages p ON p.id = pd.package_id
-- WHERE p.reference = 'PKG-2026-001';



