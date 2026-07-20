// Edge Function: send-test-email
// Sends a one-off TEST copy of an email-template preview to an address so an
// admin can see the real rendered email in their inbox before it goes live.
// Admin-only. Delivers the exact subject/html the editor's live preview built
// (including unsaved edits), prefixed with "[TEST]". Deno runtime.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { captureException } from '../_shared/sentry.ts'

interface SendTestRequest {
  to: string
  subject: string
  html: string
}

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, X-Requested-With, X-Client-Info, apikey, Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = buildCorsHeaders(origin)
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    // Verify caller is an active admin via their own JWT (editing email templates
    // is admin-only, so test sends are too).
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user: caller }, error: userError } = await userClient.auth.getUser()
    if (userError || !caller) return json({ error: 'Unauthorized', details: userError?.message }, 401)

    const { data: canSendTest } = await userClient.rpc('has_permission', {
      p_key: 'email.send_test'
    })
    if (!canSendTest) {
      return json({ error: "You do not have permission to send test emails ('email.send_test')" }, 403)
    }

    const body: SendTestRequest = await req.json()
    const to = body.to?.trim().toLowerCase()
    const subject = (body.subject ?? '').toString()
    const html = (body.html ?? '').toString()

    if (!to || !EMAIL_RE.test(to)) return json({ error: 'Invalid recipient email' }, 400)
    if (!html.trim()) return json({ error: 'Nothing to send: empty email body' }, 400)

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return json({ error: 'Email not configured', details: 'RESEND_API_KEY is not set' }, 500)
    }

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Rabelani Express <noreply@example.com>',
        to: [to],
        subject: `[TEST] ${subject}`,
        html,
      }),
    })
    if (!resp.ok) {
      return json({ error: 'Could not send the test email', details: await resp.text() }, 502)
    }

    return json({ success: true, sent_to: to })
  } catch (e) {
    captureException(e)
    return json({ error: 'Unexpected error', details: e instanceof Error ? e.message : String(e) }, 500)
  }
})
