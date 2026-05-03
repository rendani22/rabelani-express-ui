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
   * Optional auth.users.id of the driver this package is being assigned to.
   * Persisted to `packages.picked_up_by`. Typically supplied alongside a
   * status change to `in_transit`.
   */
  driver_user_id?: string
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
      .select('id, role, full_name, email, is_active')
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
    const { package_id, status, notes, receiver_email, driver_user_id, pod } = body

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

    // Driver assignment: validate that the supplied user id corresponds to
    // an active driver before persisting it on the package.
    if (driver_user_id !== undefined) {
      const trimmedDriverId = String(driver_user_id).trim()
      if (!trimmedDriverId) {
        updateData.picked_up_by = null
      } else {
        const { data: driverProfile, error: driverLookupError } = await adminClient
          .from('staff_profiles')
          .select('id, user_id, role, is_active')
          .eq('user_id', trimmedDriverId)
          .eq('role', 'driver')
          .maybeSingle()

        if (driverLookupError || !driverProfile) {
          return new Response(
            JSON.stringify({
              error: 'Invalid driver',
              details: driverLookupError?.message || 'No driver found with the provided user id'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        if (!driverProfile.is_active) {
          return new Response(
            JSON.stringify({
              error: 'Driver is inactive',
              details: 'Cannot assign a package to a deactivated driver'
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        updateData.picked_up_by = trimmedDriverId
      }
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
    // and signatures) when transitioning to `collected`.
    //
    // The `pods` table has a `prevent_pod_modification` trigger that blocks
    // UPDATEs once a row exists, so we cannot rely on upsert. Instead we
    // check for an existing row first and only INSERT when none exists.
    // Retries after a successful POD persist are therefore no-ops.
    //
    // Signatures are stored inline as base64 PNG data URLs (TEXT). The
    // legacy `signature_url` / `signature_path` / `signed_at` columns are
    // populated with the receiver's data URL / a synthetic path / the
    // collected_at timestamp respectively, until/unless the signatures are
    // moved to Supabase Storage. The new nullable `receiver_signature` /
    // `witness_signature` columns hold the per-party data URLs the UI
    // renders.
    let podPersistError: string | null = null
    if (status === 'collected' && pod) {
      // Resolve a staff email — prefer the staff_profiles row, fall back
      // to the auth user's email so the NOT NULL constraint is satisfied.
      const staffEmail =
        (callerProfile as { email?: string }).email ||
        callingUser.email ||
        ''

      const podRow: Record<string, unknown> = {
        package_id,
        // NOT NULL columns mirrored from the package / caller.
        package_reference:        existingPackage.reference,
        receiver_email:           existingPackage.receiver_email,
        staff_id:                 callerProfile.id,
        staff_name:               callerProfile.full_name ?? 'Unknown',
        staff_email:              staffEmail,
        // Legacy single-signature columns (NOT NULL). Use the receiver's
        // signature as the canonical POD signature; `signature_path` is a
        // synthetic marker indicating the signature is stored inline.
        signature_url:            pod.receiver.signature_data_url,
        signature_path:           `inline:${package_id}/receiver`,
        signed_at:                pod.collected_at,
        // New per-party fields (nullable).
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

      // Insert only if no POD row exists yet (the unique index on
      // package_id is enforced anyway; checking first lets us return a
      // clearer signal on retries instead of a generic constraint error).
      const { data: existingPod } = await adminClient
        .from('pods')
        .select('id')
        .eq('package_id', package_id)
        .maybeSingle()

      if (existingPod) {
        // Row already exists and is immutable — nothing to do.
      } else {
        const { error: podError } = await adminClient
          .from('pods')
          .insert(podRow)

        if (podError) {
          // Don't roll back the package status update — but surface the
          // failure so the caller / audit log can act on it.
          console.error('POD persistence error:', podError)
          podPersistError = podError.message
        }
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

