-- ============================================================================
-- A POD is final from the moment it exists
--
-- THE RULE
-- A proof of delivery becomes final when the order is delivered or collected.
--
-- A pods row is only ever written at completion: update-package inserts it in
-- the same call that moves the order to collected, and already refuses to write
-- a second one ("Row already exists and is immutable -- nothing to do"). There
-- is no path that creates a POD before completion and no path that creates one
-- after. So "final at completion" and "final on insert" are the same sentence,
-- and the rule needs no flag, no state column and no timestamp to express --
-- which is precisely why is_locked only ever held one value, and why dropping
-- it in 20260721170000 lost nothing.
--
-- WHAT WAS ACTUALLY EXPOSED
-- Until now the pods RLS policy let anyone holding orders.update rewrite any
-- POD: signatures, receiver name, witness, completion status, timestamps. The
-- trigger that was supposed to prevent that keyed off is_locked and so never
-- fired once. For a product whose pitch is that a dispute is settled by the
-- record rather than an argument, the record was editable by every operator in
-- the depot. This closes that.
--
-- THE ONE PERMITTED LATER WRITE: THE PDF
-- pdf_url / pdf_path / pdf_generated_at are not in update-package's insert
-- payload -- this app only ever reads them -- yet PODs carry them (the bulk
-- export has a "PDF already stored server-side" fast path). They are written by
-- something outside this repo, which AGENTS.md/CLAUDE.md warn about: some
-- deployed edge functions are not vendored here. Blocking all updates would
-- break that writer.
--
-- It is also the right cut on the merits. The PDF is a *rendering* of the
-- evidence, produced after the fact; the evidence is the signatures and the
-- names. So: the evidence freezes on insert, and the PDF may be attached once.
--
-- HOW THE COMPARISON IS DONE
-- to_jsonb(NEW) minus the three pdf keys, against the same for OLD. Comparing
-- whole rows rather than listing columns means a column added to pods in future
-- is frozen by default and someone has to come here and think before exempting
-- it. Defaults should fail safe.
--
-- ESCAPE HATCH
-- A deliberate, reviewed data repair (the delivery_photo_url backfill in
-- 20260717160000 was one) must disable the trigger explicitly:
--
--     ALTER TABLE public.pods DISABLE TRIGGER trigger_pod_immutable;
--     -- ... the repair ...
--     ALTER TABLE public.pods ENABLE TRIGGER trigger_pod_immutable;
--
-- That is the point: correcting a POD becomes a migration someone reviews, not
-- an UPDATE anyone with orders.update can run.
-- ============================================================================


-- ── The evidence is frozen; the PDF may be attached once ────────────────────
CREATE OR REPLACE FUNCTION public.enforce_pod_immutability()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  -- The only columns that may change after the POD is written.
  k_pdf CONSTANT TEXT[] = ARRAY['pdf_url', 'pdf_path', 'pdf_generated_at'];
BEGIN
  IF (to_jsonb(NEW) - k_pdf) IS DISTINCT FROM (to_jsonb(OLD) - k_pdf) THEN
    RAISE EXCEPTION
      'POD_IMMUTABLE: POD % is final -- it was signed off when order % was completed and cannot be altered. Only the generated PDF may be attached afterwards.',
      OLD.pod_reference, OLD.package_reference
      USING ERRCODE = '42501';
  END IF;

  -- Write-once, so a stored PDF cannot be swapped for a different document
  -- later. Re-attaching the identical URL is a no-op and stays allowed, so a
  -- retrying generator is not punished for being idempotent.
  IF OLD.pdf_url IS NOT NULL AND NEW.pdf_url IS DISTINCT FROM OLD.pdf_url THEN
    RAISE EXCEPTION
      'POD_PDF_IMMUTABLE: POD % already has a stored PDF; it cannot be replaced.',
      OLD.pod_reference
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.enforce_pod_immutability() IS
  'Freezes a POD on insert -- it is final from completion. Only pdf_url/pdf_path/'
  'pdf_generated_at may be written afterwards, and only once. Runs for every '
  'caller including service_role, which is the point: RLS cannot bind the admin '
  'client, a trigger can.';

DROP TRIGGER IF EXISTS trigger_pod_immutable ON public.pods;
CREATE TRIGGER trigger_pod_immutable
  BEFORE UPDATE ON public.pods
  FOR EACH ROW EXECUTE FUNCTION public.enforce_pod_immutability();


-- ── No client may update a POD at all ───────────────────────────────────────
-- Defence in depth, and behaviour-preserving: nothing in the app updates a POD
-- from the browser. The only writer is update-package's admin client, which
-- bypasses RLS anyway and is bound by the trigger above instead. Leaving a
-- permissive UPDATE policy in place would keep saying that rewriting a POD is
-- an ordinary thing an operator may do.
DROP POLICY IF EXISTS "Can update PODs" ON public.pods;

COMMENT ON TABLE public.pods IS
  'Proof-of-delivery records. Append-only: final from the moment they are '
  'written (which is order completion), and undeletable. Insert via '
  'update-package; the only permitted later write is attaching the generated '
  'PDF. See enforce_pod_immutability() and prevent_pod_deletion().';


-- ── prevent_pod_deletion: drop an audit write that never happened ───────────
-- The function INSERTed a POD_DELETE_ATTEMPT row and then RAISEd. The raise
-- aborts the transaction, so that insert has always been rolled back with it --
-- the audit trail it appears to keep has never contained a single row. Better
-- to say plainly that deletion is refused than to look like it is recorded.
--
-- (If attempted deletions genuinely need recording, it takes a mechanism that
-- survives a rollback -- a separate connection or an autonomous worker -- not
-- an INSERT in the doomed transaction. That is a different piece of work.)
CREATE OR REPLACE FUNCTION public.prevent_pod_deletion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RAISE EXCEPTION
    'POD_DELETE_DENIED: POD records cannot be deleted. Record: %, Package: %',
    OLD.pod_reference, OLD.package_reference
    USING ERRCODE = '42501';
END;
$function$;
