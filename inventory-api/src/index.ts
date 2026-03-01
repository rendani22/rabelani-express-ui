/**
 * Inventory Management API - Main Entry Point
 * Edge Function entry point for Deno Deploy or Vercel Edge
 */

import { handleRequest, handleCors, corsHeaders } from './router.ts';
import { db } from './database/client.ts';

/**
 * Main server handler
 * This is the entry point for all incoming requests
 */
async function handler(request: Request): Promise<Response> {
  // Handle CORS preflight
  const corsResponse = handleCors(request);
  if (corsResponse) {
    return corsResponse;
  }

  // Handle the request
  const response = await handleRequest(request);

  // Add CORS headers to response
  const headers = corsHeaders();
  response.headers.forEach((value, key) => {
    headers.set(key, value);
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Initialize the application
 * Sets up database connections and other startup tasks
 */
async function initialize(): Promise<void> {
  console.log('🚀 Starting Inventory Management API...');

  // Connect to database
  try {
    await db.connect();
    console.log('✅ Database connected');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    // In edge functions, we might want to continue anyway
    // and let individual requests handle connection errors
  }

  console.log('✅ Inventory Management API ready');
  console.log(`📚 Environment: ${Deno.env.get('ENVIRONMENT') || 'development'}`);
}

/**
 * Cleanup on shutdown
 */
async function cleanup(): Promise<void> {
  console.log('🛑 Shutting down Inventory Management API...');
  await db.disconnect();
  console.log('✅ Cleanup complete');
}

// Initialize on startup
await initialize();

// Handle graceful shutdown
Deno.addSignalListener('SIGINT', async () => {
  await cleanup();
  Deno.exit(0);
});

Deno.addSignalListener('SIGTERM', async () => {
  await cleanup();
  Deno.exit(0);
});

// Start serving (Deno.serve for Deno Deploy)
const port = parseInt(Deno.env.get('PORT') || '8000', 10);

console.log(`🌐 Server listening on http://localhost:${port}`);

Deno.serve({ port }, handler);

// Export for testing
export { handler, initialize, cleanup };

