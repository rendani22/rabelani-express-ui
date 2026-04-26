-- ============================================================================
-- Proof-of-Delivery (POD): receiver / witness identification + signatures
-- ----------------------------------------------------------------------------
-- The `pods` table already exists (it is referenced by `packages` and exposes
-- `is_locked` / `locked_at` / `pod_reference`). This migration adds the
-- receiver / witness / signature columns the UI captures via the
-- mark-collected modal so the edge function can persist them.
--
-- All ALTERs use `IF NOT EXISTS` to remain idempotent across environments
-- where some columns may already exist.
-- ============================================================================

-- Receiver fields ------------------------------------------------------------
ALTER TABLE public.pods
  ADD COLUMN IF NOT EXISTS receiver_name             text,
  ADD COLUMN IF NOT EXISTS receiver_employee_number  text,
  ADD COLUMN IF NOT EXISTS receiver_phone            text,
  -- Stored as a base64 PNG data URL captured by the signature pad.
  -- TEXT (not bytea) so the front-end can render it directly via <img src>.
  ADD COLUMN IF NOT EXISTS receiver_signature        text;

-- Witness fields -------------------------------------------------------------
ALTER TABLE public.pods
  ADD COLUMN IF NOT EXISTS witness_name              text,
  ADD COLUMN IF NOT EXISTS witness_employee_number   text,
  ADD COLUMN IF NOT EXISTS witness_phone             text,
  ADD COLUMN IF NOT EXISTS witness_signature         text;

-- Completion metadata --------------------------------------------------------
ALTER TABLE public.pods
  ADD COLUMN IF NOT EXISTS completed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by              uuid REFERENCES auth.users(id);

-- A package should have at most one POD record. Enforce with a unique
-- partial index (skip-NULL semantics are not needed because every POD row
-- must belong to a package).
CREATE UNIQUE INDEX IF NOT EXISTS pods_package_id_unique_idx
  ON public.pods (package_id);

-- Helpful read indexes for dashboards / reports.
CREATE INDEX IF NOT EXISTS pods_completed_at_idx ON public.pods (completed_at);
CREATE INDEX IF NOT EXISTS pods_completed_by_idx ON public.pods (completed_by);

COMMENT ON COLUMN public.pods.receiver_signature IS
  'Receiver signature captured at collection time. Stored as a base64 PNG data URL.';
COMMENT ON COLUMN public.pods.witness_signature IS
  'Witness signature captured at collection time. Stored as a base64 PNG data URL.';

