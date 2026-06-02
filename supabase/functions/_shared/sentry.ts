// Minimal Sentry helper for Deno Edge Functions.
// Sends a simple event to Sentry's store endpoint using the DSN provided
// via the SENTRY_DSN environment variable.

interface CaptureOptions {
  level?: 'fatal' | 'error' | 'warning' | 'info' | 'debug'
  logger?: string
  tags?: Record<string, string>
  extra?: Record<string, unknown>
  request?: {
    method?: string
    url?: string
    headers?: Record<string, string>
    body?: unknown
  }
}

function parseDsn(dsn: string) {
  // DSN format: https://<publicKey>@<host>/<projectId>
  // or:        https://<publicKey>:<secret>@<host>/<projectId>
  try {
    const u = new URL(dsn)
    const host = u.host
    const projectId = u.pathname.replace(/^\//, '').split('/').pop() || ''
    const publicKey = u.username
    const secret = u.password || undefined
    return { host, projectId, publicKey, secret }
  } catch (e) {
    return null
  }
}

export async function captureException(err: unknown, opts: CaptureOptions = {}) {
  try {
    const dsn = Deno.env.get('SENTRY_DSN')
    if (!dsn) {
      // Not configured — quietly skip
      return
    }

    const parsed = parseDsn(dsn)
    if (!parsed || !parsed.publicKey || !parsed.projectId) return

    const { host, projectId, publicKey, secret } = parsed
    const url = `https://${host}/api/${projectId}/store/`

    // Sentry expects a 32-char hex event_id — remove dashes from UUID
    const event_id = crypto.randomUUID().replace(/-/g, '')

    const message =
      typeof err === 'object' && err !== null && 'message' in (err as any)
        ? (err as any).message
        : String(err)

    const stack = err instanceof Error ? err.stack : undefined

    const environment = Deno.env.get('SENTRY_ENVIRONMENT')
    const release = Deno.env.get('SENTRY_RELEASE')

    const event: Record<string, unknown> = {
      event_id,
      message,
      timestamp: new Date().toISOString(),
      level: opts.level ?? 'error',
      platform: 'javascript',
      logger: opts.logger ?? 'supabase-edge',
      extra: {
        ...(opts.extra ?? {}),
        error_stack: stack
      },
      tags: {
        ...(opts.tags ?? {}),
        ...(environment ? { environment } : {})
      }
    }

    if (opts.request) {
      // @ts-ignore - we intentionally shape a minimal `request` object
      event.request = {
        url: opts.request.url,
        method: opts.request.method,
        headers: opts.request.headers,
        data: opts.request.body
      }
    }

    if (release) event.release = release

    const sentryAuth = `Sentry sentry_version=7,sentry_client=rabelani-edge/1.0,sentry_key=${publicKey}${secret ? `,sentry_secret=${secret}` : ''}`

    // Fire-and-forget but await once so caller can observe failures if desired.
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Sentry-Auth': sentryAuth
      },
      body: JSON.stringify(event)
    })
  } catch (e) {
    // Never throw from the error reporter — swallow silently and log to console.
    try { console.warn('Sentry capture failed:', e) } catch {}
  }
}


