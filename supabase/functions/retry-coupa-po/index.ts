// Edge Function: retry-coupa-po
// Replays a queued Coupa email through ingestion, on an admin's say-so.
//
// WHY THIS IS A SEPARATE FUNCTION FROM ingest-coupa-po
// They have opposite auth models. `ingest-coupa-po` is called by a mail
// forwarder with no user and authenticates on a shared secret; this is called
// by a logged-in admin from the browser and authenticates on their JWT. Folding
// both into one function would mean one endpoint with two ways in, and the
// shared secret would have to be reachable from a path a browser can call.
//
// Instead this function holds the secret and calls the other over HTTP, so the
// ingestion pipeline has exactly one implementation. A retry is not a
// re-implementation of ingestion -- it IS ingestion, run again on a stored
// email.
//
// It owns the queue row's lifecycle: it records the attempt before calling, and
// the outcome after. `ingest-coupa-po` deliberately does not touch a row it was
// given a `failureId` for -- two writers, one row, is how counters drift.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { captureException } from '../_shared/sentry.ts'

interface RetryRequest {
  /** The `coupa_ingestion_failures` row to replay. */
  failureId?: string
}

interface FailureRow {
  id: string
  from_address: string | null
  subject: string | null
  body: string
  status: string
  retry_count: number
}

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Requested-With, X-Client-Info, apikey, Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400'
  }
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = buildCorsHeaders(origin)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Scoped to the caller, so has_permission() and RLS both evaluate as them.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const { data: allowed, error: permError } = await userClient.rpc('has_permission', {
      p_key: 'purchase_orders.ingest.retry'
    })
    if (permError) throw new Error(`Permission check failed: ${permError.message}`)
    if (!allowed) return json({ error: 'Not authorized to retry Coupa ingestion' }, 403)

    const payload = (await req.json().catch(() => null)) as RetryRequest | null
    if (!payload?.failureId) return json({ error: 'failureId is required' }, 400)

    // Read through the user's client so RLS is the gate on which rows are even
    // visible, rather than trusting the permission check alone.
    const { data: failure, error: loadError } = await userClient
      .from('coupa_ingestion_failures')
      .select('id, from_address, body, subject, status, retry_count')
      .eq('id', payload.failureId)
      .maybeSingle()

    if (loadError) throw new Error(`Could not load the failure: ${loadError.message}`)
    if (!failure) return json({ error: 'No such failed ingestion' }, 404)

    const row = failure as FailureRow
    if (row.status !== 'pending') {
      // Refuse rather than replay: a resolved row's PO already exists, so this
      // would only ever produce a duplicate 409 and a confusing retry_count.
      return json({ error: `This ingestion is already ${row.status}.` }, 409)
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Record the attempt BEFORE making it. If the call throws or times out, the
    // count still reflects that someone tried -- an attempt that vanishes
    // because it failed is the one you most want to see.
    //
    // Read-then-write on retry_count is not atomic. Two admins pressing at the
    // same instant could lose a count; nothing else is affected, and the cure
    // (an RPC, or a lock) is not worth the machinery for a button a human
    // presses.
    await admin
      .from('coupa_ingestion_failures')
      .update({ retry_count: row.retry_count + 1, last_retry_at: new Date().toISOString() })
      .eq('id', row.id)

    const ingestSecret = Deno.env.get('COUPA_INGEST_SECRET')
    if (!ingestSecret) {
      await captureException(new Error('COUPA_INGEST_SECRET is not configured'), {
        level: 'fatal',
        logger: 'retry-coupa-po'
      })
      return json({ error: 'Ingestion is not configured' }, 503)
    }

    const ingestResponse = await fetch(`${supabaseUrl}/functions/v1/ingest-coupa-po`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Ingest-Secret': ingestSecret },
      body: JSON.stringify({
        // Replayed verbatim. The stored body is what actually arrived; anything
        // tidied on the way back in would test a different email.
        from: row.from_address ?? undefined,
        subject: row.subject ?? undefined,
        text: row.body,
        failureId: row.id
      })
    })

    const result = await ingestResponse.json().catch(() => ({}))

    if (ingestResponse.ok && (result as { success?: boolean }).success) {
      const purchaseOrderId = (result as { purchase_order_id?: string }).purchase_order_id ?? null
      const { error: resolveError } = await admin
        .from('coupa_ingestion_failures')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          purchase_order_id: purchaseOrderId,
          last_error: null
        })
        .eq('id', row.id)
      if (resolveError) throw new Error(`Created the PO but could not close the ticket: ${resolveError.message}`)

      return json({ success: true, purchase_order_id: purchaseOrderId, po_number: (result as { po_number?: string }).po_number })
    }

    // Still failing. Keep it pending -- the point of the queue is that it stays
    // visible until the order actually exists -- and record why, so the admin
    // can see whether their fix changed anything.
    const detail =
      (result as { details?: string; error?: string }).details ??
      (result as { error?: string }).error ??
      `Ingestion returned ${ingestResponse.status}`

    await admin.from('coupa_ingestion_failures').update({ last_error: detail }).eq('id', row.id)

    return json({ success: false, status: ingestResponse.status, details: detail }, 200)
  } catch (err) {
    await captureException(err, { level: 'error', logger: 'retry-coupa-po' })
    return json({ error: 'Retry failed', details: err instanceof Error ? err.message : String(err) }, 500)
  }
})
