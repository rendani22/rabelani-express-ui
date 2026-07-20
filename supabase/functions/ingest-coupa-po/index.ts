// Edge Function: ingest-coupa-po
// Turns a Coupa purchase-order notification email into a Global PO
// (a `purchase_orders` row plus its `purchase_order_items` lines).
// Deno runtime for Supabase Edge Functions.
//
// TRANSPORT: deliberately transport-agnostic. It accepts a POSTed JSON
// envelope, so it works behind any inbound-mail provider (Mailgun/Postmark/
// SendGrid inbound parse, a Gmail Pub/Sub relay, an IMAP poller) as long as
// that provider maps its payload onto IngestRequest below. Nothing here polls
// a mailbox or holds mail credentials.
//
// AUTH: the caller is a mail provider, not a user, so there is no JWT --
// `verify_jwt = false` in config.toml, and the function authenticates on a
// shared secret instead. `From:` is NOT authentication (trivially spoofed); it
// only selects which of the delivered mails are Coupa POs. Anyone holding the
// secret can create purchase orders, so treat it as a credential.
//
// The created PO lands in `status = 'draft'` -- the RPC hardcodes that -- so a
// human still approves it on the Global PO page.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  COUPA_SENDER,
  htmlToText,
  parseCoupaPoEmail,
  resolveCoupaCustomer,
  type CoupaCustomerCandidate,
  type CoupaPo
} from '../_shared/coupa-po.ts'
import { buildIngestFailureEmail, type IngestFailure } from '../_shared/coupa-failure-email.ts'
import {
  buildIngestFailedAuditRow,
  buildIngestedAuditRow,
  type CoupaAuditRow,
  type CoupaFailureReason
} from '../_shared/coupa-audit.ts'
import { captureException } from '../_shared/sentry.ts'

/** The service-role client, needed by paths that run before it is built. */
type AdminClient = ReturnType<typeof createClient>

/** The envelope a forwarder must map its inbound-mail payload onto. */
interface IngestRequest {
  /** The envelope/header sender, e.g. `Coupa <do_not_reply@exxaro.coupahost.com>`. */
  from?: string
  subject?: string
  /** The text/plain part. Preferred. */
  text?: string
  /** The text/html part. Used only when `text` is absent. */
  html?: string
  /**
   * Set only by `retry-coupa-po`, naming the dead-letter row being replayed.
   *
   * Its presence changes three things, all for the same reason -- a retry has a
   * human watching it, where an inbound email does not:
   *   - the existing queue row is updated rather than a new one inserted;
   *   - support is not emailed again (the admin is already looking at it);
   *   - success resolves the row.
   *
   * A forwarder must never send this. It is not a trust boundary -- the shared
   * secret is -- but a forged value could only ever resolve or re-fail a row
   * that already exists.
   */
  failureId?: string
}

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Requested-With, X-Client-Info, apikey, Content-Type, X-Ingest-Secret',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  }
}

/** Compares without leaking the secret's contents through response timing. */
function secretMatches(provided: string, expected: string): boolean {
  const a = new TextEncoder().encode(provided)
  const b = new TextEncoder().encode(expected)
  // Length is not secret-dependent enough to matter, but bail before indexing.
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/**
 * Forwards a failed Coupa email to support, so a real purchase order that this
 * system could not record still reaches a person.
 *
 * Best-effort: a forwarding failure must not change what the caller is told
 * about the ingestion itself, so it is reported to Sentry and swallowed. Every
 * caller also captures its own exception, so nothing is lost if mail is down.
 *
 * This cannot loop back into ingestion: the alert is sent from EMAIL_FROM, and
 * ingestion only accepts mail whose sender is COUPA_SENDER.
 */
async function forwardToSupport(failure: IngestFailure): Promise<void> {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      await captureException(new Error('Cannot forward a failed Coupa email: RESEND_API_KEY is not set'), {
        level: 'error',
        logger: 'ingest-coupa-po',
        extra: { reason: failure.reason }
      })
      return
    }

    const to = Deno.env.get('SUPPORT_EMAIL') || 'rabelanimm@gmail.com'
    const { subject, html } = buildIngestFailureEmail(failure)

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Dispatch <noreply@example.com>',
        to: [to],
        subject,
        html
      })
    })

    if (!resp.ok) {
      await captureException(new Error(`Could not forward a failed Coupa email: ${await resp.text()}`), {
        level: 'error',
        logger: 'ingest-coupa-po',
        extra: { reason: failure.reason, to }
      })
    }
  } catch (err) {
    await captureException(err, { level: 'error', logger: 'ingest-coupa-po' })
  }
}

