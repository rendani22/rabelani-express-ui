-- Allow audit_logs.entity_id to be NULL.
--
-- Phase 5 (20260714220000_phase5_policy_audit.sql) audits role_permissions,
-- whose key is the (role, permission_key) pair rather than a uuid. The trigger
-- records that pair in metadata and leaves entity_id NULL — but entity_id was
-- declared NOT NULL in the original schema, so every grant/revoke from the
-- Access Control page failed with 23502.
--
-- Every other audited entity still writes its uuid; only the composite-key
-- policy rows rely on NULL. Readers filter by (entity_type, entity_id) for a
-- specific row, which NULL simply never matches — the intended behaviour.

ALTER TABLE public.audit_logs ALTER COLUMN entity_id DROP NOT NULL;
