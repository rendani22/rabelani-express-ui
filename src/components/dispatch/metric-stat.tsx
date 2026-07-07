import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SectionLabel } from './section-label'

/**
 * MetricStat — a dispatch-strip metric. Hero number in Archivo (tabular),
 * demoted tracked label, optional signed delta. Three type levers, not size alone.
 */
export function MetricStat({
  label,
  value,
  unit,
  delta,
  className,
}: {
  label: string
  value: string | number
  unit?: string
  delta?: { value: string; direction: 'up' | 'down'; good?: boolean }
  className?: string
}) {
  const good = delta?.good ?? (delta?.direction === 'up')
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex items-baseline gap-2">
        <span className="tabular text-[2rem] leading-none font-semibold tracking-tight">
          {value}
        </span>
        {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
      </div>
      {delta && (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 text-xs font-medium tabular',
            good ? 'text-success' : 'text-destructive',
          )}
        >
          {delta.direction === 'up' ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownRight className="size-3.5" />
          )}
          {delta.value}
        </span>
      )}
    </div>
  )
}
