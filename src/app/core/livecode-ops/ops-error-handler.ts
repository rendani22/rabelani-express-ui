import {
  ErrorHandler,
  Injectable,
  InjectionToken,
  inject,
} from '@angular/core';

import { OpsLoggerService } from './ops-logger.service';

/**
 * The `ErrorHandler` that livecode-OPS delegates to *after* logging. Defaults
 * to Angular's built-in `ErrorHandler` (plain `console.error`), but the host
 * app can point it at an existing handler — this app wires it to Sentry's
 * handler so Sentry keeps receiving errors unchanged.
 */
export const OPS_INNER_ERROR_HANDLER = new InjectionToken<ErrorHandler>(
  'OPS_INNER_ERROR_HANDLER',
);

/**
 * Custom `ErrorHandler` that ships uncaught errors (and unhandled promise
 * rejections surfaced through Angular's zone) to livecode-OPS, then delegates
 * to the inner handler so the existing dev experience — console output and
 * Sentry reporting — is completely unchanged.
 */
@Injectable()
export class OpsErrorHandler implements ErrorHandler {
  private readonly ops = inject(OpsLoggerService);
  private readonly inner =
    inject(OPS_INNER_ERROR_HANDLER, { optional: true }) ?? new ErrorHandler();

  handleError(error: unknown): void {
    try {
      this.ops.captureException(this.unwrap(error), {
        source: 'angular.ErrorHandler',
      });
    } catch {
      // Logging must never mask the original error or throw itself.
    }

    // Delegate last so Sentry + console see the untouched error.
    this.inner.handleError(error);
  }

  /**
   * Angular wraps errors: zone rejections arrive as `{ rejection }` and Sentry
   * re-wraps as `{ originalError }`. Unwrap so the logged stack is the real one.
   */
  private unwrap(error: unknown): unknown {
    const e = error as { rejection?: unknown; originalError?: unknown } | null;
    return e?.rejection ?? e?.originalError ?? error;
  }
}
