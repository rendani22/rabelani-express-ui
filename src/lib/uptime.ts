import { logger } from '@/lib/logger'

/**
 * Uptime / liveness reporting to livecode-OPS.
 *
 * Emits an `info` event when the app boots (`session_start`), a recurring
 * `heartbeat` while the tab is visible, and a `session_end` on page-hide. Each
 * event carries the session id, elapsed uptime, current route, and visibility,
 * so the OPS backend can tell which sessions are alive and for how long.
 *
 * Heartbeats flush immediately (rather than waiting for the logger's 5-minute
 * batch) so "is it up?" stays near-real-time. Hidden/background time is not
 * counted as active — the timer pauses when the tab is hidden and resumes when
 * it returns to the foreground.
 *
 * Cadence is configurable with `VITE_OPS_HEARTBEAT_MS` (default 5min; set to 0
 * to disable uptime reporting entirely).
 */

const HEARTBEAT_MS = Number(import.meta.env.VITE_OPS_HEARTBEAT_MS ?? 300_000)

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function startUptimeReporting(): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(HEARTBEAT_MS) || HEARTBEAT_MS <= 0) return // disabled

  const sessionId = newSessionId()
  const startedAt = Date.now()

  const snapshot = () => ({
    event: 'uptime',
    sessionId,
    uptimeMs: Date.now() - startedAt,
    path: typeof location !== 'undefined' ? location.pathname : undefined,
    visibility: typeof document !== 'undefined' ? document.visibilityState : undefined,
  })

  // Immediate first ping so the backend sees the session come up right away.
  logger.info('session_start', { ...snapshot(), phase: 'start' })
  void logger.flush()

  let timer: number | undefined
  const beat = () => {
    logger.info('heartbeat', { ...snapshot(), phase: 'heartbeat' })
    void logger.flush()
  }
  const start = () => {
    if (timer === undefined) timer = window.setInterval(beat, HEARTBEAT_MS)
  }
  const stop = () => {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }

  if (document.visibilityState === 'visible') start()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      start()
    } else {
      stop()
      logger.info('session_pause', { ...snapshot(), phase: 'hidden' })
      void logger.flush()
    }
  })

  window.addEventListener('pagehide', () => {
    stop()
    logger.info('session_end', { ...snapshot(), phase: 'end' })
    void logger.flush()
  })
}
