import { cn } from '@/lib/utils'

/** Standard dashboard panel: subtle border, card surface, optional titled header. */
export function DashboardCard({
  title,
  eyebrow,
  action,
  children,
  className,
  bodyClassName,
  noPadding,
}: {
  title?: string
  eyebrow?: string
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  bodyClassName?: string
  noPadding?: boolean
}) {
  return (
    <section
      className={cn('flex flex-col rounded-lg border bg-card', className)}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
          <div className="flex flex-col gap-0.5">
            {eyebrow && (
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {eyebrow}
              </span>
            )}
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className={cn(!noPadding && 'p-5', 'flex-1', bodyClassName)}>{children}</div>
    </section>
  )
}
