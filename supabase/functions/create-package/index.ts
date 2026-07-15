// Edge Function: create-package
// Creates a new package, sends email notification to receiver, and logs audit entry
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { resolveTemplate, renderEmail, buildCommonVars } from '../_shared/email-templates.ts'
import { captureException } from '../_shared/sentry.ts'

interface PackageItemRequest {
  quantity: number
  description: string
  /**
   * Optional inventory_items.id this package item is sourced from. When
   * present, the link is persisted on package_items so later edits can
   * reconcile inventory stock.
   */
  inventory_item_id?: string | null
}

interface PurchaseOrderAllocationRequest {
  purchase_order_item_id: string
  item_index: number
  quantity: number
}

interface CreatePackageRequest {
  receiver_email: string
  notes?: string
  customer_notes?: string
  items?: PackageItemRequest[]
  po_allocations?: PurchaseOrderAllocationRequest[]
  delivery_location_id?: string
  po_number?: string
  status?: string
}

interface PackageItemResponse {
  id: string
  quantity: number
  description: string
  inventory_item_id: string | null
}

interface PackageResponse {
  id: string
  reference: string
  receiver_email: string
  notes: string | null
  customer_notes: string | null
  status: string
  created_at: string
  items: PackageItemResponse[]
}

interface AtomicCreatePackageRpcResponse {
  package_id: string
  package_item_ids: string[]
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

function validatePoAllocations(
  allocations: CreatePackageRequest['po_allocations'],
  itemCount: number
): string | null {
  if (allocations === undefined) return null
  if (!Array.isArray(allocations)) {
    return 'Invalid purchase order allocations payload: po_allocations must be an array'
  }

  for (const allocation of allocations) {
    if (!allocation || typeof allocation !== 'object') {
      return 'Invalid purchase order allocations payload: each allocation must be an object'
    }

    if (typeof allocation.purchase_order_item_id !== 'string' || !allocation.purchase_order_item_id.trim()) {
      return 'Invalid purchase order allocations payload: purchase_order_item_id is required'
    }

    if (!Number.isInteger(allocation.item_index) || allocation.item_index < 0 || allocation.item_index >= itemCount) {
      return 'Invalid purchase order allocations payload: item_index is out of bounds'
    }

    if (typeof allocation.quantity !== 'number' || !Number.isFinite(allocation.quantity) || allocation.quantity <= 0) {
      return 'Invalid purchase order allocations payload: quantity must be greater than 0'
    }
  }

  return null
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

    // Check if calling user is warehouse or admin
    const { data: callerProfile, error: profileError } = await userClient
      .from('staff_profiles')
      .select('role, full_name')
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

    const { data: canCreateOrders } = await userClient.rpc('has_permission', {
      p_key: 'orders.create'
    })

    if (!canCreateOrders) {
      return new Response(
        JSON.stringify({
          error: 'You do not have permission to create packages',
          details: `User role is '${callerProfile.role}' and lacks the 'orders.create' permission`
        }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const body: CreatePackageRequest = await req.json()
    const { receiver_email, notes, customer_notes, items, po_allocations, delivery_location_id, po_number } = body

    if (!receiver_email) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: receiver_email' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(receiver_email)) {
      return new Response(
        JSON.stringify({ error: 'Invalid email format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const poAllocationValidationError = validatePoAllocations(po_allocations, items?.length ?? 0)
    if (poAllocationValidationError) {
      return new Response(
        JSON.stringify({ error: poAllocationValidationError }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const poAllocations = po_allocations ?? []

    // Admin client for operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Determine initial package status (allow client to request 'draft')
    const initialStatus = (typeof (body as any).status === 'string' && (body as any).status?.trim())
      ? (body as any).status.trim().toLowerCase()
      : 'pending'

    const { data: rpcResult, error: atomicCreateError } = await adminClient
      .rpc('create_package_with_items_and_allocations', {
        p_receiver_email: receiver_email.toLowerCase().trim(),
        p_notes: notes?.trim() || null,
        p_customer_notes: customer_notes?.trim() || null,
        p_created_by: callingUser.id,
        p_status: initialStatus,
        p_delivery_location_id: delivery_location_id || null,
        p_po_number: po_number?.trim() || null,
        p_items: items ?? [],
        p_po_allocations: poAllocations
      })
      .single()

    if (atomicCreateError || !rpcResult) {
      const status = atomicCreateError?.code === 'P0001' ? 400 : 500
      return new Response(
        JSON.stringify({
          error: atomicCreateError?.code === 'P0001'
            ? atomicCreateError.message
            : 'Failed to create package',
          details: atomicCreateError?.code === 'P0001'
            ? atomicCreateError.details ?? null
            : atomicCreateError?.message
        }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const rpcData = rpcResult as AtomicCreatePackageRpcResponse

    const { data: newPackage, error: packageLoadError } = await adminClient
      .from('packages')
      .select('id, reference, receiver_email, notes, customer_notes, status, created_at')
      .eq('id', rpcData.package_id)
      .single()

    if (packageLoadError || !newPackage) {
      console.error('Package fetch error after atomic create:', packageLoadError)
      return new Response(
        JSON.stringify({
          error: 'Failed to load created package',
          details: packageLoadError?.message
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let packageItems: PackageItemResponse[] = []
    if (Array.isArray(rpcData.package_item_ids) && rpcData.package_item_ids.length > 0) {
      const { data: insertedItems, error: packageItemsError } = await adminClient
        .from('package_items')
        .select('id, quantity, description, inventory_item_id')
        .in('id', rpcData.package_item_ids)

      if (packageItemsError) {
        console.error('Package items fetch error after atomic create:', packageItemsError)
        return new Response(
          JSON.stringify({
            error: 'Failed to load created package items',
            details: packageItemsError.message
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const packageItemsById = new Map((insertedItems ?? []).map((item) => [item.id, item]))
      packageItems = rpcData.package_item_ids
        .map((id) => packageItemsById.get(id))
        .filter((item): item is PackageItemResponse => Boolean(item))

      if (packageItems.length !== rpcData.package_item_ids.length) {
        return new Response(
          JSON.stringify({
            error: 'Failed to load created package items',
            details: 'One or more created package items could not be loaded'
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    // Fetch delivery location details if provided
    let deliveryLocation: { name: string; address: string; google_maps_link: string | null } | null = null
    if (delivery_location_id) {
      const { data: locationData, error: locationError } = await adminClient
        .from('delivery_locations')
        .select('name, address, google_maps_link')
        .eq('id', delivery_location_id)
        .single()

      if (!locationError && locationData) {
        deliveryLocation = locationData
      }
    }

    // Send email notification to receiver
    let emailSent = false
    let emailError: string | null = null

    try {
      // Use Resend API if configured, otherwise log for manual follow-up
      const resendApiKey = Deno.env.get('RESEND_API_KEY')

      // Use delivery location if available, otherwise fall back to environment variable
      const locationName = deliveryLocation?.name || Deno.env.get('COLLECTION_LOCATION') || 'the designated collection point'
      const locationAddress = deliveryLocation?.address || ''
      const locationMapsLink = deliveryLocation?.google_maps_link || null

      // Respect 'draft' packages: do not send notifications for drafts
      if (initialStatus === 'draft') {
        console.log('Package created as draft; notifications suppressed')
      } else if (resendApiKey) {
        // Resolve template from DB (with in-code fallback) and render with the
        // package-specific variables. The template HTML / subject is owned by
        // the email_templates row and editable from the admin UI.
        const tpl = await resolveTemplate(adminClient, 'package_registered')
        const vars = {
          ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
          reference: newPackage.reference,
          po_number: po_number?.trim() || '',
          // Customer-facing email → customer_notes only, never internal notes.
          notes: customer_notes?.trim() || '',
          items: packageItems.map(i => ({ quantity: i.quantity, description: i.description })),
          has_items: packageItems.length > 0,
          location_name: locationName,
          location_address: locationAddress,
          location_maps_link: locationMapsLink || ''
        }
        const rendered = renderEmail(tpl, vars)

        // Use template-defined cc/bcc when present, otherwise omit.
        const ccList = (tpl as any).cc && (tpl as any).cc.length ? (tpl as any).cc : undefined
        const bccList = (tpl as any).bcc && (tpl as any).bcc.length ? (tpl as any).bcc : undefined

        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
            to: [receiver_email],
            ...(ccList ? { cc: ccList } : {}),
            ...(bccList ? { bcc: bccList } : {}),
            subject: rendered.subject,
            html: rendered.html
          })
        })

        if (emailResponse.ok) {
          emailSent = true
          // Update package status to notified
          await adminClient
            .from('packages')
            .update({ status: 'notified', status_changed_by: callingUser.id })
            .eq('id', newPackage.id)

          newPackage.status = 'notified'

          // Log PACKAGE_PREPARED_NOTIFICATION audit event
          await adminClient
            .from('audit_logs')
            .insert({
              action: 'PACKAGE_PREPARED_NOTIFICATION',
              entity_type: 'package',
              entity_id: newPackage.id,
              performed_by: callingUser.id,
              metadata: {
                reference: newPackage.reference,
                receiver_email: newPackage.receiver_email,
                notification_type: 'email',
                notification_status: 'sent',
                email_subject: 'Package Being Prepared'
              }
            })
        } else {
          const errorBody = await emailResponse.text()
          emailError = `Email API error: ${errorBody}`
          console.error('Email send failed:', emailError)
        }
      } else {
        emailError = 'Email service not configured (RESEND_API_KEY not set)'
        console.log('Email notification skipped:', emailError)
      }
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e)
      emailError = `Email exception: ${errorMessage}`
      console.error('Email send exception:', e)
    }

    // Create audit log entry
    const { error: auditError } = await adminClient
      .from('audit_logs')
      .insert({
        action: 'PACKAGE_CREATED',
        entity_type: 'package',
        entity_id: newPackage.id,
        performed_by: callingUser.id,
        metadata: {
          reference: newPackage.reference,
          receiver_email: newPackage.receiver_email,
          notes: newPackage.notes,
          items_count: packageItems.length,
          email_sent: emailSent,
          email_error: emailError,
          created_by_name: callerProfile.full_name
        }
      })

    if (auditError) {
      console.error('Audit log error:', auditError)
      // Don't fail the request for audit log errors
    }

    // Return created package
    const response: PackageResponse = {
      id: newPackage.id,
      reference: newPackage.reference,
      receiver_email: newPackage.receiver_email,
      notes: newPackage.notes,
      customer_notes: newPackage.customer_notes,
      status: newPackage.status,
      created_at: newPackage.created_at,
      items: packageItems
    }

    return new Response(
      JSON.stringify({
        package: response,
        email_sent: emailSent,
        email_error: emailError
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Unexpected error:', error)
    try {
      await captureException(error, {
        logger: 'create-package',
        extra: { details: error instanceof Error ? error.stack : String(error) },
        request: {
          method: req.method,
          url: req.url,
          headers: {
            authorization_present: req.headers.get('authorization') ? 'yes' : 'no',
            origin: req.headers.get('origin') ?? ''
          }
        }
      })
    } catch (e) {
      console.warn('Sentry capture failed:', e)
    }

    const errorMessage = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: errorMessage
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
