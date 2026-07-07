import { Navigate, Outlet } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { Button } from '@/components/ui/button'
import { Logo } from '@/components/brand/logo'

function FullPageSpinner() {
  return (
    <div className="flex min-h-svh items-center justify-center">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  )
}

/** Shown to a signed-in user who is neither staff nor an invited customer. */
function NoAccess() {
  const { signOut } = useAuth()
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center">
      <Logo />
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight">No access yet</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your account isn&apos;t linked to a company or role yet. Please contact your
          administrator to be set up.
        </p>
      </div>
      <Button variant="outline" onClick={() => signOut()}>Sign out</Button>
    </div>
  )
}

/** Requires an active staff principal; customers are bounced to their portal. */
export function StaffRoute() {
  const { data, isLoading } = useCurrentPrincipal()
  if (isLoading || !data) return <FullPageSpinner />
  if (data.kind === 'customer') return <Navigate to="/my-packages" replace />
  if (data.kind === 'none') return <NoAccess />
  return <Outlet />
}

/** Requires a customer principal; staff are bounced to the dashboard. */
export function CustomerRoute() {
  const { data, isLoading } = useCurrentPrincipal()
  if (isLoading || !data) return <FullPageSpinner />
  if (data.kind === 'staff') return <Navigate to="/dashboard" replace />
  if (data.kind === 'none') return <NoAccess />
  return <Outlet />
}

/** Post-login landing: route to the right home for the principal. */
export function HomeRedirect() {
  const { data, isLoading } = useCurrentPrincipal()
  if (isLoading || !data) return <FullPageSpinner />
  if (data.kind === 'staff') return <Navigate to="/dashboard" replace />
  if (data.kind === 'customer') return <Navigate to="/my-packages" replace />
  return <NoAccess />
}