/**
 * Records the attempt in `audit_logs`, as the system rather than a user.
 *
 * Best-effort, exactly like `forwardToSupport`: the audit row is a record of
 * what happened, so failing to write it must never change what happened. A
 * created PO stays created; a rejected email stays rejected.
 *
 * The cost of that choice is that the dashboard's counts are a floor, not a
 * ledger -- if this insert fails, the attempt is invisible to the report. It is
 * still reported to Sentry, which is the backstop.
 */
async function recordAttempt(admin: AdminClient | null, row: CoupaAuditRow): Promise<void> {
  try {
    if (!admin) {
      // The failure happened before the client existed (a malformed body, or a
      // missing SUPABASE_* env var). Nothing to write with.
      await captureException(new Error('Cannot audit a Coupa ingestion attempt: no database client'), {
        level: 'error',
        logger: 'ingest-coupa-po',
        extra: { action: row.action }
      })
      return
    }
    const { error } = await admin.from('audit_logs').insert(row)
    if (error) throw new Error(error.message)
  } catch (err) {
    await captureException(err, {
      level: 'error',
      logger: 'ingest-coupa-po',
      extra: { action: row.action, reason: row.metadata.reason }
    })
  }
}

/**
 * Files the rejected email in the dead-letter queue so an admin can replay it.
 *
 * Best-effort, like every other side effect here -- but this one is the most
 * consequential to lose, because it is the only durable copy of the email
 * outside the mailbox. A failure to queue is therefore reported at `error`.
 *
 * On a retry, the existing row is updated instead: a replay of the same email
 * is the same problem, not a new one, and stacking rows would make the queue
 * count how many times someone pressed the button.
 */
async function queueFailure(
  admin: AdminClient | null,
  args: {
    failureId?: string
    reason: CoupaFailureReason
    details: string
    payload: IngestRequest | null
    body: string
    po: CoupaPo | null
    unknownCodes?: readonly string[]
  }
): Promise<boolean> {
  try {
    if (!admin) return false

    // A replay's row already exists and belongs to `retry-coupa-po`, which
    // knows which admin pressed the button and records the outcome itself.
    // Writing it from here too would mean two owners for one row.
    if (args.failureId) return true

    // Goes through an RPC rather than a PostgREST upsert: the open-ticket index
    // is partial, and only SQL can restate its predicate so Postgres will infer
    // it as the ON CONFLICT arbiter. See 20260717170000.
    const { error } = await admin.rpc('queue_coupa_ingestion_failure', {
      p_body: args.body,
      p_reason: args.reason,
      p_from_address: args.payload?.from ?? null,
      p_subject: args.payload?.subject ?? null,
      p_details: args.details,
      p_po_number: args.po?.poNumber ?? null,
      p_on_behalf_of: args.po?.onBehalfOf ?? null,
      p_submitted_by: args.po?.submittedBy ?? null,
      p_unknown_codes: args.unknownCodes?.length ? [...args.unknownCodes] : null
    })
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    await captureException(err, {
      level: 'error',
      logger: 'ingest-coupa-po',
      extra: { reason: args.reason, failureId: args.failureId }
    })
    return false
  }
}

