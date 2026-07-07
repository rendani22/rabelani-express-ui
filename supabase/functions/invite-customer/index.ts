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

    const { data: callerProfile } = await userClient
      .from('staff_profiles')
      .select('role, is_active')
      .eq('user_id', caller.id)
      .single()
    if (!callerProfile || !callerProfile.is_active || !['admin', 'warehouse'].includes(callerProfile.role)) {
      return json({ error: 'Only active warehouse staff and admins can invite customers' }, 403)
    }

    const body: InviteCustomerRequest = await req.json()
    const email = body.email?.toLowerCase().trim()
    const { name, surname, company_id, role } = body

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

    // 1) Invite (or, if the user already exists, generate a fresh invite link).
    let authUserId: string | null = null
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })
    if (invited?.user) {
      authUserId = invited.user.id
    } else {
      // Already-registered users can't be re-invited; resolve their id instead.
      const alreadyExists = inviteError?.message?.toLowerCase().includes('already')
      if (!alreadyExists) return json({ error: 'Invite failed', details: inviteError?.message }, 400)
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } })
      if (linkError || !link?.user) return json({ error: 'Could not resolve existing user', details: linkError?.message }, 400)
      authUserId = link.user.id
    }

    // 2) Upsert the receiver profile matched on email, linking auth + role + company.
    const { data: existing } = await admin
      .from('receiver_profiles')
      .select('id')
      .ilike('email', email)
      .maybeSingle()

    let receiverId = existing?.id ?? null
    if (receiverId) {
      const { error } = await admin.from('receiver_profiles')
        .update({ auth_user_id: authUserId, role, company_id, name, surname: surname ?? '' })
        .eq('id', receiverId)
      if (error) return json({ error: 'Could not link receiver profile', details: error.message }, 400)
    } else {
      const { data: created, error } = await admin.from('receiver_profiles')
        .insert({ email, name, surname: surname ?? '', auth_user_id: authUserId, role, company_id })
        .select('id')
        .single()
      if (error || !created) return json({ error: 'Could not create receiver profile', details: error?.message }, 400)
      receiverId = created.id
    }

    // 3) Send the role-specific welcome email (non-fatal; account already exists).
    let emailSent = false
    let emailError: string | null = null
    try {
      const resendApiKey = Deno.env.get('RESEND_API_KEY')
      const { data: company } = await admin.from('companies').select('name').eq('id', company_id).single()
      if (!resendApiKey) {
        emailError = 'RESEND_API_KEY not set'
      } else {
        const tpl = await resolveTemplate(admin, 'customer_invited')
        const rendered = renderEmail(tpl, {
          ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
          name,
          company_name: company?.name ?? 'your company',
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
        if (resp.ok) emailSent = true
        else emailError = `Email API error: ${await resp.text()}`
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : String(e)
    }

    return json({ success: true, receiver_id: receiverId, auth_user_id: authUserId, email_sent: emailSent, email_error: emailError })
  } catch (e) {
    captureException(e)
    return json({ error: 'Unexpected error', details: e instanceof Error ? e.message : String(e) }, 500)
  }
})
