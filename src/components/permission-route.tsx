import type { ReactNode } from 'react'
import { Outlet } from 'react-router-dom'
import { Loader2, ShieldX } from 'lucide-react'
import { usePermissions } from '@/hooks/use-permissions'
import type { PermissionKey } from '@/lib/api/permissions'

/**
 * Shown when a user deep-links to a route they cannot access.
 *
 * Deliberately a message rather than a redirect: a bookmark or a shared link
 * should explain itself, not silently bounce you to the dashboard as though the
 * page never existed.
 */
export function NoPermission({ what }: { what?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-20 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <ShieldX className="size-5" />
      </span>
      <p className="text-sm font-medium">You don&apos;t have access to this</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        {what ?? 'This page'} requires a permission your account doesn&apos;t have.
        Ask an admin if you need it.
      </p>
    </div>
  )
}

/** Route-level guard. Renders the child route only if the permission is held. */
export function PermissionRoute({
  permission,
  what,
}: {
  permission: PermissionKey
  what?: string
}) {
  const { can, isLoading } = usePermissions()

  if (isLoading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!can(permission)) return <NoPermission what={what} />

  return <Outlet />
}

/** Inline guard for a section of a page (a tab, a panel, a column). */
export function PermissionGate({
  permission,
  children,
  fallback = null,
}: {
  permission: PermissionKey
  children: ReactNode
  fallback?: ReactNode
}) {
  const { can } = usePermissions()
  return can(permission) ? <>{children}</> : <>{fallback}</>
}
