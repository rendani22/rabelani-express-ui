import { cn } from '@/lib/utils'

/**
 * Rabelani Express mark — the concentric pinpoint, per the `Rabelani Express
 * Logo` design doc (turn 3, "On the Dispatch system").
 *
 * Quiet ink rings with a single hi-vis centre: a fix on the map, here is where
 * the parcel is. Only the centre is cargo orange — it is the whole accent budget
 * of the mark, which is the One Voice Rule holding rather than being worked
 * around. Colours come from `--brand-ring-*` and `--primary`, so the mark tracks
 * the theme; nothing here is a fixed brand colour.
 *
 * Colours are set with Tailwind stroke/fill utilities, NOT `stroke="var(--…)"` —
 * custom properties do not resolve inside SVG presentation attributes and fall
 * back to black.
 */
export function LogoMark({
  className,
  dense = false,
}: {
  className?: string
  /**
   * Small-size rendering (~20px and under). The doc redraws the mark rather than
   * scaling it: both rings go to full ink and thicken, because the quiet outer
   * ring vanishes at sidebar/favicon size. Geometry tightens with it.
   */
  dense?: boolean
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn(dense ? 'size-5' : 'size-10', className)}
    >
      <circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        strokeWidth={dense ? 3 : 2.6}
        className={dense ? 'stroke-brand-ring-strong' : 'stroke-brand-ring-quiet'}
      />
      <circle
        cx="24"
        cy="24"
        r={dense ? 11 : 12.5}
        fill="none"
        strokeWidth={dense ? 3 : 2.6}
        className="stroke-brand-ring-strong"
      />
      <circle cx="24" cy="24" r={dense ? 5 : 5.5} className="fill-primary" />
    </svg>
  )
}

/**
 * The wordmark: "Rabelani" in Archivo against "EXPRESS" in tracked JetBrains
 * Mono. The two words separate by face, weight, and tone — never by a second
 * colour. There is no tagline in this direction; the mono half carries the
 * "Express" on its own.
 *
 * `stacked` is the primary lockup (auth screens, empty shells). `inline` is the
 * doc's in-use variant for the sidebar header, where vertical room is the
 * constraint and the mark drops to its dense rendering.
 */
export function Logo({
  className,
  markClassName,
  variant = 'stacked',
}: {
  className?: string
  markClassName?: string
  variant?: 'stacked' | 'inline'
}) {
  if (variant === 'inline') {
    return (
      <span className={cn('flex items-center gap-[9px]', className)}>
        <LogoMark dense className={markClassName} />
        <span className="text-sm font-semibold tracking-[-0.02em] text-foreground">
          Rabelani{' '}
          <span className="mono text-[10px] font-medium tracking-[0.12em] text-muted-foreground">
            EXPRESS
          </span>
        </span>
      </span>
    )
  }

  return (
    <span className={cn('flex items-center gap-[18px]', className)}>
      <LogoMark className={markClassName} />
      <span className="flex flex-col leading-none">
        <span className="text-[19px] font-semibold tracking-[-0.02em] text-foreground">
          Rabelani
        </span>
        <span className="mono mt-[7px] text-[9px] font-medium tracking-[0.24em] text-muted-foreground">
          EXPRESS
        </span>
      </span>
    </span>
  )
}
