-- ============================================================================
-- queue_coupa_ingestion_failure — fix the write path into the dead-letter queue
--
-- THE BUG
-- `ingest-coupa-po` queued failures with a PostgREST upsert:
--
--   .upsert(row, { onConflict: 'po_number' })   ->   ON CONFLICT (po_number)
--
-- but `idx_coupa_failures_open_po` is a PARTIAL unique index (WHERE status =
-- 'pending' AND po_number IS NOT NULL). Postgres will only use a partial index
-- as an ON CONFLICT arbiter when the statement restates its predicate, and
-- PostgREST's upsert cannot express one. Every insert therefore failed with
-- 42P10 ("no unique or exclusion constraint matching the ON CONFLICT
-- specification") -- and because queueing is best-effort and swallows its
-- errors, it failed silently: failures were audited and counted, but the queue
-- stayed empty and nothing said why.
--
-- THE FIX
-- Do the write in SQL, where the predicate CAN be restated, so the partial
-- index is inferrable and the upsert is atomic. This also removes the
-- read-then-write race a two-query version in TypeScript would have had: two
-- copies of the same PO arriving together can no longer open two tickets.
--
-- The partial index stays as it is. It is doing real work -- one OPEN ticket per
-- PO number, while keeping every resolved row as history -- and that is exactly
-- the shape a plain unique constraint cannot express.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.queue_coupa_ingestion_failure(
  p_body          TEXT,
  p_reason        TEXT,
  p_from_address  TEXT DEFAULT NULL,
  p_subject       TEXT DEFAULT NULL,
  p_details       TEXT DEFAULT NULL,
  p_po_number     TEXT DEFAULT NULL,
  p_on_behalf_of  TEXT DEFAULT NULL,
  p_submitted_by  TEXT DEFAULT NULL,
  p_unknown_codes TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  -- Callers are the ingestion function (service_role). A logged-in user must
  -- never be able to fabricate a queue row: a failure that did not happen is a
  -- purchase order that does not exist, and the queue's whole value is that
  -- every row in it is real.
  IF COALESCE(auth.role(), current_setting('request.jwt.claim.role', true), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the ingestion service can queue a failure'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.coupa_ingestion_failures (
    from_address, subject, body, reason, details,
    po_number, on_behalf_of, submitted_by, unknown_codes
  )
  VALUES (
    p_from_address, p_subject, p_body, p_reason, p_details,
    p_po_number, p_on_behalf_of, p_submitted_by, p_unknown_codes
  )
  -- Restating the index predicate is the whole point: it is what lets Postgres
  -- infer the partial index as the arbiter.
  ON CONFLICT (po_number) WHERE status = 'pending' AND po_number IS NOT NULL
  DO UPDATE SET
    -- A re-delivery of the same PO refreshes the open ticket rather than
    -- opening a second one. The body is replaced because the newest email is
    -- the one a retry should replay -- Coupa re-sends on revision, and replaying
    -- a superseded email would create the wrong PO.
    from_address  = EXCLUDED.from_address,
    subject       = EXCLUDED.subject,
    body          = EXCLUDED.body,
    reason        = EXCLUDED.reason,
    details       = EXCLUDED.details,
    on_behalf_of  = EXCLUDED.on_behalf_of,
    submitted_by  = EXCLUDED.submitted_by,
    unknown_codes = EXCLUDED.unknown_codes,
    updated_at    = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.queue_coupa_ingestion_failure(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) IS
  'Files a rejected Coupa email in the dead-letter queue, refreshing the open '
  'ticket when one already exists for the PO. service_role only.';

-- Not granted to `authenticated`: the guard above would reject them anyway, but
-- an ungrantable function cannot be probed at all.
REVOKE ALL ON FUNCTION public.queue_coupa_ingestion_failure(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_coupa_ingestion_failure(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[]) TO service_role;
