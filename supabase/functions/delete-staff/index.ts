// Edge Function: delete-staff
// Permanently deletes a staff member's auth user (admin only). Deleting the
// auth.users row cascades away the staff_profiles row, notifications, push
// tokens, and live driver locations. Historical attribution that is ON DELETE
// SET NULL (status history, inventory movements) is preserved with the actor
// nulled. Records that RESTRICT the delete (packages they created/handled, PODs
// they completed, catalog/locations/receivers/staff they created) will block
// the delete — we surface that as a "deactivate instead" message rather than
// destroying audit history.
//
// Deno runtime for Supabase Edge Functions.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

interface DeleteStaffRequest {
  user_id: string
}

function buildCorsHeaders(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'Authorization, X-Requested-With, X-Client-Info, apikey, Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  }
}

/** True when the DB error looks like a foreign-key RESTRICT violation. */
function isForeignKeyViolation(message: string | undefined): boolean {
  if (!message) return false
  return /foreign key|violates foreign key|23503|still referenced/i.test(message)
}

serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = buildCorsHeaders(origin)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const json = (body: unknown, status: number) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ error: 'Missing authorization header' }, 401)
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // User client to verify the caller.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: callingUser },
      error: userError,
    } = await userClient.auth.getUser()
    if (userError || !callingUser) {
      return json(
        {
          error: 'Unauthorized',
          details: userError?.message || 'Could not verify user token',
        },
        401,
      )
    }

    // Deleting a staff member removes an account and its access — gated on
    // users.manage, which is seeded to admins only (same gate as create-staff).
    const { data: canManageUsers } = await userClient.rpc('has_permission', {
      p_key: 'users.manage',
    })

    if (!canManageUsers) {
      return json(
        {
          error: 'You do not have permission to delete staff profiles',
          details: "Requires the 'users.manage' permission",
        },
        403,
      )
    }

    const body = (await req.json()) as DeleteStaffRequest
    const userId = body?.user_id
    if (!userId) {
      return json({ error: 'Missing required field: user_id' }, 400)
    }

    // An admin cannot delete their own account (prevents self-lockout; the
    // last-admin DB trigger covers the wider case).
    if (userId === callingUser.id) {
      return json(
        {
          error: 'You cannot delete your own account',
          details: 'Ask another admin to remove your account if needed.',
        },
        400,
      )
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)

    if (deleteError) {
      if (isForeignKeyViolation(deleteError.message)) {
        return json(
          {
            error:
              'This user has activity history (packages, deliveries, PODs) and cannot be permanently deleted.',
            details: 'Deactivate the account instead to revoke access while keeping records intact.',
            code: 'has_activity',
          },
          409,
        )
      }
      return json({ error: `Failed to delete user: ${deleteError.message}` }, 400)
    }

    return json({ success: true }, 200)
  } catch (error) {
    return json({ error: (error as Error).message }, 500)
  }
})
