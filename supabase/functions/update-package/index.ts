// Edge Function: update-package
// Updates a package with proper authorization and audit logging
// Enforces lock checks for POD-related packages
// Deno runtime for Supabase Edge Functions

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { resolveTemplate, renderEmail, buildCommonVars } from '../_shared/email-templates.ts'
import { captureException } from '../_shared/sentry.ts'

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
  /** Optional status label to persist on the POD record (e.g. 'Delivered', 'Collected') */
  completion_status?: 'Delivered' | 'Collected'
}

interface PackageItemUpdatePayload {
  id: string
  quantity: number
}

interface PackageItemsDiff {
  updates?: PackageItemUpdatePayload[]
  deletes?: string[]
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
  /**
   * Optional items diff for editing pending/notified packages. Linked inventory
   * stock is reconciled (returned on decrease/delete, decremented on
   * increase) and a movement row is logged per affected inventory item.
   */
  items?: PackageItemsDiff
}

/**
 * `fetch` wrapper that aborts after `timeoutMs`. Resolves to a tagged
 * `{ aborted: true, error }` object instead of throwing so callers can treat
 * Resend slowness identically to any other transport failure without the
 * function ever stalling longer than the timeout.
 *
 * Deno's global `fetch` has NO default timeout — without this, a slow or
 * unreachable api.resend.com would hang the function past the mobile
 * client's AbortController and surface as "loads forever then cancels".
 */
async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response | { aborted: true; error: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError'
    return {
      aborted: true,
      error: aborted
        ? `Request to ${input} aborted after ${timeoutMs}ms`
        : e instanceof Error ? e.message : String(e)
    }
  } finally {
    clearTimeout(timer)
  }
}

