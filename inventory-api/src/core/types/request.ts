/**
 * Request context types for Edge Functions
 * Extends native Request with authentication and metadata
 */

import type { AuthUser } from './index.ts';

// Extended request context with authentication
export interface RequestContext {
  request: Request;
  user: AuthUser;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
  requestId: string;
  timestamp: Date;
}

// Route handler function signature
export type RouteHandler = (ctx: RequestContext) => Promise<Response>;

// Route definition for the router
export interface RouteDefinition {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  handler: RouteHandler;
  // Required roles for this route (empty means any authenticated user)
  roles?: string[];
  // Required permissions for this route
  permissions?: string[];
  // Skip authentication for this route
  public?: boolean;
}

// Middleware function signature
export type Middleware = (
  ctx: RequestContext,
  next: () => Promise<Response>
) => Promise<Response>;

// Route parameters extracted from URL
export interface RouteParams {
  [key: string]: string;
}

// Parsed query string parameters
export interface QueryParams {
  page?: string;
  limit?: string;
  sortBy?: string;
  sortOrder?: string;
  search?: string;
  [key: string]: string | undefined;
}

// JWT token payload structure
export interface JwtPayload {
  sub: string;           // User ID
  email: string;
  role: string;
  organizationId: string;
  permissions: string[];
  iat: number;           // Issued at
  exp: number;           // Expiration
}

