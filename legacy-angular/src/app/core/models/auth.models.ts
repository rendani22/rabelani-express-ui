/**
 * Login credentials submitted by the user
 */
export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Result of an authentication attempt
 */
export interface AuthResult {
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Form field validation error types
 */
export type ValidationErrorType = 'required' | 'email' | 'minlength';

/**
 * Validation error messages configuration
 */
export const VALIDATION_MESSAGES: Record<string, Record<ValidationErrorType, string>> = {
  email: {
    required: 'Email is required',
    email: 'Please enter a valid email address',
    minlength: 'Email is too short',
  },
  password: {
    required: 'Password is required',
    email: 'Invalid password format',
    minlength: 'Password must be at least 6 characters',
  },
} as const;

