/**
 * Supabase Edge Function Entry Point
 * Compatible with Supabase Edge Functions runtime
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { handleRequest, corsHeaders } from './router.ts';

// Supabase client initialization
// These environment variables are automatically available in Supabase Edge Functions
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Create Supabase client with service role for backend operations
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

/**
 * Main handler for Supabase Edge Function
 * Follows Supabase Edge Functions conventions
 */
serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }

  try {
    // Handle the request through our router
    const response = await handleRequest(req);

    // Add CORS headers to response
    const headers = new Headers(response.headers);
    corsHeaders().forEach((value: string, key: string) => {
      headers.set(key, value);
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  } catch (error) {
    console.error('Edge function error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: error instanceof Error ? error.message : 'An unexpected error occurred',
        },
      }),
      {
        status: 500,
        headers: {
          ...Object.fromEntries(corsHeaders()),
          'Content-Type': 'application/json',
        },
      }
    );
  }
});


