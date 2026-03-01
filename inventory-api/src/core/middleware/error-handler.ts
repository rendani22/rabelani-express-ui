/**
 * Global Error Handler Middleware
 * Catches all errors and converts them to standardized API responses
 */

import type { RequestContext, RouteHandler } from '../types/request.ts';
import { AppError, ValidationError } from '../errors/index.ts';
import { createErrorResponse } from '../utils/response.ts';
import { ErrorCode, HttpStatus } from '../types/response.ts';

/**
 * Wraps a route handler with error handling
 * Converts all errors to standardized API error responses
 */
export function withErrorHandler(handler: RouteHandler): RouteHandler {
  return async (ctx: RequestContext): Promise<Response> => {
    try {
      return await handler(ctx);
    } catch (error) {
      return handleError(error, ctx.requestId);
    }
  };
}

/**
 * Converts an error to an API error response
 */
export function handleError(error: unknown, requestId?: string): Response {
  const isDevelopment = Deno.env.get('ENVIRONMENT') !== 'production';

  // Handle known application errors
  if (error instanceof AppError) {
    // Special handling for validation errors
    if (error instanceof ValidationError) {
      return createErrorResponse(
        error.code,
        error.message,
        error.statusCode,
        requestId,
        { errors: error.validationErrors }
      );
    }

    // Log the error for monitoring
    logError(error, requestId);

    return createErrorResponse(
      error.code,
      error.message,
      error.statusCode,
      requestId,
      isDevelopment ? error.details : undefined
    );
  }

  // Handle unknown errors
  if (error instanceof Error) {
    logError(error, requestId);

    return createErrorResponse(
      ErrorCode.INTERNAL_ERROR,
      isDevelopment ? error.message : 'An unexpected error occurred',
      HttpStatus.INTERNAL_SERVER_ERROR,
      requestId,
      isDevelopment ? { stack: error.stack } : undefined
    );
  }

  // Handle non-Error throws (shouldn't happen, but be safe)
  logError(new Error(String(error)), requestId);

  return createErrorResponse(
    ErrorCode.INTERNAL_ERROR,
    'An unexpected error occurred',
    HttpStatus.INTERNAL_SERVER_ERROR,
    requestId
  );
}

/**
 * Logs an error with context information
 */
function logError(error: Error, requestId?: string): void {
  const timestamp = new Date().toISOString();
  const errorInfo = {
    timestamp,
    requestId,
    name: error.name,
    message: error.message,
    stack: error.stack,
  };

  // In production, this would send to a logging service
  console.error('[ERROR]', JSON.stringify(errorInfo, null, 2));
}

/**
 * Creates a middleware-style error handler for the entire application
 */
export function errorHandlerMiddleware(
  ctx: RequestContext,
  next: () => Promise<Response>
): Promise<Response> {
  return next().catch((error) => handleError(error, ctx.requestId));
}

/**
 * Creates a safe wrapper that prevents unhandled promise rejections
 */
export function safeHandler<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T
): T {
  return (async (...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('[UNHANDLED ERROR]', error);
      return createErrorResponse(
        ErrorCode.INTERNAL_ERROR,
        'Internal server error',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }) as T;
}

