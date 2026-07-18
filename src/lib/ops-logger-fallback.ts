/**
 * Fallback for the private `@rendani22/logger` livecode-OPS client.
 *
 * The real client lives in a private GitHub Packages registry and needs an auth
 * token to install. When that token is available (production, CI, normal dev)
 * the real package is used untouched — `vite.config.ts` only aliases this module
 * in when `node_modules/@rendani22/logger` is absent, and the tsconfig `paths`
 * redirect is typecheck-only (Vite bundling ignores it). This keeps the OPS
 * telemetry pipeline fully intact wherever the token exists, and lets the app
 * build, typecheck, and run in environments that can't reach the registry.
 *
 * This fallback is console-only: it never opens a network connection and never
 * throws from the logging path, matching the real client's "logging must never
 * break the app" contract.
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug'

/** Config surface consumed by `src/lib/logger.ts` (a subset of the real one). */
export interface LoggerConfig {
  endpoint: string
  apiKey: string
  appName: string
  environment: string
  release: string
  fetchImpl?: (...args: Parameters<typeof fetch>) => Promise<Response>
  onError?: (err: unknown) => void
}

export interface OpsLogger {
  log(level: LogLevel, payload: unknown, context?: Record<string, unknown>): void
  flush(): void
}

/**
 * Build a console-backed logger. The config is accepted for API compatibility
 * with the real `createLogger` but is not used — there is no ingest endpoint in
 * fallback mode.
 */
export function createLogger(_config: LoggerConfig): OpsLogger {
  return {
    log(level, payload, context) {
      const tag = `[ops:${level}]`
      // Route by severity so DevTools filtering still works; never throw.
      try {
        if (level === 'error') console.error(tag, payload, context ?? '')
        else if (level === 'warn') console.warn(tag, payload, context ?? '')
        else console.info(tag, payload, context ?? '')
      } catch {
        /* logging must never break the app */
      }
    },
    flush() {
      /* no-op: nothing is buffered in fallback mode */
    },
  }
}
