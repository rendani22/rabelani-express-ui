import { Injectable, Injector, inject } from '@angular/core';
import { Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { createLogger, Logger, LogLevel } from '@rendani22/logger';

/**
 * Thin Angular wrapper around the @rendani22/logger livecode-OPS client.
 *
 * - Instantiates `createLogger(...)` exactly once from the environment config.
 * - Enriches every event with auto-context (current Router URL, release,
 *   user-agent) before handing it to the client.
 * - De-duplicates by error-object identity so an error reported by both the
 *   `ErrorHandler` and the raw `window` listeners (see
 *   `provideBrowserGlobalErrorListeners()`) is only shipped once.
 *
 * Everything else in the app injects this service rather than touching the
 * logger directly.
 */
@Injectable({ providedIn: 'root' })
export class OpsLoggerService {
  // Resolve the Router lazily. Injecting it directly here would create a
  // cyclic dependency (Router -> ErrorHandler -> OpsLoggerService -> Router).
  private readonly injector = inject(Injector);

  private readonly logger: Logger = createLogger({
    endpoint: environment.opsIngestUrl,
    apiKey: environment.opsIngestKey,
    appName: environment.opsAppName,
    environment: environment.appEnvironment,
    release: environment.opsRelease,
    onError: (err) => {
      // Never throw from the logging path; just surface delivery problems.
      // eslint-disable-next-line no-console
      console.warn('[livecode-ops] log delivery failed', err);
    },
  });

  // WeakSet holds error objects weakly, so entries clear once the app drops
  // its own references — no unbounded growth, no leak.
  private readonly seen = new WeakSet<object>();

  /** Direct access to the underlying client (e.g. for a manual `.flush()`). */
  get client(): Logger {
    return this.logger;
  }

  error(err: unknown, context?: Record<string, unknown>): void {
    this.dispatch('error', err, context);
  }

  warn(err: unknown, context?: Record<string, unknown>): void {
    this.dispatch('warn', err, context);
  }

  info(message: unknown, context?: Record<string, unknown>): void {
    this.dispatch('info', message, context);
  }

  debug(message: unknown, context?: Record<string, unknown>): void {
    this.dispatch('debug', message, context);
  }

  /** Sentry-style alias for `error`. */
  captureException(err: unknown, context?: Record<string, unknown>): void {
    this.dispatch('error', err, context);
  }

  /** Force an immediate flush of buffered events. */
  flush(): Promise<void> {
    return this.logger.flush();
  }

  private dispatch(
    level: LogLevel,
    payload: unknown,
    context?: Record<string, unknown>,
  ): void {
    // Skip a payload we've already logged (same object reference).
    if (payload !== null && typeof payload === 'object') {
      if (this.seen.has(payload as object)) return;
      this.seen.add(payload as object);
    }
    this.logger.log(level, payload, this.withAutoContext(context));
  }

  private withAutoContext(
    context?: Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      url: this.currentUrl(),
      release: environment.opsRelease,
      userAgent:
        typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      ...context,
    };
  }

  private currentUrl(): string | undefined {
    try {
      return this.injector.get(Router, null)?.url;
    } catch {
      return undefined;
    }
  }
}
