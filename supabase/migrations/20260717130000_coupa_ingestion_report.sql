-- ============================================================================
-- Coupa PO ingestion report
--
-- `ingest-coupa-po` turns Coupa's purchase-order emails into Global POs. Until
-- now an attempt left a trace only when it *succeeded* (a purchase_orders row);
-- every failure went to Sentry and a support email and was invisible to the
-- app. So "how many orders did we actually get, and how many did we drop?" was
-- a question nobody could answer from the product.
--
-- The function now writes an `audit_logs` row for every attempt, both outcomes,
-- attributed to the all-zeros system actor (`performed_by` is NOT NULL and a
-- webhook has no auth.uid() -- the same convention `audit_table_changes()` and
-- the phase-5 policy trigger already use). This RPC counts those rows for the
-- Executive dashboard's ingestion card.
--
-- WHY audit_logs AND NOT A NEW TABLE
-- The rows are audit records first and a report second: "this PO came from a
-- Coupa email, and here is the name it was matched on". A dedicated table would
-- duplicate audit_logs' shape (actor, entity, metadata, created_at), its
-- append-only RLS, and its indexes -- and would still need to be joined back to
-- the PO for the audit question. Successes carry entity_id = the purchase order,
-- so a PO's provenance is one query by (entity_type, entity_id).
--
-- WHY THERE IS NO COMPANY FILTER
-- Every other executive metric scopes by company via receiver_id →
-- receiver_profiles.company_id. A *failed* ingestion has no purchase order and
-- therefore no customer -- that is frequently the very reason it failed. Scoping
-- this report to a company could only ever return its successes, which would
-- report a 0% failure rate however much was actually being dropped. A figure
-- that is wrong in a reassuring direction is worse than no figure, so the report
-- is network-wide and the card is hidden when the dashboard is company-scoped
-- (the same treatment the driver/POD/inventory cards already get).
-- ============================================================================

-- The window is a parameter rather than a constant so the caller states it and
-- the label on the card can never drift from the figures underneath it.
CREATE OR REPLACE FUNCTION public.get_coupa_ingestion_report(
  p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since    TIMESTAMPTZ;
  v_days     INTEGER;
  v_result   JSONB;
BEGIN
  IF NOT public.has_permission('dashboard.exec.view') THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Clamp rather than reject: this feeds a dashboard card, and a nonsense
  -- window should give a sane default, not a red error where a figure belongs.
  v_days  := LEAST(GREATEST(COALESCE(p_days, 30), 1), 365);
  v_since := now() - (v_days || ' days')::INTERVAL;

  WITH attempts AS (
    SELECT
      al.action,
      al.metadata,
      al.created_at
    FROM public.audit_logs al
    WHERE al.action IN ('COUPA_PO_INGESTED', 'COUPA_PO_INGEST_FAILED')
      AND al.created_at >= v_since
  ),
  reasons AS (
    -- Grouped on the closed set of reason codes the edge function writes
    -- (_shared/coupa-audit.ts). A row written before those codes existed, or by
    -- a future path that forgets one, still lands somewhere a reader will look.
    SELECT
      COALESCE(a.metadata->>'reason', 'unexpected_error') AS reason,
      count(*)                                            AS reason_count
    FROM attempts a
    WHERE a.action = 'COUPA_PO_INGEST_FAILED'
    GROUP BY 1
  )
  SELECT jsonb_build_object(
    'windowDays', v_days,
    'processed',  (SELECT count(*) FROM attempts WHERE action = 'COUPA_PO_INGESTED'),
    'failed',     (SELECT count(*) FROM attempts WHERE action = 'COUPA_PO_INGEST_FAILED'),
    -- The ORDER BY belongs inside jsonb_agg, not in the CTE: a CTE's ordering
    -- is not contractually preserved through an aggregate, so ordering there
    -- would give worst-first bars that happen to work and could stop working.
    'reasons',    (
      SELECT COALESCE(
        jsonb_agg(jsonb_build_object('reason', reason, 'count', reason_count) ORDER BY reason_count DESC, reason),
        '[]'::jsonb
      )
      FROM reasons
    ),
    'lastFailureAt', (
      SELECT max(created_at) FROM attempts WHERE action = 'COUPA_PO_INGEST_FAILED'
    ),
    'lastProcessedAt', (
      SELECT max(created_at) FROM attempts WHERE action = 'COUPA_PO_INGESTED'
    )
  )
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_coupa_ingestion_report(INTEGER) IS
  'Counts Coupa PO ingestion attempts (audit_logs COUPA_PO_INGESTED / COUPA_PO_INGEST_FAILED) over the last p_days. Network-wide: failed attempts have no customer and so cannot be scoped to a company.';

GRANT EXECUTE ON FUNCTION public.get_coupa_ingestion_report(INTEGER) TO authenticated;

-- The report filters `action` within a `created_at` window, and audit_logs is
-- append-only and only grows. The existing single-column indexes on action and
-- created_at each leave the other half of that predicate to a filter step; this
-- composite serves the whole thing.
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at
  ON public.audit_logs USING btree (action, created_at DESC);
