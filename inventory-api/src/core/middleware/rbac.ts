/**
 * Role-Based Access Control (RBAC) Middleware
 * Enforces role and permission requirements for routes
 */

import type { RequestContext, Middleware } from '../types/request.ts';
import type { UserRole } from '../types/index.ts';
import { ForbiddenError } from '../errors/index.ts';

// Role hierarchy - higher roles inherit permissions from lower roles
const ROLE_HIERARCHY: Record<UserRole, number> = {
  viewer: 1,
  operator: 2,
  manager: 3,
  admin: 4,
};

// Permission definitions by role
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  viewer: [
    'stock:read',
    'items:read',
    'movements:read',
    'alerts:read',
    'reports:read',
    'suppliers:read',
    'usage:read',
  ],
  operator: [
    'stock:read',
    'stock:update',
    'items:read',
    'movements:read',
    'movements:create',
    'alerts:read',
    'reports:read',
    'suppliers:read',
    'usage:read',
    'usage:create',
  ],
  manager: [
    'stock:read',
    'stock:create',
    'stock:update',
    'items:read',
    'items:create',
    'items:update',
    'movements:read',
    'movements:create',
    'movements:approve',
    'alerts:read',
    'alerts:create',
    'alerts:update',
    'reports:read',
    'suppliers:read',
    'suppliers:create',
    'purchasing:read',
    'purchasing:create',
    'usage:read',
    'usage:create',
  ],
  admin: [
    'stock:*',
    'items:*',
    'movements:*',
    'alerts:*',
    'reports:*',
    'suppliers:*',
    'purchasing:*',
    'usage:*',
    'admin:*',
  ],
};

/**
 * Checks if a user has a specific permission
 * Supports wildcard permissions (e.g., 'stock:*')
 */
export function hasPermission(user: { role: UserRole; permissions?: string[] }, permission: string): boolean {
  // Check explicit permissions on user object first
  if (user.permissions?.includes(permission)) {
    return true;
  }

  // Check role-based permissions
  const rolePermissions = ROLE_PERMISSIONS[user.role] || [];

  // Direct permission check
  if (rolePermissions.includes(permission)) {
    return true;
  }

  // Wildcard check (e.g., 'stock:*' matches 'stock:read')
  const [resource] = permission.split(':');
  if (rolePermissions.includes(`${resource}:*`)) {
    return true;
  }

  return false;
}

/**
 * Checks if user's role meets or exceeds the required role level
 */
export function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole];
}

/**
 * Creates a middleware that requires specific roles
 * Usage: requireRoles(['admin', 'manager'])
 */
export function requireRoles(allowedRoles: UserRole[]): Middleware {
  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    if (!ctx.user) {
      throw new ForbiddenError('Authentication required');
    }

    const userRole = ctx.user.role;

    // Check if user's role is in the allowed list
    const isAllowed = allowedRoles.some((role) => hasRole(userRole, role));

    if (!isAllowed) {
      throw new ForbiddenError(
        `This action requires one of the following roles: ${allowedRoles.join(', ')}`
      );
    }

    return await next();
  };
}

/**
 * Creates a middleware that requires specific permissions
 * Usage: requirePermissions(['stock:create', 'stock:update'])
 */
export function requirePermissions(requiredPermissions: string[]): Middleware {
  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    if (!ctx.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Check that user has ALL required permissions
    const missingPermissions = requiredPermissions.filter(
      (permission) => !hasPermission(ctx.user, permission)
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenError(
        `Missing required permissions: ${missingPermissions.join(', ')}`
      );
    }

    return await next();
  };
}

/**
 * Creates a middleware that requires ANY of the specified permissions
 * Usage: requireAnyPermission(['stock:create', 'items:create'])
 */
export function requireAnyPermission(permissions: string[]): Middleware {
  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    if (!ctx.user) {
      throw new ForbiddenError('Authentication required');
    }

    const hasAny = permissions.some((permission) => hasPermission(ctx.user, permission));

    if (!hasAny) {
      throw new ForbiddenError(
        `Requires at least one of: ${permissions.join(', ')}`
      );
    }

    return await next();
  };
}

/**
 * Ensures user can only access resources within their organization
 */
export function requireSameOrganization(organizationId: string): (ctx: RequestContext) => void {
  return (ctx: RequestContext): void => {
    if (ctx.user.organizationId !== organizationId && ctx.user.role !== 'admin') {
      throw new ForbiddenError('Cannot access resources from another organization');
    }
  };
}

/**
 * Combined RBAC middleware that checks both roles and permissions
 */
export function rbacMiddleware(
  options: {
    roles?: UserRole[];
    permissions?: string[];
    requireAll?: boolean;  // If false, only one permission needs to match
  }
): Middleware {
  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    if (!ctx.user) {
      throw new ForbiddenError('Authentication required');
    }

    // Check roles if specified
    if (options.roles && options.roles.length > 0) {
      const hasRequiredRole = options.roles.some((role) => hasRole(ctx.user.role, role));
      if (!hasRequiredRole) {
        throw new ForbiddenError('Insufficient role privileges');
      }
    }

    // Check permissions if specified
    if (options.permissions && options.permissions.length > 0) {
      if (options.requireAll !== false) {
        // Require ALL permissions (default)
        const missingPermissions = options.permissions.filter(
          (p) => !hasPermission(ctx.user, p)
        );
        if (missingPermissions.length > 0) {
          throw new ForbiddenError(
            `Missing permissions: ${missingPermissions.join(', ')}`
          );
        }
      } else {
        // Require ANY permission
        const hasAny = options.permissions.some((p) => hasPermission(ctx.user, p));
        if (!hasAny) {
          throw new ForbiddenError('Insufficient permissions');
        }
      }
    }

    return await next();
  };
}

