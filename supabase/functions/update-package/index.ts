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
  /**
   * Optional base64-encoded PDF of the rendered POD document, supplied by the
   * UI (e.g. produced via html2pdf.js). Must be the raw base64 string WITHOUT
   * the `data:application/pdf;base64,` prefix. When present, it is attached
   * to the "Package Completed" email sent to the receiver.
   */
  pdf_base64?: string
  /** Optional filename for the attached POD PDF (defaults to POD-<reference>.pdf) */
  pdf_filename?: string
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

    // ------------------------------------------------------------------
    // Send "Ready for Collection" email when transitioning to that status.
    //
    // Mirrors the styling used by create-package so the receiver gets a
    // consistent branded experience. Email failures must NOT roll back the
    // status update — they are surfaced via the response payload + audit log.
    // ------------------------------------------------------------------
    let readyEmailSent = false
    let readyEmailError: string | null = null
    const transitionedToReady =
      status === 'ready_for_collection' &&
      existingPackage.status !== 'ready_for_collection'

    if (transitionedToReady) {
      try {
        // Fetch package items for the contents table
        const { data: itemsData } = await adminClient
          .from('package_items')
          .select('id, quantity, description')
          .eq('package_id', package_id)

        const packageItems: { id: string; quantity: number; description: string }[] =
          itemsData ?? []

        // Fetch delivery location if linked
        let deliveryLocation:
          | { name: string; address: string; google_maps_link: string | null }
          | null = null
        if (existingPackage.delivery_location_id) {
          const { data: locationData } = await adminClient
            .from('delivery_locations')
            .select('name, address, google_maps_link')
            .eq('id', existingPackage.delivery_location_id)
            .single()
          if (locationData) deliveryLocation = locationData
        }

        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        const collectionHoursWeekday  = Deno.env.get('COLLECTION_HOURS')           || 'Monday to Friday, 7:00 AM - 16:00 PM'
        const collectionHoursSaturday = Deno.env.get('COLLECTION_HOURS_SATURDAY')  || 'Saturdays: Closed'
        const collectionHoursSunday   = Deno.env.get('COLLECTION_HOURS_SUNDAY')    || 'Sundays: Closed'
        const collectionHoursHolidays = Deno.env.get('COLLECTION_HOURS_HOLIDAYS')  || 'Holidays: Closed'
        const supportEmail            = Deno.env.get('SUPPORT_EMAIL')              || 'rabelanimm@gmail.com'
        const collectionContact       = Deno.env.get('COLLECTION_CONTACT')         || 'Ext 4536 and ask for Lesedi or Thato'
        const reviewFormUrl           = Deno.env.get('REVIEW_FORM_URL')            || 'https://docs.google.com/forms/d/e/1FAIpQLSdiySN-ONYROMnjfqAo4fkHyihRWdhD0sUmIu4L8k6UXcGsNg/viewform?usp=preview'
        const reviewQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(reviewFormUrl)}`

        const locationName    = deliveryLocation?.name    || Deno.env.get('COLLECTION_LOCATION') || 'the designated collection point'
        const locationAddress = deliveryLocation?.address || ''
        const locationMapsLink = deliveryLocation?.google_maps_link || null
        const poNumber: string | null = existingPackage.po_number ?? null

        if (!resendApiKey) {
          readyEmailError = 'Email service not configured (RESEND_API_KEY not set)'
          console.log('Ready-for-collection email skipped:', readyEmailError)
        } else if (!updatedPackage.receiver_email) {
          readyEmailError = 'Package has no receiver_email; cannot send notification'
          console.warn(readyEmailError)
        } else {
          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
              to: [updatedPackage.receiver_email],
              subject: `Ready for Collection${poNumber ? ` - ${poNumber}` : ''} - ${updatedPackage.reference}`,
              html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                  <!-- Brand bar -->
                  <div style="background: #ffffff; padding: 24px 24px 16px 24px; border: 1px solid #ededed; border-bottom: 4px solid #f75757; border-radius: 8px 8px 0 0; text-align: center;">
                    <a href="https://www.rabelanimm.co.za/" style="text-decoration: none; display: inline-block;">
                      <img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" style="max-height: 70px; height: auto; width: auto; display: block; margin: 0 auto;" />
                    </a>
                    <p style="margin: 12px 0 0 0; font-size: 12px; color: #919194; letter-spacing: 0.08em; text-transform: uppercase;">Rabelani MM Trading Enterprise</p>
                  </div>

                  <!-- Title block -->
                  <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.01em;">Ready for Collection</h1>
                    ${poNumber ? `<p style="color: #ffe7e7; margin: 14px 0 0 0; font-size: 15px;">Purchase Order Number: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">${poNumber}</strong></p>` : ''}
                    <p style="color: #ffe7e7; margin: 6px 0 0 0; font-size: 15px;">Your Package Reference: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">${updatedPackage.reference}</strong></p>
                  </div>

                  <div style="background: #ffffff; padding: 30px 28px; border: 1px solid #ededed; border-top: none;">
                    <h2 style="color: #242424; font-size: 20px; margin: 0 0 15px 0; font-weight: 700;">📦 Package Ready for Collection</h2>
                    <p style="margin: 0 0 12px 0; color: #4e595f;">Hello,</p>
                    <p style="margin: 0 0 20px 0; color: #4e595f; line-height: 1.6;">Great news! A package has been registered for you and is ready for collection. Please collect it at the Collection Point.</p>

                    ${packageItems.length > 0 ? `
                    <div style="margin: 24px 0;">
                      <h3 style="color: #242424; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📋 Package Contents</h3>
                      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                        <thead>
                          <tr style="background: #fafafa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${packageItems.map(item => `
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">${item.quantity}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">${item.description}</td>
                          </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                    ` : ''}

                    <h3 style="color: #242424; font-size: 16px; margin: 30px 0 10px 0; font-weight: 700;">📍 Delivery Point</h3>
                    <div style="background: #fafafa; padding: 20px; border-radius: 6px; margin: 10px 0 20px 0; border-left: 4px solid #f75757;">
                      <p style="font-size: 16px; font-weight: 700; color: #242424; margin: 0;">${locationName}</p>
                      ${locationAddress ? `<p style="font-size: 14px; color: #4e595f; margin: 8px 0 0 0; line-height: 1.5;">${locationAddress}</p>` : ''}
                      <p style="font-size: 14px; color: #4e595f; margin: 10px 0 0 0;"><strong style="color: #242424;">Contact Number:</strong> ${collectionContact}</p>
                      ${locationMapsLink ? `<p style="margin: 12px 0 0 0;"><a href="${locationMapsLink}" style="color: #f75757; font-size: 14px; text-decoration: none; font-weight: 600;">📍 View on Google Maps</a></p>` : ''}
                    </div>

                    <div style="margin: 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 14px; color: #242424;"><strong>Collection Hours:</strong></p>
                      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                        <li>${collectionHoursWeekday}</li>
                        <li>${collectionHoursSaturday}</li>
                        <li>${collectionHoursSunday}</li>
                        <li>${collectionHoursHolidays}</li>
                      </ul>
                    </div>

                    <div style="background: #fafafa; padding: 18px; border-radius: 6px; margin: 24px 0;">
                      <p style="margin: 0 0 8px 0; font-size: 14px; color: #242424;"><strong>What to bring when collecting:</strong></p>
                      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #4e595f; line-height: 1.7;">
                        <li>Your PO reference number (shown above)</li>
                        <li>Valid Staff Employee Card for verification and a Witness to Sign with</li>
                      </ul>
                    </div>
                  </div>

                  <!-- Footer -->
                  <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
                      Questions? Contact us at <a href="mailto:${supportEmail}" style="color: #f75757; text-decoration: none; font-weight: 600;">${supportEmail}</a>
                    </p>
                    <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
                      This is an automated message from the POD System. Please do not reply directly to this email.
                    </p>
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
                      <img src="${reviewQrCodeUrl}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
                    </div>
                    <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
                      Scan the QR code to review our services
                    </p>
                    <a href="${reviewFormUrl}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
                      Please Review Our Services
                    </a>
                    <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
                      &copy; ${new Date().getFullYear()} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #919194; text-decoration: none;">www.rabelanimm.co.za</a>
                    </p>
                  </div>
                </body>
                </html>
              `
            })
          })

          if (emailResponse.ok) {
            readyEmailSent = true
            await adminClient.from('audit_logs').insert({
              action: 'PACKAGE_READY_NOTIFICATION',
              entity_type: 'package',
              entity_id: package_id,
              performed_by: callingUser.id,
              metadata: {
                reference: updatedPackage.reference,
                receiver_email: updatedPackage.receiver_email,
                notification_type: 'email',
                notification_status: 'sent',
                email_subject: 'Ready for Collection'
              }
            })
          } else {
            const errorBody = await emailResponse.text()
            readyEmailError = `Email API error: ${errorBody}`
            console.error('Ready-for-collection email send failed:', readyEmailError)
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        readyEmailError = `Email exception: ${errorMessage}`
        console.error('Ready-for-collection email exception:', e)
      }
    }

    // ------------------------------------------------------------------
    // Send "Package Completed" email when transitioning to `collected`.
    //
    // Mirrors the branded styling used by the create / ready-for-collection
    // emails. Email failures must NOT roll back the status update — they
    // are surfaced via the response payload + audit log.
    // ------------------------------------------------------------------
    let completedEmailSent = false
    let completedEmailError: string | null = null
    const transitionedToCollected =
      status === 'collected' &&
      existingPackage.status !== 'collected'

    if (transitionedToCollected) {
      try {
        // Fetch package items for the contents table
        const { data: itemsData } = await adminClient
          .from('package_items')
          .select('id, quantity, description')
          .eq('package_id', package_id)

        const packageItems: { id: string; quantity: number; description: string }[] =
          itemsData ?? []

        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        const supportEmail   = Deno.env.get('SUPPORT_EMAIL')   || 'rabelanimm@gmail.com'
        const reviewFormUrl  = Deno.env.get('REVIEW_FORM_URL') || 'https://docs.google.com/forms/d/e/1FAIpQLSdiySN-ONYROMnjfqAo4fkHyihRWdhD0sUmIu4L8k6UXcGsNg/viewform?usp=preview'
        const reviewQrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(reviewFormUrl)}`
        const poNumber: string | null = existingPackage.po_number ?? null

        if (!resendApiKey) {
          completedEmailError = 'Email service not configured (RESEND_API_KEY not set)'
          console.log('Package-completed email skipped:', completedEmailError)
        } else if (!updatedPackage.receiver_email) {
          completedEmailError = 'Package has no receiver_email; cannot send notification'
          console.warn(completedEmailError)
        } else {
          // ----------------------------------------------------------
          // Build POD attachment (if available).
          //
          // Priority:
          //   1. `pod.pdf_base64` from the request payload (UI-generated PDF
          //      — strip any `data:application/pdf;base64,` prefix).
          //   2. `pods.pdf_url` if populated (Resend can fetch via `path`).
          // Falls back to no attachment if neither is available.
          // ----------------------------------------------------------
          const attachments: Array<Record<string, string>> = []
          const podFilename =
            pod?.pdf_filename ||
            `POD-${updatedPackage.reference}.pdf`

          if (pod?.pdf_base64) {
            const cleanBase64 = pod.pdf_base64.replace(/^data:application\/pdf;base64,/, '')
            attachments.push({
              filename: podFilename,
              content: cleanBase64
            })
          } else {
            // Try to look up an existing pods.pdf_url and attach via path.
            const { data: podRow } = await adminClient
              .from('pods')
              .select('pdf_url')
              .eq('package_id', package_id)
              .maybeSingle()
            if (podRow?.pdf_url) {
              attachments.push({
                filename: podFilename,
                path: podRow.pdf_url
              })
            }
          }

          const emailResponse = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
              to: [updatedPackage.receiver_email],
              subject: `Package Completed${poNumber ? ` - ${poNumber}` : ''} - ${updatedPackage.reference}`,
              ...(attachments.length > 0 ? { attachments } : {}),
              html: `
                <!DOCTYPE html>
                <html>
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                </head>
                <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                  <!-- Brand bar -->
                  <div style="background: #ffffff; padding: 24px 24px 16px 24px; border: 1px solid #ededed; border-bottom: 4px solid #f75757; border-radius: 8px 8px 0 0; text-align: center;">
                    <a href="https://www.rabelanimm.co.za/" style="text-decoration: none; display: inline-block;">
                      <img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" style="max-height: 70px; height: auto; width: auto; display: block; margin: 0 auto;" />
                    </a>
                    <p style="margin: 12px 0 0 0; font-size: 12px; color: #919194; letter-spacing: 0.08em; text-transform: uppercase;">Rabelani MM Trading Enterprise</p>
                  </div>

                  <!-- Title block -->
                  <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                    <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: 0.01em;">Package Completed</h1>
                    ${poNumber ? `<p style="color: #ffe7e7; margin: 14px 0 0 0; font-size: 15px;">Purchase Order Number: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">${poNumber}</strong></p>` : ''}
                    <p style="color: #ffe7e7; margin: 6px 0 0 0; font-size: 15px;">Your Package Reference: <strong style="font-family: 'Courier New', monospace; color: #ffffff;">${updatedPackage.reference}</strong></p>
                  </div>

                  <div style="background: #ffffff; padding: 30px 28px; border: 1px solid #ededed; border-top: none;">
                    <h2 style="color: #242424; font-size: 20px; margin: 0 0 15px 0; font-weight: 700;">✅ Package Completed</h2>
                    <p style="margin: 0 0 12px 0; color: #4e595f;">Hello,</p>
                    <p style="margin: 0 0 20px 0; color: #4e595f; line-height: 1.6;">Your Package Collection/Delivery has been completed and thank you for your Order.</p>

                    ${packageItems.length > 0 ? `
                    <div style="margin: 24px 0;">
                      <h3 style="color: #242424; font-size: 16px; margin: 0 0 12px 0; font-weight: 700;">📋 Package Contents</h3>
                      <table style="width: 100%; border-collapse: collapse; border: 1px solid #ededed; border-radius: 6px; overflow: hidden;">
                        <thead>
                          <tr style="background: #fafafa;">
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em; width: 60px;">Qty</th>
                            <th style="padding: 12px; text-align: left; border-bottom: 1px solid #ededed; font-size: 12px; color: #919194; text-transform: uppercase; letter-spacing: 0.05em;">Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          ${packageItems.map(item => `
                          <tr>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #242424; font-weight: 600;">${item.quantity}</td>
                            <td style="padding: 12px; border-bottom: 1px solid #ededed; font-size: 14px; color: #4e595f;">${item.description}</td>
                          </tr>
                          `).join('')}
                        </tbody>
                      </table>
                    </div>
                    ` : ''}

                    <p style="margin: 24px 0 0 0; color: #4e595f; line-height: 1.6; font-size: 15px;">Thank you for your Order.</p>
                  </div>

                  <!-- Footer -->
                  <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
                    <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
                      Questions? Contact us at <a href="mailto:${supportEmail}" style="color: #f75757; text-decoration: none; font-weight: 600;">${supportEmail}</a>
                    </p>
                    <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
                      This is an automated message from the POD System. Please do not reply directly to this email.
                    </p>
                    <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
                      <img src="${reviewQrCodeUrl}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
                    </div>
                    <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
                      Scan the QR code to review our services
                    </p>
                    <a href="${reviewFormUrl}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
                      Please Review Our Services
                    </a>
                    <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
                      &copy; ${new Date().getFullYear()} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #919194; text-decoration: none;">www.rabelanimm.co.za</a>
                    </p>
                  </div>
                </body>
                </html>
              `
            })
          })

          if (emailResponse.ok) {
            completedEmailSent = true
            await adminClient.from('audit_logs').insert({
              action: 'PACKAGE_COMPLETED_NOTIFICATION',
              entity_type: 'package',
              entity_id: package_id,
              performed_by: callingUser.id,
              metadata: {
                reference: updatedPackage.reference,
                receiver_email: updatedPackage.receiver_email,
                notification_type: 'email',
                notification_status: 'sent',
                email_subject: 'Package Completed',
                pod_attached: attachments.length > 0,
                pod_attachment_filename: attachments[0]?.filename ?? null
              }
            })
          } else {
            const errorBody = await emailResponse.text()
            completedEmailError = `Email API error: ${errorBody}`
            console.error('Package-completed email send failed:', completedEmailError)
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        completedEmailError = `Email exception: ${errorMessage}`
        console.error('Package-completed email exception:', e)
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
        ready_email_sent: transitionedToReady ? readyEmailSent : undefined,
        ready_email_error: transitionedToReady ? readyEmailError : undefined,
        completed_email_sent: transitionedToCollected ? completedEmailSent : undefined,
        completed_email_error: transitionedToCollected ? completedEmailError : undefined,
        performed_by_name: callerProfile.full_name,
        performed_by_role: callerProfile.role
      }
    })

    return new Response(
      JSON.stringify({
        success: true,
        package: updatedPackage,
        message: `Package ${updatedPackage.reference} updated successfully`,
        ...(podPersistError ? { pod_warning: podPersistError } : {}),
        ...(transitionedToReady
          ? { email_sent: readyEmailSent, email_error: readyEmailError }
          : transitionedToCollected
            ? { email_sent: completedEmailSent, email_error: completedEmailError }
            : {})
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

