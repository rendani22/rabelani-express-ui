import { avatarInitials } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Deterministic initials avatar for a receiver/customer. */
export function ReceiverAvatar({ name, className }: { name: string; className?: string }) {
  const { initials, hue } = avatarInitials(name)
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white',
        className,
      )}
      style={{ background: `hsl(${hue} 55% 50%)` }}
      aria-hidden
    >
      {initials}
    </span>
  )
}
