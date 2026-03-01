/**
 * Authentication Middleware
 * Validates JWT tokens and attaches user to request context
 */

import type { RequestContext, JwtPayload } from '../types/request.ts';
import type { AuthUser, UserRole } from '../types/index.ts';
import { UnauthorizedError } from '../errors/index.ts';

// JWT secret from environment (in production, use proper secret management)
const JWT_SECRET = Deno.env.get('JWT_SECRET') || 'development-secret-change-in-production';

/**
 * Decodes and verifies a JWT token
 * In production, use a proper JWT library like djwt
 */
async function verifyToken(token: string): Promise<JwtPayload> {
  try {
    // Split the JWT into parts
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedError('Invalid token format');
    }

    // Decode the payload (base64url)
    const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload = JSON.parse(payloadStr) as JwtPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new UnauthorizedError('Token has expired');
    }

    // In production, verify signature using crypto.subtle
    // This is a simplified version for demonstration
    const encoder = new TextEncoder();
    const keyData = encoder.encode(JWT_SECRET);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signatureInput = `${parts[0]}.${parts[1]}`;
    const signature = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    );

    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(signatureInput)
    );

    if (!isValid) {
      throw new UnauthorizedError('Invalid token signature');
    }

    return payload;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      throw error;
    }
    throw new UnauthorizedError('Invalid authentication token');
  }
}

/**
 * Extracts the bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | null): string {
  if (!authHeader) {
    throw new UnauthorizedError('Authorization header is required');
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new UnauthorizedError('Invalid authorization format. Use: Bearer <token>');
  }

  return parts[1];
}

/**
 * Authentication middleware
 * Verifies JWT and attaches authenticated user to request context
 */
export async function authMiddleware(
  ctx: RequestContext,
  next: () => Promise<Response>
): Promise<Response> {
  const authHeader = ctx.request.headers.get('Authorization');

  try {
    const token = extractBearerToken(authHeader);
    const payload = await verifyToken(token);

    // Attach authenticated user to context
    ctx.user = {
      id: payload.sub,
      email: payload.email,
      role: payload.role as UserRole,
      organizationId: payload.organizationId,
      permissions: payload.permissions,
    };

    return await next();
  } catch (error) {
    throw error;
  }
}

/**
 * Creates an AuthUser object from JWT payload
 * Useful for services that need user information
 */
export function createAuthUser(payload: JwtPayload): AuthUser {
  return {
    id: payload.sub,
    email: payload.email,
    role: payload.role as UserRole,
    organizationId: payload.organizationId,
    permissions: payload.permissions,
  };
}

/**
 * Generates a JWT token for testing purposes
 * In production, this would be in a separate auth service
 */
export async function generateTestToken(user: AuthUser, expiresInSeconds: number = 3600): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId,
    permissions: user.permissions,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const encoder = new TextEncoder();
  const headerB64 = btoa(JSON.stringify(header)).replace(/=/g, '');
  const payloadB64 = btoa(JSON.stringify(payload)).replace(/=/g, '');

  const signatureInput = `${headerB64}.${payloadB64}`;

  const keyData = encoder.encode(JWT_SECRET);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(signatureInput)
  );

  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

