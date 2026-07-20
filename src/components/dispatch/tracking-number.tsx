import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * TrackingNumber — a waybill/tracking ID as a first-class monospace token.
 * The recurring texture of the whole product. Optionally copyable.
 */
export function TrackingNumber({
  value,
  copyable = false,
  className,
}: {
  value: string
  copyable?: boolean
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  if (!copyable) {
    return <span className={cn('mono text-[0.8125rem] tracking-tight', className)}>{value}</span>
  }

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1200)
      }}
      className={cn(
        'group inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 -mx-1 text-[0.8125rem] transition-colors hover:bg-accent',
        className,
      )}
      title="Copy tracking number"
    >
      <span className="mono tracking-tight">{value}</span>
      {copied ? (
        <Check className="size-3 text-success" />
      ) : (
        <Copy className="size-3 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  )
}
