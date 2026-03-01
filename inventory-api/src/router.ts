/**
 * Main Router
 * Combines all feature routes and applies middleware
 */

import type { RequestContext, RouteDefinition, RouteHandler } from './core/types/request.ts';
import type { AuthUser } from './core/types/index.ts';
import { authMiddleware } from './core/middleware/auth.ts';
import { rbacMiddleware, hasPermission, hasRole } from './core/middleware/rbac.ts';
import { withErrorHandler } from './core/middleware/error-handler.ts';
import { combinedLoggerMiddleware } from './core/middleware/logger.ts';
import { createErrorResponse } from './core/utils/response.ts';
import { ErrorCode, HttpStatus } from './core/types/response.ts';

// Import feature routes
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

// Route matcher result
interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

/**
 * Matches a URL path to a route definition
 * Supports path parameters like /items/:id
 */
function matchRoute(
  method: string,
  pathname: string
): RouteMatch | null {
  for (const route of allRoutes) {
    if (route.method !== method) continue;

    // Convert route path to regex pattern
    const paramNames: string[] = [];
    const pattern = route.path.replace(/:([^/]+)/g, (_, paramName) => {
      paramNames.push(paramName);
      return '([^/]+)';
    });

    const regex = new RegExp(`^${pattern}$`);
    const match = pathname.match(regex);

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
 * Creates request context from raw request
 */
async function createRequestContext(
  request: Request,
  params: Record<string, string>
): Promise<RequestContext> {
  const url = new URL(request.url);
  const body = await parseBody(request);

  return {
    request,
    user: {} as AuthUser,  // Will be populated by auth middleware
    params,
    query: url.searchParams,
    body,
    requestId: crypto.randomUUID(),
    timestamp: new Date(),
  };
}

/**
 * Checks authorization for a route
 */
function checkAuthorization(
  ctx: RequestContext,
  route: RouteDefinition
): boolean {
  // Check required roles
  if (route.roles && route.roles.length > 0) {
    const hasRequiredRole = route.roles.some((role) =>
      hasRole(ctx.user.role, role as AuthUser['role'])
    );
    if (!hasRequiredRole) {
      return false;
    }
  }

  // Check required permissions
  if (route.permissions && route.permissions.length > 0) {
    const hasAllPermissions = route.permissions.every((permission) =>
      hasPermission(ctx.user, permission)
    );
    if (!hasAllPermissions) {
      return false;
    }
  }

  return true;
}

/**
 * Main request handler
 * Routes requests to appropriate handlers with middleware
 */
export async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname;

  // Health check endpoint (no auth required)
  if (pathname === '/health') {
    return new Response(JSON.stringify({ status: 'healthy', timestamp: new Date().toISOString() }), {
      headers: { 'Content-Type': 'application/json' },
    });
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

  // Create request context
  const ctx = await createRequestContext(request, params);

  // Apply middleware chain
  const handleWithMiddleware = async (): Promise<Response> => {
    // Logger middleware
    const logger = combinedLoggerMiddleware();

    return await logger(ctx, async () => {
      // Authentication (skip for public routes)
      if (!route.public) {
        await authMiddleware(ctx, async () => new Response());
      }

      // Authorization check
      if (!route.public && !checkAuthorization(ctx, route)) {
        return createErrorResponse(
          ErrorCode.FORBIDDEN,
          'Insufficient permissions for this operation',
          HttpStatus.FORBIDDEN,
          ctx.requestId
        );
      }

      // Call the route handler
      return await route.handler(ctx);
    });
  };

  // Wrap with error handler
  const safeHandler = withErrorHandler(async () => await handleWithMiddleware());

  return await safeHandler(ctx);
}

/**
 * CORS headers for the API
 */
export function corsHeaders(): Headers {
  const headers = new Headers();
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

/**
 * Handles CORS preflight requests
 */
export function handleCors(request: Request): Response | null {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders() });
  }
  return null;
}

