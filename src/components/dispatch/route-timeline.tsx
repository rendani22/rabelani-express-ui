import { cn } from '@/lib/utils'

export interface RouteStop {
  label: string
  detail?: string
  timestamp?: string
  state: 'done' | 'current' | 'upcoming'
}

/**
 * RouteTimeline — chain-of-custody as a literal route line. A parcel's journey
 * down a vertical track with node stops. One of the three Dispatch signatures.
 */
export function RouteTimeline({ stops, className }: { stops: RouteStop[]; className?: string }) {
  return (
    <ol className={cn('relative flex flex-col', className)}>
      {stops.map((stop, i) => {
        const last = i === stops.length - 1
        return (
          <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
            {/* connecting track */}
            {!last && (
              <span
                aria-hidden
                className={cn(
                  'absolute left-[5px] top-3.5 h-full w-px',
                  stop.state === 'done' ? 'bg-primary/40' : 'bg-border',
                )}
              />
            )}
            {/* node */}
            <span aria-hidden className="relative mt-1 flex size-[11px] shrink-0 items-center justify-center">
              {stop.state === 'current' && (
                <span className="absolute inline-flex size-[11px] animate-ping rounded-full bg-primary/40" />
              )}
              <span
                className={cn(
                  'relative size-[11px] rounded-full border-2',
                  stop.state === 'done' && 'border-primary bg-primary',
                  stop.state === 'current' && 'border-primary bg-background',
                  stop.state === 'upcoming' && 'border-border bg-background',
                )}
              />
            </span>
            <div className="flex flex-1 flex-col gap-0.5 pt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  className={cn(
                    'text-sm font-medium leading-tight',
                    stop.state === 'upcoming' && 'text-muted-foreground',
                  )}
                >
                  {stop.label}
                </span>
                {stop.timestamp && (
                  <span className="mono shrink-0 text-[11px] text-muted-foreground">
                    {stop.timestamp}
                  </span>
                )}
              </div>
              {stop.detail && (
                <span className="text-xs text-muted-foreground">{stop.detail}</span>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
