/**
 * Request and Mutation Logging Middleware
 * Logs all incoming requests and tracks mutations for audit purposes
 */

import type { RequestContext, Middleware } from '../types/request.ts';
import type { HttpMethod } from '../types/index.ts';

// Log levels for different operations
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// Request log entry structure
interface RequestLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  userId?: string;
  organizationId?: string;
  userAgent?: string;
  ip?: string;
  duration?: number;
  status?: number;
}

// Mutation log entry for write operations
interface MutationLogEntry extends RequestLogEntry {
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  resource: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Determines if an HTTP method is a mutation (write operation)
 */
function isMutation(method: string): boolean {
  const mutationMethods: HttpMethod[] = ['POST', 'PUT', 'PATCH', 'DELETE'];
  return mutationMethods.includes(method as HttpMethod);
}

/**
 * Extracts client IP from request headers
 */
function getClientIP(request: Request): string | undefined {
  // Check various headers that might contain the real client IP
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.headers.get('cf-connecting-ip') ||  // Cloudflare
    undefined
  );
}

/**
 * Sanitizes request body for logging (removes sensitive data)
 */
function sanitizePayload(payload: unknown): Record<string, unknown> | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(payload)) {
    if (sensitiveFields.some((field) => key.toLowerCase().includes(field.toLowerCase()))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizePayload(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Formats log output with color coding (for terminal)
 */
function formatLog(level: LogLevel, entry: RequestLogEntry | MutationLogEntry): string {
  const colors: Record<LogLevel, string> = {
    debug: '\x1b[36m',  // Cyan
    info: '\x1b[32m',   // Green
    warn: '\x1b[33m',   // Yellow
    error: '\x1b[31m',  // Red
  };
  const reset = '\x1b[0m';

  const timestamp = entry.timestamp;
  const method = entry.method.padEnd(6);
  const status = entry.status ? `[${entry.status}]` : '';
  const duration = entry.duration ? `${entry.duration}ms` : '';
  const user = entry.userId ? `user:${entry.userId.slice(0, 8)}` : 'anonymous';

  return `${colors[level]}[${timestamp}]${reset} ${method} ${entry.path} ${status} ${duration} ${user}`;
}

/**
 * Logs to console and optionally to external service
 */
function log(level: LogLevel, entry: RequestLogEntry | MutationLogEntry): void {
  const formatted = formatLog(level, entry);

  switch (level) {
    case 'error':
      console.error(formatted, entry);
      break;
    case 'warn':
      console.warn(formatted, entry);
      break;
    case 'debug':
      console.debug(formatted);
      break;
    default:
      console.log(formatted);
  }

  // In production, send to logging service (DataDog, CloudWatch, etc.)
  // sendToLoggingService(entry);
}

/**
 * Request logging middleware
 * Logs all incoming requests with timing information
 */
export function requestLoggerMiddleware(): Middleware {
  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    const startTime = performance.now();
    const url = new URL(ctx.request.url);

    const logEntry: RequestLogEntry = {
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      method: ctx.request.method,
      path: url.pathname,
      userId: ctx.user?.id,
      organizationId: ctx.user?.organizationId,
      userAgent: ctx.request.headers.get('user-agent') || undefined,
      ip: getClientIP(ctx.request),
    };

    try {
      const response = await next();

      // Calculate request duration
      logEntry.duration = Math.round(performance.now() - startTime);
      logEntry.status = response.status;

      // Log based on status code
      if (response.status >= 500) {
        log('error', logEntry);
      } else if (response.status >= 400) {
        log('warn', logEntry);
      } else {
        log('info', logEntry);
      }

      return response;
    } catch (error) {
      logEntry.duration = Math.round(performance.now() - startTime);
      logEntry.status = 500;
      log('error', logEntry);
      throw error;
    }
  };
}

/**
 * Mutation logging middleware
 * Specifically logs write operations with payload information
 */
export function mutationLoggerMiddleware(): Middleware {
  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    // Only log mutations
    if (!isMutation(ctx.request.method)) {
      return await next();
    }

    const url = new URL(ctx.request.url);

    // Determine action type from HTTP method
    const actionMap: Record<string, MutationLogEntry['action']> = {
      POST: 'CREATE',
      PUT: 'UPDATE',
      PATCH: 'UPDATE',
      DELETE: 'DELETE',
    };

    const mutationLog: MutationLogEntry = {
      timestamp: new Date().toISOString(),
      requestId: ctx.requestId,
      method: ctx.request.method,
      path: url.pathname,
      userId: ctx.user?.id,
      organizationId: ctx.user?.organizationId,
      action: actionMap[ctx.request.method] || 'UPDATE',
      resource: extractResourceName(url.pathname),
      resourceId: ctx.params.id,
      payload: sanitizePayload(ctx.body),
    };

    console.log(`[MUTATION] ${mutationLog.action} ${mutationLog.resource}`, {
      requestId: mutationLog.requestId,
      userId: mutationLog.userId,
      resourceId: mutationLog.resourceId,
    });

    return await next();
  };
}

/**
 * Extracts the resource name from the URL path
 * e.g., /api/v1/stock/123 -> 'stock'
 */
function extractResourceName(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // Skip 'api' and version prefix if present
  const resourceIndex = segments.findIndex((s) => !['api', 'v1', 'v2'].includes(s));
  return segments[resourceIndex] || 'unknown';
}

/**
 * Combined logger that includes both request and mutation logging
 */
export function combinedLoggerMiddleware(): Middleware {
  const requestLogger = requestLoggerMiddleware();
  const mutationLogger = mutationLoggerMiddleware();

  return async (ctx: RequestContext, next: () => Promise<Response>): Promise<Response> => {
    // Run mutation logger first (inside request logger for timing)
    return await requestLogger(ctx, () => mutationLogger(ctx, next));
  };
}