/**
 * Closes an open ticket for a PO that has just been created by a fresh email
 * rather than a replay. Without this, fixing the data and letting the mailbox
 * re-deliver would leave the queue showing a problem that no longer exists.
 */
async function resolveOpenFailureForPo(
  admin: AdminClient | null,
  poNumber: string,
  purchaseOrderId: string | null
): Promise<void> {
  try {
    if (!admin) return
    const { error } = await admin
      .from('coupa_ingestion_failures')
      .update({
        status: 'resolved',
        resolved_at: new Date().toISOString(),
        purchase_order_id: purchaseOrderId
      })
      .eq('po_number', poNumber)
      .eq('status', 'pending')
    if (error) throw new Error(error.message)
  } catch (err) {
    await captureException(err, { level: 'error', logger: 'ingest-coupa-po', extra: { poNumber } })
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = buildCorsHeaders(origin)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  // Hoisted so the catch below can still forward the email it was working on --
  // an unexpected crash loses a real purchase order just as surely as a parse
  // failure does.
  let payload: IngestRequest | null = null
  let body = ''
  let po: CoupaPo | null = null
  // Hoisted too, because every failure path audits, including the ones that run
  // before the PO is parsed.
  let admin: AdminClient | null = null
  /**
   * Whether the rejected email made it into the dead-letter queue.
   *
   * Reported in the response because queueing is best-effort and swallows its
   * own errors -- which once meant a broken write path looked exactly like "no
   * failures", since the audit row and the dashboard count both succeeded
   * regardless. The forwarder logs this body, so a queue that has stopped
   * accepting rows is now visible from the outside.
   */
  let queued = false

  /** Every dead end audits, queues, and (usually) emails; only wording differs. */
  const reject = async (
    reason: CoupaFailureReason,
    failure: Omit<IngestFailure, 'from' | 'emailSubject' | 'body'>,
    extra?: { unknownCodes?: readonly string[] }
  ) => {
    await recordAttempt(
      admin,
      buildIngestFailedAuditRow({
        reason,
        details: failure.details,
        po,
        emailSubject: payload?.subject,
        unknownCodes: extra?.unknownCodes
      })
    )
    queued = await queueFailure(admin, {
      failureId: payload?.failureId,
      reason,
      details: failure.details,
      payload,
      body,
      po,
      unknownCodes: extra?.unknownCodes
    })
    // A retry is someone pressing a button and watching the result, so mailing
    // support would be telling them what their own screen is about to say --
    // and every press would do it again.
    if (!payload?.failureId) {
      await forwardToSupport({
        ...failure,
        emailSubject: payload?.subject,
        from: payload?.from,
        po,
        unknownCodes: extra?.unknownCodes,
        body
      })
    }
  }

  try {
    const expectedSecret = Deno.env.get('COUPA_INGEST_SECRET')
    if (!expectedSecret) {
      // Fail closed. An unset secret must never mean "let everyone in".
      await captureException(new Error('COUPA_INGEST_SECRET is not configured'), {
        level: 'fatal',
        logger: 'ingest-coupa-po'
      })
      return json({ error: 'Ingestion is not configured' }, 503)
    }

    const providedSecret = req.headers.get('X-Ingest-Secret') ?? ''
    if (!secretMatches(providedSecret, expectedSecret)) {
      return json({ error: 'Unauthorized' }, 401)
    }

    payload = (await req.json().catch(() => null)) as IngestRequest | null
    if (!payload) return json({ error: 'Body must be JSON' }, 400)

    // Sender selects Coupa mail out of whatever else the mailbox forwards. It
    // is not a security control -- the shared secret above is.
    const from = (payload.from ?? '').toLowerCase()
    if (!from.includes(COUPA_SENDER)) {
      // 202, not an error: forwarding a non-Coupa mail here is expected and
      // must not make the provider retry. Nothing is forwarded to support:
      // this is not a Coupa PO, so nothing was lost.
      return json({ ignored: true, reason: `Sender is not ${COUPA_SENDER}` }, 202)
    }

    body = payload.text?.trim()
      ? payload.text
      : payload.html
        ? htmlToText(payload.html)
        : ''

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    // Built before parsing, not after: a parse failure is itself an audited
    // outcome, and it needs a client to record itself with.
    //
    // The RPC below explicitly permits service_role, which is the only option
    // here -- a webhook has no authenticated user to satisfy its staff_profiles
    // check, and the audit row is attributed to the system actor instead.
    admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const parsed = parseCoupaPoEmail(body)
    if (!parsed.success) {
      // Coupa owns this template and can change it without notice, so a parse
      // failure is a real incident, not routine input validation.
      await captureException(new Error(`Coupa PO parse failed: ${parsed.error}`), {
        level: 'error',
        logger: 'ingest-coupa-po',
        extra: { subject: payload.subject, error: parsed.error }
      })
      await reject('unreadable_email', {
        reason: 'The email could not be read',
        details: parsed.error,
        action: 'Key this purchase order in by hand on the Global PO page, then mark it resolved in the ingestion queue there. If these emails keep failing, Coupa has probably changed its template and the parser needs updating — retrying will not help until it is.'
      })
      return json({ error: 'Could not parse the purchase order', details: parsed.error, queued }, 422)
    }
    po = parsed.data

    // Resolve Coupa item codes against inventory_items.sku.
    const codes = [...new Set(po.lines.map((l) => l.code))]
    const { data: inventoryRows, error: inventoryError } = await admin
      .from('inventory_items')
      .select('id, sku')
      .in('sku', codes)

    if (inventoryError) {
      throw new Error(`Inventory lookup failed: ${inventoryError.message}`)
    }

    const idBySku = new Map<string, string>()
    for (const row of (inventoryRows ?? []) as { id: string; sku: string }[]) {
      idBySku.set(row.sku, row.id)
    }

    const unknownCodes = codes.filter((code) => !idBySku.has(code))
    if (unknownCodes.length > 0) {
      // Hard-fail the whole PO rather than dropping the unmatched lines. The
      // RPC would reject a partial payload anyway, and a purchase order that
      // silently lost a line is worse than one that was never created: the
      // second is visible, the first is not.
      await captureException(new Error(`Coupa PO ${po.poNumber} references unknown item codes`), {
        level: 'error',
        logger: 'ingest-coupa-po',
        extra: { poNumber: po.poNumber, unknownCodes }
      })
      await reject(
        'unknown_item_codes',
        {
          reason: 'Some item codes are not in the inventory',
          details: `No inventory item has SKU ${unknownCodes.join(', ')}.`,
          action: `Add an inventory item for each missing code (its SKU must be the Coupa item code), then press Retry on the Global PO page — this email is queued there.`
        },
        { unknownCodes }
      )
      return json(
        {
          error: 'Unknown item codes',
          details: `No inventory item has SKU ${unknownCodes.join(', ')}. Add the item(s), then retry from the Global PO page.`,
          unknownCodes,
          queued
        },
        422
      )
    }

    // Resolve the customer from the person named on the email. Inactive
    // customers are excluded: filing a live order against a deactivated
    // customer is a decision for a human, not a silent match.
    const { data: customerRows, error: customerError } = await admin
      .from('receiver_profiles')
      .select('id, name, surname')
      .eq('is_active', true)

    if (customerError) {
      throw new Error(`Customer lookup failed: ${customerError.message}`)
    }

    const customer = resolveCoupaCustomer(po, (customerRows ?? []) as CoupaCustomerCandidate[])
    if (!customer.success) {
      // Refuse the whole PO rather than record it with no customer: a PO with
      // no customer is invisible to the company-scoped dashboards, so it would
      // be lost in a way nobody notices. An exception a person reads is better.
      await captureException(new Error(`Coupa PO ${po.poNumber} has no matching customer`), {
        level: 'error',
        logger: 'ingest-coupa-po',
        extra: { poNumber: po.poNumber, onBehalfOf: po.onBehalfOf, submittedBy: po.submittedBy }
      })
      await reject('unknown_customer', {
        reason: 'The customer could not be identified',
        details: customer.error,
        action: `Add the customer (their name and surname together must match the name on this email exactly), then press Retry on the Global PO page — this email is queued there. If they are already a customer, check that they are active and that the spelling matches.`
      })
      return json({ error: 'Unknown customer', details: customer.error, queued }, 422)
    }

    const { data: created, error: rpcError } = await admin.rpc('create_purchase_order_with_items', {
      p_po_number: po.poNumber,
      p_items: po.lines.map((line) => ({
        inventory_item_id: idBySku.get(line.code),
        ordered_quantity: line.quantity
      })),
      p_receiver_id: customer.receiverId,
      p_po_value: po.total,
      p_po_date: po.poDate,
      p_details: `Ingested from Coupa email${payload.subject ? `: ${payload.subject}` : ''} (customer matched on ${customer.source}: ${customer.matchedName})`
    })

    if (rpcError) {
      // 23505 = unique_violation on purchase_orders.po_number. Coupa re-issues
      // POs on revision, and how to apply a revision is still an open decision,
      // so refuse loudly rather than pick one silently.
      if (rpcError.code === '23505') {
        await captureException(new Error(`Coupa PO ${po.poNumber} already exists (revision?)`), {
          level: 'warning',
          logger: 'ingest-coupa-po',
          extra: { poNumber: po.poNumber }
        })
        await reject('already_recorded', {
          reason: 'This purchase order is already recorded',
          details: `${po.poNumber} already exists. Coupa re-sends a PO when it is revised, so this email may carry changed quantities.`,
          action: `Compare the lines below against ${po.poNumber} on the Global PO page and apply any changes by hand. Revisions are never applied automatically.`
        })
        return json(
          {
            error: 'Purchase order already exists',
            details: `${po.poNumber} is already recorded. Revisions are not applied automatically -- update it by hand.`,
            poNumber: po.poNumber,
            queued
          },
          409
        )
      }
      throw new Error(`Could not create the purchase order: ${rpcError.message}`)
    }

    const purchaseOrderId = (created as { purchase_order_id: string }[] | null)?.[0]?.purchase_order_id ?? null

    if (purchaseOrderId) {
      await recordAttempt(
        admin,
        buildIngestedAuditRow({
          purchaseOrderId,
          po,
          receiverId: customer.receiverId,
          matchedOn: customer.source,
          emailSubject: payload.subject
        })
      )
    }

    // A replay's row is closed by `retry-coupa-po`, which owns it. This closes
    // the other case: a *fresh* email that finally succeeds because someone
    // fixed the data and let the mailbox re-deliver. Without it the queue would
    // still show a problem for an order that now exists.
    if (!payload.failureId) {
      await resolveOpenFailureForPo(admin, po.poNumber, purchaseOrderId)
    }

    return json({
      success: true,
      purchase_order_id: purchaseOrderId,
      po_number: po.poNumber,
      lines: po.lines.length,
      total: po.total
    })
  } catch (err) {
    await captureException(err, { level: 'error', logger: 'ingest-coupa-po' })
    const details = err instanceof Error ? err.message : String(err)

    // Only forward once the sender check has passed -- before that, `body` is
    // empty and this may not even be a Coupa email. The same bar applies to the
    // audit row: a non-Coupa mail is not a failed ingestion, and counting it as
    // one would make the dashboard's failure figure meaningless.
    if (body) {
      await reject('unexpected_error', {
        reason: 'Something went wrong while recording the purchase order',
        details,
        action: 'Report the error above. This email is queued on the Global PO page — press Retry once the cause is fixed, or key the PO in by hand and mark it resolved.'
      })
    }

    return json({ error: 'Ingestion failed', details, queued }, 500)
  }
})
