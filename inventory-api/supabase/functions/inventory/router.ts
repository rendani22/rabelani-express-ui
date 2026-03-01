/**
 * Supabase Edge Function Router
 * Handles routing for Supabase Edge Functions
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import type { RequestContext, RouteDefinition } from './core/types/request.ts';
import type { AuthUser } from './core/types/index.ts';
import { createErrorResponse } from './core/utils/response.ts';
import { ErrorCode, HttpStatus } from './core/types/response.ts';

// Import all routes
import { stockRoutes } from './features/stock/routes.ts';
import { itemsRoutes } from './features/items/routes.ts';
import { movementsRoutes } from './features/movements/routes.ts';
import { alertsRoutes } from './features/alerts/routes.ts';
import { reportsRoutes } from './features/reports/routes.ts';
import { purchasingRoutes } from './features/purchasing/routes.ts';
import { usageRoutes } from './features/usage/routes.ts';

// Combine all routes
const allRoutes: RouteDefinition[] = [
  ...stockRoutes,
  ...itemsRoutes,
  ...movementsRoutes,
  ...alertsRoutes,
  ...reportsRoutes,
  ...purchasingRoutes,
  ...usageRoutes,
];

/**
 * CORS headers for Supabase Edge Functions
 */
export function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'authorization, x-client-info, apikey, content-type');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

/**
 * Route match result
 */
interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

/**
 * Matches a URL path to a route definition
 */
function matchRoute(method: string, pathname: string): RouteMatch | null {
  // Remove /inventory prefix if present (Supabase function name)
  const normalizedPath = pathname.replace(/^\/inventory/, '') || '/';

  for (const route of allRoutes) {
    if (route.method !== method) continue;

    const paramNames: string[] = [];
    const pattern = route.path.replace(/:([^/]+)/g, (_: string, paramName: string) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${pattern}$`);
    const match = normalizedPath.match(regex);

    if (match) {
      const params: Record<string, string> = {};
      paramNames.forEach((name, index) => {
        params[name] = match[index + 1];
      });
      return { route, params };
    }
  }

  return null;
}

/**
 * Extracts user from Supabase JWT
 */
async function extractUserFromRequest(req: Request): Promise<AuthUser | null> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.replace('Bearer ', '');

  // Create a Supabase client with the user's token to verify it
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  // Extract user metadata - adjust based on your user structure
  const metadata = user.user_metadata || {};

  return {
    id: user.id,
    email: user.email || '',
    role: metadata.role || 'viewer',
    organizationId: metadata.organization_id || metadata.organizationId || '',
    permissions: metadata.permissions || [],
  };
}

/**
 * Parses JSON body from request
 */
async function parseBody(request: Request): Promise<unknown> {
  const contentType = request.headers.get('content-type');

  if (contentType?.includes('application/json')) {
    try {
      const text = await request.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  return {};
}

/**
 * Creates request context
 */
async function createRequestContext(
  request: Request,
  params: Record<string, string>,
  user: AuthUser
): Promise<RequestContext> {
  const url = new URL(request.url);
  const body = await parseBody(request);

  return {
    request,
    user,
    params,
    query: url.searchParams,
    body,
    requestId: crypto.randomUUID(),
    timestamp: new Date(),
  };
}

/**
 * Checks if user has required permissions
 */
function hasPermission(user: AuthUser, permission: string): boolean {
  // Admin has all permissions
  if (user.role === 'admin') return true;

  // Check explicit permissions
  if (user.permissions?.includes(permission)) return true;

  // Check wildcard permissions
  const [resource] = permission.split(':');
  if (user.permissions?.includes(`${resource}:*`)) return true;

  // Role-based defaults
  const rolePermissions: Record<string, string[]> = {
    manager: ['stock:*', 'items:*', 'movements:*', 'alerts:*', 'reports:*', 'suppliers:*', 'purchasing:*', 'usage:*'],
    operator: ['stock:read', 'stock:update', 'items:read', 'movements:read', 'movements:create', 'alerts:read', 'reports:read', 'usage:read', 'usage:create'],
    viewer: ['stock:read', 'items:read', 'movements:read', 'alerts:read', 'reports:read', 'usage:read'],
  };

  const userRolePermissions = rolePermissions[user.role] || [];
  return userRolePermissions.includes(permission) || userRolePermissions.includes(`${resource}:*`);
}

/**
 * Checks authorization for a route
 */
function checkAuthorization(user: AuthUser, route: RouteDefinition): boolean {
  // Check roles if specified
  if (route.roles && route.roles.length > 0) {
    const roleHierarchy: Record<string, number> = { viewer: 1, operator: 2, manager: 3, admin: 4 };
    const userLevel = roleHierarchy[user.role] || 0;
    const hasRole = route.roles.some((role: string) => userLevel >= (roleHierarchy[role] || 0));
    if (!hasRole) return false;
  }

  // Check permissions
  if (route.permissions && route.permissions.length > 0) {
    const hasAllPermissions = route.permissions.every((p: string) => hasPermission(user, p));
    if (!hasAllPermissions) return false;
  }

  return true;
}

/**
 * Main request handler for Supabase Edge Function
 */
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Health check
  if (pathname === '/inventory/health' || pathname === '/health') {
    return new Response(
      JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Match route
  const match = matchRoute(request.method, pathname);

  if (!match) {
    return createErrorResponse(
      ErrorCode.NOT_FOUND,
      `Route ${request.method} ${pathname} not found`,
      HttpStatus.NOT_FOUND
    );
  }

  const { route, params } = match;

  try {
    // Authenticate user (skip for public routes)
    let user: AuthUser;

    if (route.public) {
      user = { id: 'anonymous', email: '', role: 'viewer', organizationId: '', permissions: [] };
    } else {
      const extractedUser = await extractUserFromRequest(request);

      if (!extractedUser) {
        return createErrorResponse(
          ErrorCode.UNAUTHORIZED,
          'Authentication required',
          HttpStatus.UNAUTHORIZED
        );
      }

      user = extractedUser;

      // Check authorization
      if (!checkAuthorization(user, route)) {
        return createErrorResponse(
          ErrorCode.FORBIDDEN,
          'Insufficient permissions',
          HttpStatus.FORBIDDEN
        );
      }
    }

    // Create request context
    const ctx = await createRequestContext(request, params, user);

    // Log the request
    console.log(`[${ctx.requestId}] ${request.method} ${pathname} - User: ${user.email || 'anonymous'}`);

    // Call the route handler
    const response = await route.handler(ctx);

    // Log completion
    console.log(`[${ctx.requestId}] Completed with status ${response.status}`);

    return response;
  } catch (error) {
    console.error('Request error:', error);

    const message = error instanceof Error ? error.message : 'An unexpected error occurred';
    const code = (error as { code?: string })?.code || ErrorCode.INTERNAL_ERROR;
    const statusCode = (error as { statusCode?: number })?.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;

    return createErrorResponse(code, message, statusCode);
  }
}





