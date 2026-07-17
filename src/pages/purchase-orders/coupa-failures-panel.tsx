import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, RefreshCw, X } from 'lucide-react'
import type { CoupaFailure } from '@/lib/api/coupa-failures'
import { coupaFailureAction, isRetryable } from '@/lib/api/coupa-failures'
import { useCoupaFailures, useRetryCoupaFailure, useSetCoupaFailureStatus } from '@/hooks/use-coupa-failures'
import { usePermissions } from '@/hooks/use-permissions'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { SectionLabel } from '@/components/dispatch'
import { timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * The Coupa ingestion queue: purchase orders Exxaro issued that never landed.
 *
 * Sits on the Global PO page rather than in a settings corner, because that is
 * the page whose count is wrong while a row sits here. Someone looking at the
 * PO list is exactly the person who needs to know it is incomplete.
 */
function FailureRow({ failure }: { failure: CoupaFailure }) {
  const [open, setOpen] = useState(false)
  const retry = useRetryCoupaFailure()
  const setStatus = useSetCoupaFailureStatus()
  const action = coupaFailureAction(failure.reason)
  const retryable = isRetryable(failure)

  return (
    <div className="border-b last:border-b-0">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={open ? 'Hide the email' : 'Show the email'}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>

        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="tabular font-medium">{failure.poNumber ?? 'PO number unknown'}</span>
            <span className="rounded border border-destructive/40 bg-destructive/5 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
              {failure.label}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(failure.createdAt.toISOString())}</span>
            {failure.retryCount > 0 && (
              <span className="text-xs text-muted-foreground">
                · retried {failure.retryCount}×{failure.lastRetryAt ? ` ${timeAgo(failure.lastRetryAt.toISOString())}` : ''}
              </span>
            )}
          </div>

          {failure.details && <p className="text-sm text-muted-foreground">{failure.details}</p>}

          {/* The most recent attempt, when it differs — so a fix that changed
              the failure is visible as progress rather than looking identical. */}
          {failure.lastError && failure.lastError !== failure.details && (
            <p className="text-sm text-destructive">Last retry: {failure.lastError}</p>
          )}

          {action && <p className="text-xs text-muted-foreground/90">{action}</p>}

          {(failure.onBehalfOf || failure.submittedBy) && (
            <p className="text-xs text-muted-foreground">
              On behalf of {failure.onBehalfOf ?? '—'} · submitted by {failure.submittedBy ?? '—'}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <PermissionButton
            permission="purchase_orders.ingest.retry"
            size="sm"
            variant="outline"
            disabled={!retryable || retry.isPending}
            onClick={() => retry.mutate(failure.id)}
            deniedReason="Only an admin can replay a failed ingestion."
          >
            <RefreshCw className={cn('size-3.5', retry.isPending && 'animate-spin')} />
            Retry
          </PermissionButton>
          <PermissionButton
            permission="purchase_orders.ingest.retry"
            size="sm"
            variant="ghost"
            disabled={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: failure.id, status: 'ignored' })}
            deniedReason="Only an admin can clear a failed ingestion."
          >
            <X className="size-3.5" />
            Ignore
          </PermissionButton>
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4 pl-11">
          <SectionLabel>Original email</SectionLabel>
          <pre className="mt-2 max-h-80 overflow-auto rounded border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words">
            {failure.body}
          </pre>
        </div>
      )}
    </div>
  )
}

export function CoupaFailuresPanel() {
  const { can } = usePermissions()
  const { data, isLoading } = useCoupaFailures('pending')

  // Hidden, not empty-stated: someone without the permission cannot act on
  // these and the bodies are raw order documents. RLS already returns nothing
  // for them — this just avoids rendering an empty box that implies all is well.
  if (!can('purchase_orders.ingest.retry')) return null
  if (isLoading || !data || data.length === 0) return null

  return (
    <div className="rounded-lg border border-destructive/30 bg-card">
      <div className="flex items-center gap-2 border-b border-destructive/20 px-4 py-3">
        <AlertTriangle className="size-4 text-destructive" />
        <span className="text-sm font-medium">
          {data.length} Coupa {data.length === 1 ? 'order' : 'orders'} not recorded
        </span>
        <span className="text-xs text-muted-foreground">
          Exxaro issued these — they are not in the list below until they are fixed and retried.
        </span>
      </div>
      <div>
        {data.map((f) => (
          <FailureRow key={f.id} failure={f} />
        ))}
      </div>
    </div>
  )
}
