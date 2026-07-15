// Edge Function: invite-customer
// Invites a customer (Buyer/Runner) to the portal: creates/links their auth
// user via Supabase's built-in invite, upserts their receiver_profiles row with
// company + role + auth_user_id, and sends a role-specific welcome email.
// Staff-only. Idempotent — safe to re-run (re-invite falls back to a link).
// Deno runtime for Supabase Edge Functions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { resolveTemplate, renderEmail, buildCommonVars } from '../_shared/email-templates.ts'
import { captureException } from '../_shared/sentry.ts'

interface InviteCustomerRequest {
  email: string
  name: string
  surname?: string
  phone?: string
  company_id: string
  role: 'buyer' | 'runner'
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

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Missing authorization header' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify caller is active staff (admin/warehouse) via their own JWT.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: caller }, error: userError } = await userClient.auth.getUser()
    if (userError || !caller) return json({ error: 'Unauthorized', details: userError?.message }, 401)

    const { data: canInvite } = await userClient.rpc('has_permission', {
      p_key: 'customers.invite'
    })
    if (!canInvite) {
      return json({ error: "You do not have permission to invite customers ('customers.invite')" }, 403)
    }

    const body: InviteCustomerRequest = await req.json()
    const email = body.email?.toLowerCase().trim()
    const { name, surname, phone, company_id, role } = body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: 'Invalid email' }, 400)
    if (!name?.trim()) return json({ error: 'name is required' }, 400)
    if (!company_id) return json({ error: 'company_id is required' }, 400)
    if (!['buyer', 'runner'].includes(role)) return json({ error: "role must be 'buyer' or 'runner'" }, 400)

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Base URL of the deployed app. Defaults to the int/dev Cloudflare Pages
    // deployment; PROD must set APP_URL (and optionally CUSTOMER_PORTAL_URL).
    // Never fall back to the request origin — that's how invite links ended up
    // pointing at localhost.
    const appUrl = (Deno.env.get('APP_URL') || 'https://dev.rabelani-express-ui.pages.dev').replace(/\/$/, '')
    const portalUrl = Deno.env.get('CUSTOMER_PORTAL_URL') || `${appUrl}/my-packages`
    const redirectTo = `${appUrl}/accept-invite`

    // Email must be configured — this function sends the ONLY invite email, so
    // without Resend there's no way for the customer to receive their link.
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return json({ error: 'Email not configured', details: 'RESEND_API_KEY is not set; cannot deliver the invite link' }, 500)
    }

    // 1) Create the auth user and get a set-password link WITHOUT Supabase
    //    sending its own email. generateLink returns the link for us to deliver
    //    in our single branded email. New users → 'invite'; already-registered
    //    → 'recovery' (lets them (re)set their password).
    let gen = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } })
    if (gen.error) {
      gen = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
    }
    if (gen.error || !gen.data?.user) {
      return json({ error: 'Could not create the invite link', details: gen.error?.message }, 400)
    }
    const authUserId = gen.data.user.id
    const actionLink = gen.data.properties?.action_link
    if (!actionLink) return json({ error: 'No action link returned by Supabase' }, 500)

    // 2) Upsert the receiver profile matched on email, linking auth + role + company.
    const { data: existing } = await admin
      .from('receiver_profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    const profileFields = { auth_user_id: authUserId, role, company_id, name, surname: surname ?? '', ...(phone?.trim() ? { phone: phone.trim() } : {}) }
    let receiverId = existing?.id ?? null
    if (receiverId) {
      const { error } = await admin.from('receiver_profiles').update(profileFields).eq('id', receiverId)
      if (error) return json({ error: 'Could not link receiver profile', details: error.message }, 400)
    } else {
      const { data: created, error } = await admin.from('receiver_profiles')
        .insert({ email, ...profileFields })
        .select('id')
        .single()
      if (error || !created) return json({ error: 'Could not create receiver profile', details: error?.message }, 400)
      receiverId = created.id
    }

    // 3) Send the single branded invite email carrying the set-password link.
    //    A failure here fails the whole invite — the customer received nothing.
    //    The account already exists, so re-invoking regenerates the link.
    const { data: company } = await admin.from('companies').select('name').eq('id', company_id).single()
    const tpl = await resolveTemplate(admin, 'customer_invited')
    const rendered = renderEmail(tpl, {
      ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
      name,
      company_name: company?.name ?? 'your company',
      action_link: actionLink,
      portal_url: portalUrl,
      is_buyer: role === 'buyer',
      is_runner: role === 'runner'
    })
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('EMAIL_FROM') || 'Rabelani Express <noreply@example.com>',
        to: [email],
        subject: rendered.subject,
        html: rendered.html
      })
    })
    if (!resp.ok) {
      return json({ error: 'Could not send the invite email', details: await resp.text() }, 502)
    }

    return json({ success: true, receiver_id: receiverId, auth_user_id: authUserId, email_sent: true })
  } catch (e) {
    captureException(e)
    return json({ error: 'Unexpected error', details: e instanceof Error ? e.message : String(e) }, 500)
  }
})
