import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { statusMeta, type StatusTone } from '@/lib/status'

/**
 * StatusStamp — a package status rendered like a rubber ink-stamp on a waybill.
 * Rectangular (not a pill), uppercase, tracked, with a leading tick. One of the
 * three Dispatch signatures.
 */
const stampVariants = cva(
  'inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-0.5 text-[10.5px] font-bold uppercase leading-none tracking-[0.09em] whitespace-nowrap',
  {
    variants: {
      tone: {
        neutral: 'border-border bg-muted text-muted-foreground',
        route: 'border-chart-2/35 bg-chart-2/10 text-chart-2',
        transit: 'border-primary/40 bg-primary/12 text-primary',
        wait: 'border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning',
        done: 'border-success/40 bg-success/12 text-success',
        alert: 'border-destructive/40 bg-destructive/12 text-destructive',
      } satisfies Record<StatusTone, string>,
    },
    defaultVariants: { tone: 'neutral' },
  },
)

export function StatusStamp({
  status,
  className,
  tone,
  label,
}: {
  status: string
  className?: string
  /** Override the displayed text (e.g. a customer-facing label). */
  label?: string
} & Partial<VariantProps<typeof stampVariants>>) {
  const meta = statusMeta(status)
  return (
    <span className={cn(stampVariants({ tone: tone ?? meta.tone }), className)}>
      <span className="size-1 rounded-full bg-current opacity-70" aria-hidden />
      {label ?? meta.label}
    </span>
  )
}
