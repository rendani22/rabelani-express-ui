import { cn } from '@/lib/utils'

/**
 * Rabelani Express mark — the RouteTimeline signature as a logo: a parcel's
 * chain of custody (node ● → line → arrowhead) in motion, on a hi-vis cargo-orange
 * stamp tile. Black-on-orange like depot signage; theme-aware via the `--primary`
 * / `--primary-foreground` tokens (orange brightens in dark, glyph stays dark, so
 * it reads in both modes and never introduces a second accent).
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('size-11 rounded-[10px] ring-1 ring-black/10 dark:ring-white/10', className)}
    >
      {/* Colours via Tailwind fill/stroke utilities — NOT `fill="var(--…)"`,
          which does not resolve inside SVG presentation attributes (falls back to
          black). These compile to real CSS `fill: var(--color-primary)`. */}
      <rect width="40" height="40" rx="10" className="fill-primary" />
      {/* origin node → route line → forward arrowhead (express) */}
      <circle cx="12" cy="20" r="3" className="fill-primary-foreground" />
      <path
        d="M15.5 20 H23"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M22.5 13.5 L29 20 L22.5 26.5"
        fill="none"
        className="stroke-primary-foreground"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Full lockup: mark + wordmark + tagline. */
export function Logo({
  className,
  markClassName,
  showTagline = true,
}: {
  className?: string
  markClassName?: string
  showTagline?: boolean
}) {
  return (
    <span className={cn('flex items-center gap-3', className)}>
      <LogoMark className={markClassName} />
      <span className="flex flex-col leading-none">
        {/* one accent: the mark carries the orange; the wordmark separates the two
            words by weight + tone, not a second colour. */}
        <span className="text-[1.375rem] font-extrabold tracking-[-0.025em] text-foreground">
          Rabelani<span className="font-medium text-muted-foreground">Express</span>
        </span>
        {showTagline && (
          <span className="mt-0.5 text-[0.6875rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">
            Logistics Solutions
          </span>
        )}
      </span>
    </span>
  )
}