const RESEND_TIMEOUT_MS = 8_000

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

    // Drivers complete deliveries from the mobile app, so they must be able
    // to call this function (e.g. to mark a package as `collected`). The
    // remaining roles continue to manage other transitions.
    if (!['warehouse', 'admin', 'collection', 'driver'].includes(callerProfile.role)) {
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
    const { package_id, status, notes, receiver_email, driver_user_id, pod, items } = body

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
    // PostgREST may embed a related row as an object when there's a single
    // related record instead of returning an array. Coerce to an array so
    // `.find` is safe regardless of the shape returned by the DB.
    const podsArray = existingPackage.pods == null
      ? []
      : Array.isArray(existingPackage.pods)
        ? existingPackage.pods
        : [existingPackage.pods]
    const lockedPod = podsArray.find((p: any) => p?.is_locked === true)
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

    // ------------------------------------------------------------------
    // Items diff (pending/notified packages only).
    //
    // When the UI sends an `items` payload, reconcile linked inventory stock
    // and mutate package_items rows BEFORE applying the package-level update.
    // Failures here abort the whole request — no package row update happens.
    //
    // Rules:
    //   * package must still be in `pending` or `notified` status (server-side gate).
    //   * `quantity` decrease or delete → return diff to inventory_items.quantity.
    //   * `quantity` increase           → decrement inventory (negative stock is allowed).
    //   * items with no inventory_item_id are mutated without touching inventory.
    //   * a movement row is inserted per affected inventory item with source='manual_edit'.
    // ------------------------------------------------------------------
    let itemChangesSummary: Record<string, unknown> | null = null
    let forcedStatusAfterItemEdits: UpdatePackageRequest['status'] | null = null
    let remainingItemCountAfterEdits: number | null = null
    // Snapshots used to render the "Package Contents Updated" email.
    let previousItemsSnapshot: { quantity: number; description: string }[] | null = null
    let updatedItemsSnapshot:  { quantity: number; description: string }[] | null = null
    if (items && (items.updates?.length || items.deletes?.length)) {
      const canEditItems = ['pending', 'notified', 'draft'].includes(existingPackage.status)
      if (!canEditItems) {
        return new Response(
          JSON.stringify({
            error: 'Package items are not editable',
            details: `Only pending or notified packages can have their items modified (current status: ${existingPackage.status}).`
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const deleteIds = Array.from(new Set((items.deletes ?? []).filter((id): id is string => !!id)))
      const deleteIdSet = new Set(deleteIds)
      // If a malformed client sends the same item in updates and deletes,
      // delete wins. This avoids updating a row immediately before deleting
      // it and, more importantly, avoids double-counting inventory returns.
      const updatePayloads = (items.updates ?? []).filter(u => !!u && !!u.id && !deleteIdSet.has(u.id))
      const updateIds = updatePayloads.map(u => u.id)

      // Validate quantities up-front
      for (const u of updatePayloads) {
        if (!Number.isInteger(u.quantity) || u.quantity < 1) {
          return new Response(
            JSON.stringify({
              error: 'Invalid item quantity',
              details: `Quantity must be a positive integer (item ${u.id})`
            }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
      }

      // Snapshot the FULL set of package_items BEFORE any mutation so the
      // notification email can render an accurate "previous contents" table.
      {
        const { data: allPrevItems, error: prevErr } = await adminClient
          .from('package_items')
          .select('quantity, description')
          .eq('package_id', package_id)
          .order('created_at', { ascending: true })
        if (!prevErr) {
          previousItemsSnapshot = (allPrevItems ?? []).map((r: any) => ({
            quantity: r.quantity,
            description: r.description
          }))
        }
      }

      // Load existing package_items belonging to this package and only the
      // ones we're being asked to mutate (defends against cross-package ids).
      const allTargetIds = Array.from(new Set([...updateIds, ...deleteIds]))
      if (allTargetIds.length === 0) {
        // Nothing to do — fall through to the normal update path.
      } else {
        const { data: targetRows, error: targetErr } = await adminClient
          .from('package_items')
          .select('id, quantity, inventory_item_id, description, package_id')
          .in('id', allTargetIds)

        if (targetErr) {
          return new Response(
            JSON.stringify({ error: 'Failed to load package items', details: targetErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const targetMap = new Map<string, { id: string; quantity: number; inventory_item_id: string | null; description: string; package_id: string }>(
          (targetRows ?? []).map((r: any) => [r.id, r])
        )
        for (const id of allTargetIds) {
          const row = targetMap.get(id)
          if (!row || row.package_id !== package_id) {
            return new Response(
              JSON.stringify({
                error: 'Invalid package item',
                details: `Item ${id} does not belong to package ${package_id}`
              }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        // Aggregate inventory deltas per inventory_item_id.
        // Positive = return to stock, negative = consume more stock.
        const inventoryDeltas = new Map<string, number>()
        const accDelta = (invId: string, d: number) => {
          inventoryDeltas.set(invId, (inventoryDeltas.get(invId) ?? 0) + d)
        }

        for (const u of updatePayloads) {
          const row = targetMap.get(u.id)!
          const diff = row.quantity - u.quantity // old - new (positive => return)
          if (diff !== 0 && row.inventory_item_id) {
            accDelta(row.inventory_item_id, diff)
          }
        }
        for (const delId of deleteIds) {
          const row = targetMap.get(delId)!
          if (row.inventory_item_id) {
            accDelta(row.inventory_item_id, row.quantity) // full return
          }
        }

        // Apply inventory adjustments BEFORE mutating package_items so a
        // stock failure leaves the package items unchanged.
        const movementInserts: Array<Record<string, unknown>> = []
        if (inventoryDeltas.size > 0) {
          const invIds = Array.from(inventoryDeltas.keys())
          const { data: invRows, error: invErr } = await adminClient
            .from('inventory_items')
            .select('id, name, quantity')
            .in('id', invIds)

          if (invErr) {
            return new Response(
              JSON.stringify({ error: 'Failed to load inventory', details: invErr.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          const invMap = new Map<string, { id: string; name: string; quantity: number }>(
            (invRows ?? []).map((r: any) => [r.id, r])
          )

          // Negative inventory is intentionally allowed (see migration
          // 20260517123000_allow_negative_inventory), so we only validate row
          // existence and then apply the aggregated deltas.

          // Apply each adjustment + queue movement rows.
          for (const [invId, delta] of inventoryDeltas) {
            const inv = invMap.get(invId)
            if (!inv || delta === 0) continue
            const newQty = inv.quantity + delta
            const { error: updErr } = await adminClient
              .from('inventory_items')
              .update({ quantity: newQty })
              .eq('id', invId)
            if (updErr) {
              return new Response(
                JSON.stringify({ error: 'Failed to update inventory', details: updErr.message }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              )
            }
            movementInserts.push({
              item_id: invId,
              user_id: callingUser.id,
              delta,
              quantity_before: inv.quantity,
              quantity_after: newQty,
              source: 'manual_edit',
              reference: existingPackage.reference,
              note: delta > 0
                ? `Returned to stock from package edit (${existingPackage.reference})`
                : `Additional deduction from package edit (${existingPackage.reference})`
            })
          }
        }

        // Mutate package_items: updates first, then deletes.
        for (const u of updatePayloads) {
          const row = targetMap.get(u.id)!
          if (row.quantity === u.quantity) continue
          const { error: updItemErr } = await adminClient
            .from('package_items')
            .update({ quantity: u.quantity })
            .eq('id', u.id)
          if (updItemErr) {
            return new Response(
              JSON.stringify({ error: 'Failed to update package item', details: updItemErr.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }
        if (deleteIds.length > 0) {
          const { error: delErr } = await adminClient
            .from('package_items')
            .delete()
            .in('id', deleteIds)
          if (delErr) {
            return new Response(
              JSON.stringify({ error: 'Failed to delete package items', details: delErr.message }),
              { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }
        }

        // Best-effort movement logging (non-fatal).
        if (movementInserts.length > 0) {
          const { error: movErr } = await adminClient
            .from('inventory_movements')
            .insert(movementInserts)
          if (movErr) {
            console.warn('inventory_movements insert failed (non-fatal):', movErr.message)
          }
        }

        // If every item was removed, the package no longer represents an
        // active order. Move it to the existing terminal `returned` status.
        const { count: remainingCount, error: remainingCountErr } = await adminClient
          .from('package_items')
          .select('id', { count: 'exact', head: true })
          .eq('package_id', package_id)

        if (remainingCountErr) {
          return new Response(
            JSON.stringify({ error: 'Failed to count remaining package items', details: remainingCountErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        remainingItemCountAfterEdits = remainingCount ?? 0
        if (remainingItemCountAfterEdits === 0) {
          forcedStatusAfterItemEdits = 'returned'
        }

        // Snapshot the FULL set of package_items AFTER mutation for the email.
        {
          const { data: allNewItems } = await adminClient
            .from('package_items')
            .select('quantity, description')
            .eq('package_id', package_id)
            .order('created_at', { ascending: true })
          updatedItemsSnapshot = (allNewItems ?? []).map((r: any) => ({
            quantity: r.quantity,
            description: r.description
          }))
        }

        itemChangesSummary = {
          updates: updatePayloads.map(u => {
            const row = targetMap.get(u.id)!
            return { id: u.id, old_quantity: row.quantity, new_quantity: u.quantity, inventory_item_id: row.inventory_item_id }
          }),
          deletes: deleteIds.map(id => {
            const row = targetMap.get(id)!
            return { id, quantity: row.quantity, inventory_item_id: row.inventory_item_id, description: row.description }
          }),
          inventory_deltas: Object.fromEntries(inventoryDeltas),
          remaining_item_count: remainingItemCountAfterEdits,
          forced_status: forcedStatusAfterItemEdits
        }
      }
    }

    const effectiveStatus = forcedStatusAfterItemEdits ?? status

    // Build update object
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString()
    }

    if (effectiveStatus !== undefined) {
      updateData.status = effectiveStatus

      // If marking as collected, set collected_at and collected_by
      if (effectiveStatus === 'collected') {
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
      .select('*, items:package_items(id, quantity, description, inventory_item_id)')
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
    if (effectiveStatus === 'collected' && pod) {
      // Resolve a staff email — prefer the staff_profiles row, fall back
      // to the auth user's email so the NOT NULL constraint is satisfied.
      const staffEmail =
        (callerProfile as { email?: string }).email ||
        callingUser.email ||
        ''

      // Derive the POD completion status. A "delivery photo" in the notes is
      // only ever attached by a driver completing a delivery, so its presence
      // forces the status to 'Delivered' regardless of the client-supplied
      // value. Otherwise fall back to the client value (or 'Collected').
      const effectiveNotes =
        (typeof updateData.notes === 'string' ? updateData.notes : undefined) ??
        updatedPackage.notes ??
        existingPackage.notes ??
        ''
      const hasDeliveryPhoto = /delivery photo/i.test(effectiveNotes)
      const completionStatus: 'Delivered' | 'Collected' =
        hasDeliveryPhoto ? 'Delivered' : (pod.completion_status ?? 'Collected')

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
        completed_by:             callingUser.id,
        completion_status:        completionStatus
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
      effectiveStatus === 'ready_for_collection' &&
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
          // Resolve template from DB (with in-code fallback) and render.
          const tpl = await resolveTemplate(adminClient, 'package_ready_for_collection')
          const rendered = renderEmail(tpl, {
            ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
            reference: updatedPackage.reference,
            po_number: poNumber || '',
            items: packageItems.map(i => ({ quantity: i.quantity, description: i.description })),
            has_items: packageItems.length > 0,
            location_name: locationName,
            location_address: locationAddress,
            location_maps_link: locationMapsLink || ''
          })
           const ccList = (tpl as any).cc && (tpl as any).cc.length ? (tpl as any).cc : undefined
           const bccList = (tpl as any).bcc && (tpl as any).bcc.length ? (tpl as any).bcc : undefined

           const emailResponse = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
              to: [updatedPackage.receiver_email],
              ...(ccList ? { cc: ccList } : {}),
              ...(bccList ? { bcc: bccList } : {}),
              subject: rendered.subject,
              html: rendered.html
            })
          }, RESEND_TIMEOUT_MS)

          if (emailResponse instanceof Response && emailResponse.ok) {
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
            readyEmailError = emailResponse instanceof Response
              ? `Email API error: ${await emailResponse.text()}`
              : `Email transport error: ${emailResponse.error}`
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
    // Send "Notified" email when transitioning to that status (e.g. Draft -> Notified)
    // Reuse the package_registered template used by creation so receivers get
    // a consistent notification when a package is marked notified.
    // ------------------------------------------------------------------
    let notifiedEmailSent = false
    let notifiedEmailError: string | null = null
    const transitionedToNotified =
      effectiveStatus === 'notified' &&
      existingPackage.status !== 'notified'

    if (transitionedToNotified) {
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
        const locationName    = deliveryLocation?.name    || Deno.env.get('COLLECTION_LOCATION') || 'the designated collection point'
        const locationAddress = deliveryLocation?.address || ''
        const locationMapsLink = deliveryLocation?.google_maps_link || null
        const poNumber: string | null = existingPackage.po_number ?? null

        if (!resendApiKey) {
          notifiedEmailError = 'Email service not configured (RESEND_API_KEY not set)'
          console.log('Notified email skipped:', notifiedEmailError)
        } else if (!updatedPackage.receiver_email) {
          notifiedEmailError = 'Package has no receiver_email; cannot send notification'
          console.warn(notifiedEmailError)
        } else {
          // Resolve template from DB (with in-code fallback) and render.
          const tpl = await resolveTemplate(adminClient, 'package_registered')
          const rendered = renderEmail(tpl, {
            ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
            reference: updatedPackage.reference,
            po_number: poNumber || '',
            notes: updatedPackage.notes || '',
            items: packageItems.map(i => ({ quantity: i.quantity, description: i.description })),
            has_items: packageItems.length > 0,
            location_name: locationName,
            location_address: locationAddress,
            location_maps_link: locationMapsLink || ''
          })
          const ccList = (tpl as any).cc && (tpl as any).cc.length ? (tpl as any).cc : undefined
          const bccList = (tpl as any).bcc && (tpl as any).bcc.length ? (tpl as any).bcc : undefined

          const emailResponse = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
              to: [updatedPackage.receiver_email],
              ...(ccList ? { cc: ccList } : {}),
              ...(bccList ? { bcc: bccList } : {}),
              subject: rendered.subject,
              html: rendered.html
            })
          }, RESEND_TIMEOUT_MS)

          if (emailResponse instanceof Response && emailResponse.ok) {
            notifiedEmailSent = true
            await adminClient.from('audit_logs').insert({
              action: 'PACKAGE_PREPARED_NOTIFICATION',
              entity_type: 'package',
              entity_id: package_id,
              performed_by: callingUser.id,
              metadata: {
                reference: updatedPackage.reference,
                receiver_email: updatedPackage.receiver_email,
                notification_type: 'email',
                notification_status: 'sent',
                email_subject: 'Package Notification'
              }
            })
          } else {
            notifiedEmailError = emailResponse instanceof Response
              ? `Email API error: ${await emailResponse.text()}`
              : `Email transport error: ${emailResponse.error}`
            console.error('Notified email send failed:', notifiedEmailError)
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        notifiedEmailError = `Email exception: ${errorMessage}`
        console.error('Notified email exception:', e)
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
      effectiveStatus === 'collected' &&
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
        const supportEmail = Deno.env.get('SUPPORT_EMAIL') || 'rabelanimm@gmail.com'
        const poNumber: string | null = existingPackage.po_number ?? null

        if (!resendApiKey) {
          completedEmailError = 'Email service not configured (RESEND_API_KEY not set)'
          console.log('Package-completed email skipped:', completedEmailError)
        } else if (!updatedPackage.receiver_email) {
          completedEmailError = 'Package has no receiver_email; cannot send notification'
          console.warn(completedEmailError)
        } else {
          // Build POD attachment (priority: pod.pdf_base64 > pods.pdf_url).
          // Filename MUST match the format used by CompletedOrdersComponent's
          // bulk ZIP download: `POD-<package_reference>[-<po_number>].pdf`.
          // A client-supplied `pod.pdf_filename` (already produced with the
          // same formula in orders.ts) takes precedence so both code paths
          // end up identical.
          const podFilename = pod?.pdf_filename
            || `POD-${updatedPackage.reference}${poNumber ? `-${poNumber}` : ''}.pdf`
          const attachments: Array<Record<string, string>> = []
          if (pod?.pdf_base64) {
            const cleanBase64 = pod.pdf_base64.replace(/^data:application\/pdf;base64,/, '')
            attachments.push({ filename: podFilename, content: cleanBase64 })
          } else {
            const { data: podRow } = await adminClient
              .from('pods')
              .select('pdf_url')
              .eq('package_id', package_id)
              .maybeSingle()
            if (podRow?.pdf_url) {
              attachments.push({ filename: podFilename, path: podRow.pdf_url })
            }
          }

          // Resolve template from DB (with in-code fallback) and render.
          const tpl = await resolveTemplate(adminClient, 'package_completed')
          const rendered = renderEmail(tpl, {
            ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
            reference: updatedPackage.reference,
            po_number: poNumber || '',
            items: packageItems.map(i => ({ quantity: i.quantity, description: i.description })),
            has_items: packageItems.length > 0
          })
          const templateCc = (tpl as any).cc && (tpl as any).cc.length ? (tpl as any).cc : undefined
          const templateBcc = (tpl as any).bcc && (tpl as any).bcc.length ? (tpl as any).bcc : undefined

          const ccAddress = templateCc ?? (Deno.env.get('PACKAGE_COMPLETED_CC') ? [Deno.env.get('PACKAGE_COMPLETED_CC') as string] : (supportEmail ? [supportEmail] : ['rabelanimm@gmail.com']))

          const emailResponse = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
              to: [updatedPackage.receiver_email],
              ...(ccAddress ? { cc: ccAddress } : {}),
              ...(templateBcc ? { bcc: templateBcc } : {}),
              subject: rendered.subject,
              ...(attachments.length > 0 ? { attachments } : {}),
              html: rendered.html
            })
          }, RESEND_TIMEOUT_MS)

          if (emailResponse instanceof Response && emailResponse.ok) {
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
                cc: [ccAddress],
                pod_attached: attachments.length > 0,
                pod_attachment_filename: attachments[0]?.filename ?? null
              }
            })
          } else {
            completedEmailError = emailResponse instanceof Response
              ? `Email API error: ${await emailResponse.text()}`
              : `Email transport error: ${emailResponse.error}`
            console.error('Package-completed email send failed:', completedEmailError)
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        completedEmailError = `Email exception: ${errorMessage}`
        console.error('Package-completed email exception:', e)
      }
    }

    // ------------------------------------------------------------------
    // Send "Package Contents Updated" email when items were edited.
    //
    // Fires whenever the items diff actually mutated the package. Renders
    // the new contents alongside the previous contents so the receiver can
    // see exactly what changed. Email failures are non-fatal.
    // ------------------------------------------------------------------
    let itemsUpdatedEmailSent = false
    let itemsUpdatedEmailError: string | null = null
    if (itemChangesSummary) {
      try {
        const resendApiKey = Deno.env.get('RESEND_API_KEY')
        const poNumber: string | null = existingPackage.po_number ?? null

        const previousItems = previousItemsSnapshot ?? []
        const updatedItems  = updatedItemsSnapshot  ?? []

        if (!resendApiKey) {
          itemsUpdatedEmailError = 'Email service not configured (RESEND_API_KEY not set)'
          console.log('Items-updated email skipped:', itemsUpdatedEmailError)
        } else if (!updatedPackage.receiver_email) {
          itemsUpdatedEmailError = 'Package has no receiver_email; cannot send notification'
          console.warn(itemsUpdatedEmailError)
        } else {
          // Resolve template from DB (with in-code fallback) and render.
          const tpl = await resolveTemplate(adminClient, 'package_contents_updated')
          const rendered = renderEmail(tpl, {
            ...buildCommonVars((k) => Deno.env.get(k) ?? undefined),
            reference: updatedPackage.reference,
            po_number: poNumber || '',
            updated_items: updatedItems,
            has_updated_items: updatedItems.length > 0,
            previous_items: previousItems,
            has_previous_items: previousItems.length > 0
          })
          const ccList = (tpl as any).cc && (tpl as any).cc.length ? (tpl as any).cc : undefined
          const bccList = (tpl as any).bcc && (tpl as any).bcc.length ? (tpl as any).bcc : undefined

          const emailResponse = await fetchWithTimeout('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              from: Deno.env.get('EMAIL_FROM') || 'POD System <noreply@example.com>',
              to: [updatedPackage.receiver_email],
              ...(ccList ? { cc: ccList } : {}),
              ...(bccList ? { bcc: bccList } : {}),
              subject: rendered.subject,
              html: rendered.html
            })
          }, RESEND_TIMEOUT_MS)

          if (emailResponse instanceof Response && emailResponse.ok) {
            itemsUpdatedEmailSent = true
            await adminClient.from('audit_logs').insert({
              action: 'PACKAGE_ITEMS_UPDATED_NOTIFICATION',
              entity_type: 'package',
              entity_id: package_id,
              performed_by: callingUser.id,
              metadata: {
                reference: updatedPackage.reference,
                receiver_email: updatedPackage.receiver_email,
                notification_type: 'email',
                notification_status: 'sent',
                email_subject: 'Package Contents Updated',
                previous_item_count: previousItems.length,
                updated_item_count: updatedItems.length
              }
            })
          } else {
            itemsUpdatedEmailError = emailResponse instanceof Response
              ? `Email API error: ${await emailResponse.text()}`
              : `Email transport error: ${emailResponse.error}`
            console.error('Items-updated email send failed:', itemsUpdatedEmailError)
          }
        }
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        itemsUpdatedEmailError = `Email exception: ${errorMessage}`
        console.error('Items-updated email exception:', e)
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
        notified_email_sent: transitionedToNotified ? notifiedEmailSent : undefined,
        notified_email_error: transitionedToNotified ? notifiedEmailError : undefined,
        completed_email_sent: transitionedToCollected ? completedEmailSent : undefined,
        completed_email_error: transitionedToCollected ? completedEmailError : undefined,
        items_updated_email_sent: itemChangesSummary ? itemsUpdatedEmailSent : undefined,
        items_updated_email_error: itemChangesSummary ? itemsUpdatedEmailError : undefined,
        item_changes: itemChangesSummary,
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
        ...(transitionedToNotified
          ? { email_sent: notifiedEmailSent, email_error: notifiedEmailError }
          : transitionedToReady
            ? { email_sent: readyEmailSent, email_error: readyEmailError }
            : transitionedToCollected
              ? { email_sent: completedEmailSent, email_error: completedEmailError }
              : {}),
        ...(itemChangesSummary
          ? { items_email_sent: itemsUpdatedEmailSent, items_email_error: itemsUpdatedEmailError }
          : {})
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    try {
      // Best-effort: report the exception to Sentry if configured.
      await captureException(error, {
        logger: 'update-package',
        extra: { details: error instanceof Error ? error.stack : String(error) },
        request: {
          method: req.method,
          url: req.url,
          // Avoid leaking secrets (e.g. full Authorization JWT). Only send
          // presence indicators or non-sensitive headers.
          headers: {
            authorization_present: req.headers.get('authorization') ? 'yes' : 'no',
            origin: req.headers.get('origin') ?? ''
          }
        }
      })
    } catch (e) {
      console.warn('Sentry capture failed:', e)
    }

    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

