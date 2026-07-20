import { cn } from '@/lib/utils'

/**
 * SectionLabel — a stencil-on-a-crate label. Uppercase, tracked, small, muted.
 * Used to head panels and metric groups.
 */
export function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}
