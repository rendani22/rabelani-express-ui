import { cn } from '@/lib/utils'
import { SectionLabel } from '@/components/dispatch'
import { useSettings } from '@/lib/settings-store'

/** Consistent page title bar. `eyebrow` is the stencil section label above the title. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  tourId,
}: {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
  className?: string
  /** Optional `data-tour` anchor placed on the title, for onboarding tours. */
  tourId?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="flex flex-col gap-1.5">
        {eyebrow && <SectionLabel>{eyebrow}</SectionLabel>}
        <h1 data-tour={tourId} className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Standard page content padding wrapper. */
export function PageBody({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  const compact = useSettings((s) => s.compactMode)
  return (
    <div
      className={cn(
        'flex flex-col lg:px-8',
        compact ? 'gap-4 px-5 py-4' : 'gap-6 px-6 py-6',
        className,
      )}
    >
      {children}
    </div>
  )
}
