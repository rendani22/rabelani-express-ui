import { useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { CUSTOMER_ROLE_LABEL } from '@/lib/api/customers'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { SectionLabel } from '@/components/dispatch/section-label'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Account menu for the customer portal: who you are, and the way out.
 *
 * Uses ReceiverAvatar, so a customer sees themselves rendered exactly as staff
 * see them in Orders — same initials, same deterministic hue.
 *
 * The role is shown because it decides which parcels the portal lists: a Buyer
 * additionally sees the orders of the End users assigned to them. Without it,
 * someone else's parcel in your list has no explanation.
 */
export function CustomerAccountMenu() {
  const navigate = useNavigate()
  const { signOut } = useAuth()
  const { data: principal } = useCurrentPrincipal()

  // CustomerRoute holds a spinner until the principal resolves and only renders
  // this shell for kind === 'customer', so this is narrowing, not a fallback.
  if (principal?.kind !== 'customer') return null
  const { customer } = principal

  const fullName = [customer.name, customer.surname].filter(Boolean).join(' ')
  const label = fullName || customer.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label={`Account: ${label}`}
          className="flex items-center gap-2 rounded-md outline-none transition-transform active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ReceiverAvatar name={label} />
          <span className="hidden max-w-[10rem] truncate text-sm font-medium sm:block">
            {label}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <div className="flex flex-col gap-2 px-2 py-1.5">
          <div className="flex flex-col">
            <span className="truncate text-sm font-semibold">{label}</span>
            <span className="truncate text-xs text-muted-foreground">{customer.email}</span>
          </div>
          <SectionLabel>{CUSTOMER_ROLE_LABEL[customer.role]}</SectionLabel>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={async () => {
            await signOut()
            navigate('/login', { replace: true })
          }}
        >
          <LogOut className="size-4" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
