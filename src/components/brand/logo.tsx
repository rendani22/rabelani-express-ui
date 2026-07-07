import { cn } from '@/lib/utils'

/** The Rabelani Express brand mark (kept from the original identity). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={cn('size-11 rounded-[10px] ring-1 ring-black/5 dark:ring-white/10', className)}
    >
      <rect width="40" height="40" rx="10" fill="#1a1a1a" />
      <g transform="translate(8, 8)">
        <path
          d="M4 19V5a2 2 0 0 1 2-2h6a4 4 0 0 1 0 8H4"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="m11 13 4 6"
          stroke="#f75757"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M16 13h2a2 2 0 0 1 2 2v4"
          stroke="#f75757"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
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
        <span className="text-[1.375rem] font-extrabold tracking-[-0.025em] text-foreground">
          Rabelani<span className="text-[#f75757]">Express</span>
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
