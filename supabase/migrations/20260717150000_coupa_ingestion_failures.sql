-- ============================================================================
-- Coupa ingestion dead-letter queue
--
-- A rejected Coupa email is a real purchase order that Exxaro issued and this
-- system did not record. Until now the only copies of it were support's inbox
-- and the mailbox itself, so "retry it" meant a human re-doing the work by hand.
-- This table is the durable record the retry acts on.
--
-- WHY THE BODY IS STORED HERE AND NOT IN audit_logs
-- `audit_logs` deliberately carries no email body: it is unbounded, it is
-- append-only (so a bad row can never be trimmed), and it is readable by every
-- holder of `orders.audit.view`. None of that suits a raw third-party document.
-- But a retry has to replay the *original* email — a summary cannot be re-parsed
-- — so the payload has to live somewhere. It lives here, where the row is
-- mutable (retry_count, status), prunable once resolved, and gated behind a
-- single admin-only permission rather than the broad audit-read one.
--
-- audit_logs still records every attempt for the Executive report. This table is
-- the work queue; that one is the history. They answer different questions and
-- deliberately do not share a row.
-- ============================================================================

CREATE TYPE public.coupa_failure_status AS ENUM ('pending', 'resolved', 'ignored');

CREATE TABLE public.coupa_ingestion_failures (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The payload, exactly as the forwarder sent it. This is what a retry replays;
  -- anything derived from it is a convenience column below.
  from_address     TEXT,
  subject          TEXT,
  body             TEXT NOT NULL,
  -- Why it failed, matching the closed set in _shared/coupa-audit.ts.
  reason           TEXT NOT NULL,
  details          TEXT,
  -- Parsed out when parsing got that far, so the queue is readable at a glance
  -- and can be searched without re-parsing every body.
  po_number        TEXT,
  on_behalf_of     TEXT,
  submitted_by     TEXT,
  unknown_codes    TEXT[],
  status           public.coupa_failure_status NOT NULL DEFAULT 'pending',
  retry_count      INT NOT NULL DEFAULT 0,
  last_retry_at    TIMESTAMPTZ,
  -- The most recent failure text. `details` stays as the original, so a retry
  -- that fails differently does not erase why it first failed.
  last_error       TEXT,
  -- Set when a retry finally lands, so the row points at what it became.
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.coupa_ingestion_failures IS
  'Dead-letter queue for Coupa PO emails that could not be ingested. Holds the '
  'original email so an admin can retry it after fixing the data. Admin-only: '
  'bodies are raw purchase-order documents.';
COMMENT ON COLUMN public.coupa_ingestion_failures.body IS
  'The original email text. Replayed verbatim on retry — do not normalise it, '
  'or the retry stops testing what actually arrived.';
COMMENT ON COLUMN public.coupa_ingestion_failures.status IS
  'pending = still needs a human. resolved = a retry created the PO, or someone '
  'keyed it in by hand. ignored = deliberately dropped (a test, a duplicate).';

-- One open row per PO number. A revision or a replay of the same PO must not
-- stack up separate queue entries for what is, to a human, one problem —
-- ingest-coupa-po updates the open row instead. Partial, so the history of
-- resolved rows is kept.
CREATE UNIQUE INDEX idx_coupa_failures_open_po
  ON public.coupa_ingestion_failures (po_number)
  WHERE status = 'pending' AND po_number IS NOT NULL;

-- The queue is read newest-first, filtered to what still needs doing.
CREATE INDEX idx_coupa_failures_status_created
  ON public.coupa_ingestion_failures (status, created_at DESC);

CREATE TRIGGER set_coupa_failures_updated_at
  BEFORE UPDATE ON public.coupa_ingestion_failures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permission
-- ---------------------------------------------------------------------------

INSERT INTO public.permissions (key, feature, label, description, is_sensitive, sort_order) VALUES
  ('purchase_orders.ingest.retry', 'Purchase orders', 'Retry Coupa ingestion',
   'View failed Coupa PO emails and replay them. Shows raw order documents.', true, 43)
ON CONFLICT (key) DO NOTHING;

-- Admins hold every permission unconditionally via has_permission()'s
-- is_active_admin() branch, so no role_permissions row is needed for them —
-- granting one to manager would be the way to widen this later, deliberately.

-- ---------------------------------------------------------------------------
-- RLS
--
-- Read/update for the permission holder; no client INSERT or DELETE at all.
-- Rows are written by the ingestion function (service_role, which bypasses RLS)
-- and never by a person: a hand-made failure row would be a fiction, and a
-- deleted one would hide a purchase order that was really lost. Retiring a row
-- is what `status` is for.
-- ---------------------------------------------------------------------------

ALTER TABLE public.coupa_ingestion_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Can view coupa ingestion failures" ON public.coupa_ingestion_failures
  FOR SELECT TO authenticated
  USING (public.has_permission('purchase_orders.ingest.retry'));

CREATE POLICY "Can triage coupa ingestion failures" ON public.coupa_ingestion_failures
  FOR UPDATE TO authenticated
  USING (public.has_permission('purchase_orders.ingest.retry'))
  WITH CHECK (public.has_permission('purchase_orders.ingest.retry'));

GRANT SELECT, UPDATE ON public.coupa_ingestion_failures TO authenticated;
REVOKE INSERT, DELETE ON public.coupa_ingestion_failures FROM authenticated, anon;
-- Matches the phase-0 hardening: TRUNCATE is not filtered by RLS.
REVOKE TRUNCATE ON public.coupa_ingestion_failures FROM authenticated, anon;
