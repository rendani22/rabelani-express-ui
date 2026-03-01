/**
 * Standardized API response utilities
 * Provides helper functions to create consistent response formats
 */

import type {
  ApiSuccessResponse,
  ApiErrorResponse,
  PaginationMeta,
  HttpStatusCode
} from '../types/response.ts';
import { HttpStatus } from '../types/response.ts';
import type { PaginatedResult } from '../types/index.ts';

/**
 * Creates a successful JSON response with proper headers
 */
export function createSuccessResponse<T>(
  data: T,
  statusCode: HttpStatusCode = HttpStatus.OK,
  requestId?: string
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      requestId: requestId ?? crypto.randomUUID(),
    },
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': body.meta!.requestId,
    },
  });
}

/**
 * Creates a paginated response with pagination metadata
 */
export function createPaginatedResponse<T>(
  result: PaginatedResult<T>,
  requestId?: string
): Response {
  const body: ApiSuccessResponse<T[]> = {
    success: true,
    data: result.data,
    meta: {
      pagination: result.pagination,
      timestamp: new Date().toISOString(),
      requestId: requestId ?? crypto.randomUUID(),
    },
  };

  return new Response(JSON.stringify(body), {
    status: HttpStatus.OK,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': body.meta!.requestId,
    },
  });
}

/**
 * Creates an error response with standardized format
 */
export function createErrorResponse(
  code: string,
  message: string,
  statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
  requestId?: string,
  details?: Record<string, unknown>
): Response {
  const isDevelopment = Deno.env.get('ENVIRONMENT') !== 'production';

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && { details }),
    },
    requestId: requestId ?? crypto.randomUUID(),
  };

  return new Response(JSON.stringify(body), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': body.requestId,
    },
  });
}

/**
 * Creates a 201 Created response
 */
export function createCreatedResponse<T>(data: T, requestId?: string): Response {
  return createSuccessResponse(data, HttpStatus.CREATED, requestId);
}

/**
 * Creates a 204 No Content response
 */
export function createNoContentResponse(): Response {
  return new Response(null, { status: HttpStatus.NO_CONTENT });
}

/**
 * Helper to calculate pagination metadata
 */
export function calculatePagination(
  page: number,
  limit: number,
  totalItems: number
): PaginationMeta {
  const totalPages = Math.ceil(totalItems / limit);

  return {
    page,
    limit,
    totalItems,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/**
 * Parses pagination parameters from query string with defaults
 */
export function parsePaginationParams(query: URLSearchParams): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(query.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(query.get('limit') ?? '20', 10)));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

