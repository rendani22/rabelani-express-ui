// Edge Function: update-package
// Updates a package with proper authorization and audit logging
// Enforces lock checks for POD-related packages
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface PodPartyPayload {
  name: string
  employee_number: string
  phone: string
  signature_data_url: string
}

interface MarkCollectedPayload {
  receiver: PodPartyPayload
  witness: PodPartyPayload
  collected_at: string
}

interface UpdatePackageRequest {
  package_id: string
  status?: 'pending' | 'notified' | 'in_transit' | 'ready_for_collection' | 'collected' | 'returned'
  notes?: string
  receiver_email?: string
  /**
   * Optional Proof-of-Delivery payload sent by the UI when transitioning a
   * package to `collected`. Persistence is intentionally not handled here —
   * see the TODO further down once the `pods` schema for receiver/witness
   * fields and signature storage is finalised.
   */
  pod?: MarkCollectedPayload
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

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User client to verify caller
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })

    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser()
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          details: userError?.message || 'Could not verify user token'
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if calling user has appropriate role
    const { data: callerProfile, error: profileError } = await userClient
      .from('staff_profiles')
      .select('id, role, full_name, is_active')
      .eq('user_id', callingUser.id)
      .single()

    if (profileError || !callerProfile) {
      return new Response(
        JSON.stringify({
          error: 'Staff profile not found',
          details: profileError?.message
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!callerProfile.is_active) {
      return new Response(
        JSON.stringify({
          error: 'Staff account is deactivated',
          details: 'Contact an administrator to reactivate your account'
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!['warehouse', 'admin', 'collection'].includes(callerProfile.role)) {
      return new Response(
        JSON.stringify({
          error: 'Insufficient permissions to update packages',
          details: `User role is '${callerProfile.role}'`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: UpdatePackageRequest = await req.json()
    const { package_id, status, notes, receiver_email, pod } = body

    if (!package_id) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: package_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Admin client for operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get current package state.
    //
    // IMPORTANT: there are two foreign keys between `packages` and `pods`
    //   1. `packages.pod_id     -> pods.id`            (back-reference)
    //   2. `pods.package_id     -> packages.id`        (one-to-many)
    // An unqualified `pods(...)` embed makes PostgREST raise
    //   "Could not embed because more than one relationship was found
    //    for 'packages' and 'pods'".
    // Hint the FK explicitly via `pods!<column-on-pods>(...)`.
    const { data: existingPackage, error: fetchError } = await adminClient
      .from('packages')
      .select('*, pods!package_id(id, is_locked, locked_at, pod_reference)')
      .eq('id', package_id)
      .single()

    if (fetchError || !existingPackage) {
      return new Response(
        JSON.stringify({
          error: 'Package not found',
          details: fetchError?.message || `No package with ID ${package_id}`
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if package has a locked POD
    const lockedPod = existingPackage.pods?.find((p: any) => p.is_locked === true)
    if (lockedPod) {
      // Log the denied attempt
      await adminClient.from('audit_logs').insert({
        action: 'PACKAGE_UPDATE_DENIED',
        entity_type: 'package',
        entity_id: package_id,
        performed_by: callingUser.id,
        metadata: {
          package_reference: existingPackage.reference,
          pod_reference: lockedPod.pod_reference,
          locked_at: lockedPod.locked_at,
          reason: 'Package has a locked POD and cannot be modified',
          attempted_changes: { status, notes, receiver_email, has_pod_payload: !!pod },
          performed_by_name: callerProfile.full_name,
          performed_by_role: callerProfile.role
        }
      })

      return new Response(
        JSON.stringify({
          error: 'Package is locked',
          details: `Package ${existingPackage.reference} has a completed and locked POD (${lockedPod.pod_reference}). Locked packages cannot be modified.`,
          pod_reference: lockedPod.pod_reference,
          locked_at: lockedPod.locked_at
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (status !== undefined) {
      updateData.status = status

      // If marking as collected, set collected_at and collected_by
      if (status === 'collected') {
        updateData.collected_at = pod?.collected_at ?? new Date().toISOString()
        updateData.collected_by = callingUser.id
      }
    }

    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null
    }

    if (receiver_email !== undefined) {
      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(receiver_email)) {
        return new Response(
          JSON.stringify({ error: 'Invalid email format' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      updateData.receiver_email = receiver_email.toLowerCase().trim()
    }

    // Perform update
    const { data: updatedPackage, error: updateError } = await adminClient
      .from('packages')
      .update(updateData)
      .eq('id', package_id)
      .select()
      .single()

    if (updateError) {
      console.error('Package update error:', updateError)
      return new Response(
        JSON.stringify({
          error: 'Failed to update package',
          details: updateError.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Persist the Proof-of-Delivery payload (receiver + witness identification
    // and signatures) when transitioning to `collected`. We upsert against
    // `package_id` so retrying the action does not create duplicate POD rows.
    //
    // Signatures are stored inline as base64 PNG data URLs (TEXT). If/when
    // we move to Supabase Storage, this is the only place that needs to
    // change — replace the *_signature fields with uploaded object URLs.
    let podPersistError: string | null = null
    if (status === 'collected' && pod) {
      const podRow = {
        package_id,
        receiver_name:            pod.receiver.name,
        receiver_employee_number: pod.receiver.employee_number,
        receiver_phone:           pod.receiver.phone,
        receiver_signature:       pod.receiver.signature_data_url,
        witness_name:             pod.witness.name,
        witness_employee_number:  pod.witness.employee_number,
        witness_phone:            pod.witness.phone,
        witness_signature:        pod.witness.signature_data_url,
        completed_at:             pod.collected_at,
        completed_by:             callingUser.id
      }

      const { error: podError } = await adminClient
        .from('pods')
        .upsert(podRow, { onConflict: 'package_id' })

      if (podError) {
        // Don't roll back the package status update — but surface the
        // failure so the caller / audit log can act on it. The collection
        // event has effectively happened; missing POD metadata can be
        // re-captured on retry.
        console.error('POD persistence error:', podError)
        podPersistError = podError.message
      }
    }

    // Log successful update
    await adminClient.from('audit_logs').insert({
      action: 'PACKAGE_UPDATED',
      entity_type: 'package',
      entity_id: package_id,
      performed_by: callingUser.id,
      metadata: {
        package_reference: updatedPackage.reference,
        changes: updateData,
        previous_status: existingPackage.status,
        new_status: updatedPackage.status,
        pod_captured: !!pod,
        pod_persisted: !!pod && !podPersistError,
        pod_persist_error: podPersistError,
        performed_by_name: callerProfile.full_name,
        performed_by_role: callerProfile.role
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        package: updatedPackage,
        message: `Package ${updatedPackage.reference} updated successfully`,
        ...(podPersistError ? { pod_warning: podPersistError } : {})
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

