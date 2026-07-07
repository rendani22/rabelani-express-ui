import { createLogger, type LogLevel } from '@rendani22/logger'

/**
 * Application logger — the single seam for error/diagnostic reporting.
 *
 * Thin wrapper around the `@rendani22/logger` livecode-OPS client (the same
 * client every LiveCode app uses). The client buffers events in memory and
 * flushes them in batches to the OPS ingest endpoint on an interval, and on
 * page-hide via `navigator.sendBeacon`. We add two things on top: auto-context
 * (URL + user-agent) on every event, and de-duplication by error-object
 * identity so a failure caught by both a try/catch and a global listener ships
 * once. All app error handling funnels the *actual* error object through here.
 *
 * Config comes from Vite env vars, defaulting to the livecode-OPS `int` ingest
 * (same convention as the Supabase client keys in `config.ts`). Override per
 * environment with VITE_OPS_INGEST_URL / VITE_OPS_INGEST_KEY / VITE_APP_VERSION.
 */

export type { LogLevel }

const client = createLogger({
  endpoint: import.meta.env.VITE_OPS_INGEST_URL ?? 'https://livecode-ops.vercel.app/api/logs/ingest',
  apiKey: import.meta.env.VITE_OPS_INGEST_KEY ?? 'lcops_c97T-MBl9mfTgVEqBL8V-TE6HM9fT3R0',
  appName: 'rabelani-express-ui',
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION ?? 'dev',
  // The client stores the fetch reference and calls it as a method, which
  // detaches `this` from `window` → "Illegal invocation". Wrap it so the global
  // fetch is always invoked with the correct binding.
  fetchImpl: (...args: Parameters<typeof fetch>) => fetch(...args),
  onError: (err) => {
    // Never throw from the logging path; only surface *delivery* problems.
    console.warn('[livecode-ops] log delivery failed', err)
  },
})

// Reported error objects, held weakly so entries clear once the app drops its
// own references — no unbounded growth, no leak.
const seen = new WeakSet<object>()

function withAutoContext(context?: Record<string, unknown>): Record<string, unknown> {
  return {
    url: typeof location !== 'undefined' ? location.href : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    ...context,
  }
}

function dispatch(level: LogLevel, payload: unknown, context?: Record<string, unknown>): void {
  if (payload !== null && typeof payload === 'object') {
    if (seen.has(payload as object)) return
    seen.add(payload as object)
  }
  client.log(level, payload, withAutoContext(context))
}

export const logger = {
  error: (err: unknown, context?: Record<string, unknown>) => dispatch('error', err, context),
  warn: (err: unknown, context?: Record<string, unknown>) => dispatch('warn', err, context),
  info: (message: unknown, context?: Record<string, unknown>) => dispatch('info', message, context),
  debug: (message: unknown, context?: Record<string, unknown>) => dispatch('debug', message, context),
  /** Sentry-style alias for `error`. */
  captureException: (err: unknown, context?: Record<string, unknown>) => dispatch('error', err, context),
  /** Force an immediate flush of buffered events. */
  flush: () => client.flush(),
}

/**
 * Extract a message worth showing a user from an unknown error. Prefers the
 * error's own message (Supabase/PostgREST errors carry a `.message`), falling
 * back to the caller-supplied domain message. Never returns an empty string.
 */
export function toUserMessage(err: unknown, fallback: string): string {
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err instanceof Error && err.message.trim()) return err.message.trim()
  if (
    err &&
    typeof err === 'object' &&
    'message' in err &&
    typeof (err as { message: unknown }).message === 'string' &&
    (err as { message: string }).message.trim()
  ) {
    return (err as { message: string }).message.trim()
  }
  return fallback
}

/**
 * Log the real error to livecode-OPS and return a user-facing message. Use in
 * catch blocks / mutation `onError` so one call both records the full error and
 * yields something useful for `toast.error(...)`.
 *
 *   onError: (e) => toast.error(reportError(e, 'Could not save the item.', { op: 'inventory.update' }))
 */
export function reportError(err: unknown, fallback: string, context?: Record<string, unknown>): string {
  logger.error(err, context)
  return toUserMessage(err, fallback)
}

/** Install window-level capture for errors and unhandled promise rejections. */
export function installGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return
  window.addEventListener('error', (e) => {
    logger.error(e.error ?? e.message, { kind: 'window.error' })
  })
  window.addEventListener('unhandledrejection', (e) => {
    logger.error(e.reason, { kind: 'unhandledrejection' })
  })
}
