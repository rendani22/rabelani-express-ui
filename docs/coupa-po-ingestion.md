# Coupa → Global PO ingestion

Turns the purchase-order notification emails Coupa sends on Exxaro's behalf
(from `do_not_reply@exxaro.coupahost.com`) into a Global PO — a `purchase_orders`
row plus its `purchase_order_items` lines.

## How it fits together

```
Gmail (Coupa's notifications)
  │  Apps Script, every minute
  │  scripts/coupa-gmail-forwarder
  └────────────POST────────────▶  supabase/functions/ingest-coupa-po
     X-Ingest-Secret                │
                                    ├─ shared-secret auth (COUPA_INGEST_SECRET)
                                    ├─ parse  ─▶ _shared/coupa-po.ts
                                    ├─ resolve line codes ─▶ inventory_items.sku
                                    ├─ resolve customer ─▶ receiver_profiles
                                    │    (On Behalf Of, else Submitted By)
                                    └─ create_purchase_order_with_items (service_role)
                                                                │
                                                    purchase_orders (status='draft')
```

`create_purchase_order_with_items` hardcodes `status = 'draft'`, so every
ingested PO still gets a human on the Global PO page before it means anything.

## Decisions

| # | Decision | Consequence |
|---|---|---|
| 1 | "Global PO" = a `purchase_orders` row (`nav-items.ts:44` is just the label). | Ingestion goes through `create_purchase_order_with_items`, which needs ≥1 line with a valid `inventory_item_id`. |
| 2 | Only the **total** price matters. Per-line unit prices (74.06 / 88.88) are discarded. | `po_value` = the email total. No line-pricing migration. `purchase_order_items` has nowhere to put a unit price. |
| 3 | `inventory_items.sku` **is** the Coupa item code, and is now required. | `20260717120000_inventory_sku_required.sql`. Distinct codes (37869 vs 37865) keep the near-identical voucher descriptions apart, so the `UNIQUE (purchase_order_id, inventory_item_id)` constraint can't silently sum them into one line. |
| 4 | Unknown item codes hard-fail the whole PO. | A PO that silently lost a line is worse than one never created: the second is visible, the first is not. |
| 5 | `po_number` has a canonical form (trim + uppercase) applied on every write. | `normalizePoNumber` in `src/lib/models/package.ts`, mirrored in `_shared/coupa-po.ts` (edge functions can't import from `src/`). |
| 6 | The **customer is the person named on the email**, not Exxaro and not the GG01 ship-to: `On Behalf Of` first, `Submitted By` only as a fallback. | `resolveCoupaCustomer` matches that name against active `receiver_profiles`. The buyer/supplier/ship-to blocks are ignored for this purpose. |
| 7 | An unmatched, ambiguous, or absent name is an **exception**: no PO is created and the email is forwarded to support. | Same rationale as #4 — a PO filed against no customer is invisible to the company-scoped dashboards, so it is lost silently. |
| 8 | The full name is matched **whole** (case- and space-insensitively) against `name || ' ' || surname`. | Coupa states one string ("Ramadimetja Maria Mochaki"); where the name/surname split falls is a guess, and this is the only comparison that doesn't depend on guessing it right. |
| 9 | **Every attempt is audited**, success or failure, into `audit_logs` — not a new table. | The rows are audit records first ("this PO came from a Coupa email, matched on this name") and a report second. A dedicated table would duplicate `audit_logs`' shape, append-only RLS and indexes, and still need joining back to the PO. |
| 10 | The actor is the **all-zeros system uuid**, not a user. | `performed_by` is NOT NULL and a webhook has no `auth.uid()`. This reuses the existing convention — `audit_table_changes()` and the phase-5 policy trigger already record `COALESCE(auth.uid(), '00000000-…')`. No migration, no fake user. |
| 11 | The ingestion report is **network-wide, never company-scoped**. | A failed ingestion has no PO and so no customer — frequently that *is* the failure. Scoped, it could only show successes and would report a 0% failure rate however much was being dropped. The card hides when the dashboard is company-scoped. |
| 12 | Coupa notifications that are **not** purchase orders are dropped by name, not by shape. | `matchNonPoNotification` in `_shared/coupa-po.ts` carries one entry per recognised kind (today: service sheets, invoices). A match returns `202 {ignored:true}` before any database work — no queue row, no audit row, no Sentry event, no support mail, exactly like a non-Coupa sender. Anything of an *unrecognised* shape still fails loudly, which is the point: "unreadable" has to stay an alarm, because Coupa owns the PO template and can change it without warning. Adding a kind is one line; it never fires on an email stating a `PO ID`. |
| 13 | A **rejected ingestion is not a Sentry event**. The dead-letter queue is where it is raised. | `unreadable_email`, `unknown_item_codes`, `unknown_customer` and `already_recorded` audit, queue and mail support, and then stop. Each one already has a durable copy of the email, a row on the Global PO page, a Retry button and an owner — a Sentry event on top is a duplicate alert nobody can clear, and it makes the issue feed noisy enough to hide the real ones. Sentry still fires for what the queue *cannot* show: an unset `COUPA_INGEST_SECRET`, an unhandled throw (`unexpected_error`), and any failure of the queue/audit/forward-to-support machinery itself — the cases where the retry path is the thing that broke. |

## Built

- **`supabase/migrations/20260717120000_inventory_sku_required.sql`** — `sku`
  NOT NULL + non-blank CHECK. **Fails on deploy if any row has a null/blank
  sku** — deliberately, see "Before deploying" below.
- **`supabase/functions/_shared/coupa-po.ts`** — the parser and `htmlToText`.
  Pure, no Deno APIs, 100% covered by `coupa-po.test.ts` from the main vitest
  run. Parses the authoritative "Lines" block, not the "Items" summary. An
  entry is read whether Coupa states it on one row (`49 PKT 37869 - … for …`)
  or splits the quantity and unit onto their own — it sends both.
- **`supabase/functions/ingest-coupa-po/`** — the webhook. Transport-agnostic:
  any provider that maps its payload onto `IngestRequest` works.
- **`supabase/functions/_shared/coupa-audit.ts`** — the audit row builders and
  the closed set of failure reason codes. Pure, 100% covered. The codes are
  typed constants because `get_coupa_ingestion_report` groups on
  `metadata->>'reason'`: a typo would not fail anything, it would quietly file a
  failure under a category nobody reads.
- **`supabase/migrations/20260717130000_coupa_ingestion_report.sql`** — the
  report RPC + a composite `(action, created_at)` index on `audit_logs`.
- **`supabase/migrations/20260717140000_fix_create_po_service_role_detection.sql`**
  — `create_purchase_order_with_items` read the *legacy* PostgREST GUC
  (`request.jwt.claim.role`) to spot service_role. Current PostgREST only sets
  `request.jwt.claims`, so the bypass never fired and every service_role call
  died on "Authentication required". Latent until now: the Global PO page calls
  the RPC as a logged-in user, and this webhook is its first service_role
  caller. Fixed to `COALESCE(auth.role(), ...)` — the form its sibling
  `update_purchase_order_with_items` already used.
- **Executive dashboard card** — "Coupa PO Ingestion", processed vs failed over
  30 days with a worst-first breakdown of why. Hidden when company-scoped
  (decision 11) and when the migration isn't deployed (`available: false`).
- **Customer assignment** — the parser reads `On Behalf Of` / `Submitted By`,
  and `resolveCoupaCustomer` matches the name against active
  `receiver_profiles` to fill `p_receiver_id`. No match, an ambiguous match, or
  neither field stated → no PO, an exception email to support, and a 422.
  `purchase_orders.details` records which field the match came from.
- **`po_number` normalization** — `create-package` (packages) and
  `createPurchaseOrder`/`updatePurchaseOrder` (purchase orders) now write the
  canonical form; `loadPurchaseOrders` buckets and matches on it, and the two
  lookup-by-number paths use case-insensitive `ilike` so rows written *before*
  this change still resolve.

  This is what stops `gg80700992` and `GG80700992` rendering as two rows on the
  Global PO page. The dedupe itself was already there
  (`purchase-orders.ts:621` only fabricates a synthetic PO for numbers absent
  from `purchase_orders`) — it was the string comparison that was leaky.

## Before deploying

1. **Backfill `inventory_items.sku`** with Coupa codes. The migration fails
   until every row has one. There is no safe automatic default: an invented
   code occupies the same unique namespace the parser searches and could later
   collide with a real Coupa code. **This is a human with the Coupa catalogue,
   not engineering time.**
2. **Check the requesters exist as customers**, spelled as Coupa spells them —
   `name` + `surname` must join to exactly the `On Behalf Of` name on the email
   (case and spacing don't matter; a middle name does). Every order from someone
   missing or inactive goes to the exception path instead of becoming a PO.
3. **Set `COUPA_INGEST_SECRET`** (`supabase secrets set`). The function fails
   closed (503) while it is unset.
4. **Point a forwarder at the function** — see "Monitoring the mailbox" below.
   Any provider works that maps onto `IngestRequest` (`{ from, subject, text,
   html }`) and sends the secret as `X-Ingest-Secret`.
5. **Set `SENTRY_DSN`** — not for rejections (those live in the queue, see
   below), but for the cases the queue cannot show: an unset secret, an
   unhandled throw, or a failure of the queue/audit/mail machinery itself.

## Monitoring the mailbox

Nothing in this repo polls a mailbox. The function is a webhook; a forwarder has
to call it. The chosen forwarder is **Google Apps Script bound to the mailbox
Coupa already sends to** (`rabelanimm@gmail.com` in the sample) — no domain, no
MX records, and no address change in the Coupa Supplier Portal.

The script is `scripts/coupa-gmail-forwarder/Code.gs`. It lives here to be
reviewable, but it runs in Apps Script — editing it here changes nothing until
it is pasted over there.

**Why not Resend, which we already pay for:** its inbound webhook delivers
*metadata only* (no body — you must call the Received Emails API for that) and
authenticates with Svix signatures rather than a custom header. Both are things
this function needs. Using Resend means rewriting the function's auth and adding
a fetch; Apps Script needs neither.

### Setup

1. **Deploy the database + function.**
   ```bash
   supabase db push                              # incl. the sku + report migrations
   supabase secrets set COUPA_INGEST_SECRET=...  # generate: openssl rand -hex 32
   supabase functions deploy ingest-coupa-po
   ```
   `db push` **fails** until every `inventory_items` row has a Coupa sku — that
   gate is deliberate, see "Before deploying".

2. **Smoke-test it before touching mail.** Paste the sample email body from
   `_shared/coupa-po.test.ts` as `text`:
   ```bash
   curl -i -X POST https://qmnqffpwvsvngjmyisrf.supabase.co/functions/v1/ingest-coupa-po \
     -H 'Content-Type: application/json' \
     -H "X-Ingest-Secret: $COUPA_INGEST_SECRET" \
     -d '{"from":"Coupa <do_not_reply@exxaro.coupahost.com>","subject":"Purchase Order #TEST1","text":"...body..."}'
   ```
   A 401 means the secret is wrong; 503 means it is unset. Expect a 422 naming
   the customer or the item codes until both exist — that is the system working,
   and support gets the email.

3. **Create the Apps Script project** at [script.google.com](https://script.google.com),
   signed in **as the mailbox account** (the script's `GmailApp` calls read
   whichever account owns the project — this is the one step that silently does
   nothing if you get it wrong: a project owned by another account will find no
   Coupa mail and report success). Paste `Code.gs`.

4. **Script Properties** (Project Settings → Script Properties) — never in code:
   - `COUPA_INGEST_SECRET` — the same value as step 1
   - `INGEST_URL` — `https://qmnqffpwvsvngjmyisrf.supabase.co/functions/v1/ingest-coupa-po`

5. **Run `forwardCoupaEmails` once by hand** to grant the Gmail/external-request
   scopes, then run `installTrigger` once to schedule it every minute.

### Testing the forwarder

Paste `Tests.gs` alongside `Code.gs`, pick a `test_*` function from the editor's
dropdown, Run, and read the Execution log. They pass fake message/thread objects
into `handleMessage` — it only calls four getters and `addLabel`, and Apps Script
is untyped — so nothing in the mailbox is touched.

Start with `test_mailboxIsCorrect`: it prints the account and how many Coupa
threads it can see. A project owned by the wrong Google account is the failure
this setup is most likely to hit, and it looks exactly like a quiet week.

**The tests POST for real.** The function audits every attempt, so a test run
lands on the Executive card and a rejection emails support — as far as the
function is concerned it *is* a real email. Point `INGEST_URL` at int while
testing, and note `TEST_PO_NUMBER` is a throwaway: `po_number` is UNIQUE, so
testing with a genuine number burns it and the real email would later 409.

`test_badSecretIsRetriedNotDropped` is the one worth running deliberately — it
proves a 401 leaves the email unlabelled and queued, rather than dropping it.

### Watching it

- **Gmail** — `Coupa/Ingested` and `Coupa/Exception` labels are the fastest read
  on what happened to any individual email.
- **Executive dashboard → Coupa PO Ingestion** — processed vs failed over 30
  days, with the reasons broken down.
- **Apps Script → Executions** — the forwarder's own failures (an unreachable
  function, a bad secret) never reach the dashboard, because the dashboard only
  knows about attempts that arrived.

A rejected email (422/409) is **terminal for the forwarder**: the function has
already audited it, queued it, and emailed support, so re-posting would email
support again and re-count the failure. The script labels it and moves on. Only
503/401 and network errors retry, because those record nothing.

Retrying is the **queue's** job, not the forwarder's — see below.

## Retrying a failed ingestion

Every rejected email is stored in `coupa_ingestion_failures` with its original
body, and surfaces on the **Global PO page** above the stats — that is the page
whose numbers are wrong while a row sits there. Fix the cause (add the customer,
add the SKU), press **Retry**, and `retry-coupa-po` replays the stored email
through `ingest-coupa-po`. There is only one ingestion pipeline; a retry *is*
ingestion, run again.

- **Gated on `purchase_orders.ingest.retry`** — admin-only by default, and
  sensitive: the rows hold raw purchase-order documents.
- **A rejected retry is not an error.** It resolves with `success: false` and
  the new reason. The retry worked; the data still isn't fixed.
- **`already_recorded` is never retryable** — the PO exists, so a replay can
  only 409. Compare and apply the revision by hand.
- **Ignore** takes a row off the queue without ingesting it (a test, or an order
  keyed in by hand). It is not a delete: the email really did arrive and really
  did fail, and `audit_logs` still says so.
- A **fresh** email that finally succeeds also closes any open row for its PO,
  so fixing the data and letting the mailbox re-deliver doesn't strand a ticket.

## Open — decide before this runs unattended

- [ ] **`po_number` backfill.** Normalization is going-forward only. Existing
      mixed-case rows stay as they are; the `ilike` read paths paper over it.
      A backfill (`update … set po_number = upper(btrim(po_number))`) is *not*
      written, because on `purchase_orders` it can hit the unique constraint
      when two rows differ only by case — that is a merge decision, not a
      migration.
- [ ] **PO revisions.** `po_number` is UNIQUE; Coupa re-issues POs (the sample
      carries both an Order Date and a Revision Date). The function currently
      returns **409 and refuses**. Decide: update in place / suffix `-R2` /
      ignore. If update — what happens to `purchase_order_item_allocations`
      already made against the old quantities?
- [ ] **Idempotency / replay.** Same email delivered twice, or a mailbox
      replayed after an outage. Today the second attempt 409s, which is safe
      but noisy, and indistinguishable from a real revision.
- [ ] **Customer matching is by name, and names are not keys.** Decisions 6–8
      resolve the customer from `On Behalf Of` / `Submitted By`, but a rename, a
      typo, or a middle name Coupa carries and we don't sends the order to the
      exception path. That is deliberate (visible beats silent), but if these
      exceptions become routine, the fix is an explicit mapping — a Coupa
      identifier on `receiver_profiles` — not fuzzier matching.
- [ ] **Trust.** Auth is a shared secret; `From:` is only a selector, since it
      is trivially spoofed. If the secret is not enough, add DKIM/SPF
      verification at the forwarder.
- [ ] **Who is paged.** Failures are no longer silent from the app's side — they
      are audited, counted on the Executive card, queued for replay, and
      emailed to support. But nothing *pages* anyone: the card is pull, not
      push, and per decision #13 a rejection no longer raises a Sentry event. If
      a Coupa template change breaks every email overnight, the alarm is the
      support mailbox and the next person to open the dashboard. If that turns
      out to be too slow, the fix is a threshold alert on the queue ("N
      unreadable in an hour"), not putting every rejection back into Sentry.
- [ ] **The counts are a floor, not a ledger.** The audit insert is best-effort
      (a failed insert must not fail the ingestion), so an attempt whose audit
      row could not be written is invisible to the report. Sentry is the backstop.
- [ ] **PO document.** `create-po-dialog.tsx:64` makes the document mandatory
      client-side (the DB/RPC do not). The email has no attachment, only a
      "View Order" portal link, so ingested POs have `document_url = null`.
      Decide: relax the UI rule, snapshot the email HTML, or scrape Coupa.
- [ ] **Date format.** Coupa renders MM/DD/YYYY. `07/15/2026` is unambiguous
      only because 15 > 12. If Coupa ever emits `05/06/2026`, the parser reads
      May 6 and cannot tell it was meant to be 5 June.
- [ ] **Currency.** `po_value` has no currency column, so the parser rejects
      any non-ZAR total rather than record it as rands.
