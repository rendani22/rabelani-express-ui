// Edge Function: customer-pod
// Returns the proof-of-delivery data for a customer's own COLLECTED/DELIVERED
// package, so the client can render the POD PDF. `pods` is staff-only via RLS;
// this function is the only customer-facing path and enforces entitlement with
// the service role (buyer → same company; runner → assigned to them).
// Deno runtime for Supabase Edge Functions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { captureException } from '../_shared/sentry.ts'

const POD_COLUMNS =
  'id, package_id, pod_reference, is_locked, locked_at, ' +
  'receiver_name, receiver_employee_number, receiver_phone, receiver_signature, ' +
  'witness_name, witness_employee_number, witness_phone, witness_signature, ' +
  'completed_at, completed_by, staff_name, completion_status, delivery_photo_url'

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

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: caller }, error: userError } = await userClient.auth.getUser()
    if (userError || !caller) return json({ error: 'Unauthorized', details: userError?.message }, 401)

    const { package_id } = await req.json().catch(() => ({}))
    if (!package_id) return json({ error: 'package_id is required' }, 400)

    const admin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Resolve the caller as an active portal customer (role set, not deactivated).
    const { data: me } = await admin
      .from('receiver_profiles')
      .select('id, role, company_id')
      .eq('auth_user_id', caller.id)
      .not('role', 'is', null)
      .eq('is_active', true)
      .maybeSingle()
    if (!me) return json({ error: 'Not a portal customer' }, 403)

    // Load the package (service role; RLS bypassed) with only what the POD needs.
    // Internal `notes` are swapped for `customer_notes` so the POD never carries
    // staff-only remarks.
    const { data: pkg } = await admin
      .from('packages')
      .select('id, reference, po_number, receiver_email, status, created_at, customer_notes, receiver_id, deleted_at, items:package_items(id, quantity, description, inventory_item_id)')
      .eq('id', package_id)
      .maybeSingle()
    if (!pkg || pkg.deleted_at) return json({ error: 'Package not found' }, 404)

    // POD is only available once the order is collected/delivered.
    if (!['collected', 'delivered'].includes(pkg.status)) {
      return json({ error: 'POD is not available until the order is collected' }, 403)
    }

    // Entitlement: runner → assigned to them; buyer → same company as the package's receiver.
    let entitled = false
    if (me.role === 'runner') {
      entitled = pkg.receiver_id === me.id
    } else if (me.role === 'buyer' && pkg.receiver_id) {
      const { data: owner } = await admin
        .from('receiver_profiles')
        .select('company_id')
        .eq('id', pkg.receiver_id)
        .maybeSingle()
      entitled = !!owner && owner.company_id === me.company_id
    }
    if (!entitled) return json({ error: 'Not authorised to view this POD' }, 403)

    const { data: pod } = await admin
      .from('pods')
      .select(POD_COLUMNS)
      .eq('package_id', package_id)
      .maybeSingle()
    if (!pod) return json({ error: 'No proof of delivery is on file for this order yet' }, 404)

    return json({
      package: {
        reference: pkg.reference,
        po_number: pkg.po_number,
        receiver_email: pkg.receiver_email,
        status: pkg.status,
        created_at: pkg.created_at,
        notes: pkg.customer_notes,          // customer-facing notes only
        items: pkg.items ?? []
      },
      pod
    })
  } catch (e) {
    captureException(e)
    return json({ error: 'Unexpected error', details: e instanceof Error ? e.message : String(e) }, 500)
  }
})
