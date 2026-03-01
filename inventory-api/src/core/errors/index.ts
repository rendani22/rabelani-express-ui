/**
 * Custom error classes for the Inventory Management API
 * Provides structured error handling with proper status codes
 */

import { ErrorCode, HttpStatus, type ErrorCodeType, type HttpStatusCode } from '../types/response.ts';

/**
 * Base application error class
 * All custom errors extend this class
 */
export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCodeType;
  public readonly isOperational: boolean;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    statusCode: HttpStatusCode = HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCodeType = ErrorCode.INTERNAL_ERROR,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;  // Indicates this is a known operational error
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    Error.captureStackTrace?.(this, this.constructor);
  }
}

/**
 * Validation error - thrown when input validation fails
 */
export class ValidationError extends AppError {
  public readonly validationErrors: Array<{ field: string; message: string; code: string }>;

  constructor(
    message: string,
    validationErrors: Array<{ field: string; message: string; code: string }> = []
  ) {
    super(message, HttpStatus.BAD_REQUEST, ErrorCode.VALIDATION_ERROR);
    this.validationErrors = validationErrors;
  }
}

/**
 * Authentication error - thrown when user is not authenticated
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED);
  }
}

/**
 * Authorization error - thrown when user lacks required permissions
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN);
  }
}

/**
 * Not found error - thrown when requested resource doesn't exist
 */
export class NotFoundError extends AppError {
  constructor(resource: string, identifier?: string) {
    const message = identifier
      ? `${resource} with ID '${identifier}' not found`
      : `${resource} not found`;
    super(message, HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND);
  }
}

/**
 * Conflict error - thrown when resource already exists or state conflict
 */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, HttpStatus.CONFLICT, ErrorCode.CONFLICT);
  }
}

/**
 * Business logic error - thrown for domain-specific rule violations
 */
export class BusinessError extends AppError {
  constructor(message: string, code: ErrorCodeType, details?: Record<string, unknown>) {
    super(message, HttpStatus.UNPROCESSABLE_ENTITY, code, details);
  }
}

/**
 * Insufficient stock error - specific error for stock operations
 */
export class InsufficientStockError extends BusinessError {
  constructor(itemId: string, requested: number, available: number) {
    super(
      `Insufficient stock for item ${itemId}. Requested: ${requested}, Available: ${available}`,
      ErrorCode.INSUFFICIENT_STOCK,
      { itemId, requested, available }
    );
  }
}

/**
 * Database error - thrown when database operations fail
 */
export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      ErrorCode.DATABASE_ERROR,
      originalError ? { originalMessage: originalError.message } : undefined
    );
  }
}

