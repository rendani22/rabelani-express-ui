import type { ComponentProps, ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { usePermissions } from '@/hooks/use-permissions'
import type { PermissionKey } from '@/lib/api/permissions'
import { cn } from '@/lib/utils'

interface PermissionButtonProps extends ComponentProps<typeof Button> {
  /** The permission required to use this control. */
  permission: PermissionKey
  /** Overrides the default "ask an admin" copy. */
  deniedReason?: string
}

/**
 * A Button that disables itself — and says why — when the user lacks the
 * permission it needs.
 *
 * We chose disabled-with-a-tooltip over hiding, so a restricted user can see
 * that the capability exists and who to ask for it, rather than filing a bug
 * about a missing button. Hiding is still right for whole nav items and routes;
 * this is for actions inside a page the user can legitimately see.
 *
 * A disabled <button> emits no pointer events, so the tooltip has to hang off a
 * wrapper rather than the button itself.
 */
export function PermissionButton({
  permission,
  deniedReason,
  disabled,
  className,
  children,
  ...props
}: PermissionButtonProps) {
  const { can, isLoading } = usePermissions()
  const allowed = can(permission)

  if (allowed) {
    return (
      <Button disabled={disabled || isLoading} className={className} {...props}>
        {children as ReactNode}
      </Button>
    )
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* span, not the Button: a disabled button swallows the hover. */}
        <span className="inline-flex" tabIndex={0}>
          <Button {...props} disabled className={cn(className, 'pointer-events-none')}>
            {children as ReactNode}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>
        {deniedReason ?? "You don't have permission for this — ask an admin."}
      </TooltipContent>
    </Tooltip>
  )
}
