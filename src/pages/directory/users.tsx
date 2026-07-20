import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Eye,
  EyeOff,
  LayoutGrid,
  Mail,
  MoreVertical,
  Pencil,
  Phone,
  Power,
  Rows3,
  Search,
  Trash2,
  UserCog,
} from 'lucide-react'
import type { StaffProfileRow } from '@/lib/api/drivers'
import { listStaffProfiles } from '@/lib/api/drivers'
import { deactivateStaff, deleteStaff, reactivateStaff } from '@/lib/api/staff'
import { usePermissions } from '@/hooks/use-permissions'
import { useCurrentPrincipal } from '@/hooks/use-current-principal'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { StatusStamp } from '@/components/dispatch/status-stamp'
import { cn } from '@/lib/utils'
import { UserDialog } from './user-dialog'

// One distinct tone per role. `driver` was sharing `chart-2` with `manager`,
// so the badge colour carried no signal between the two most common roles;
// driver now reads on the slate `chart-5` track.
const ROLE_TONE: Record<string, string> = {
  admin: 'border-primary/40 bg-primary/12 text-primary',
  manager: 'border-chart-2/35 bg-chart-2/10 text-chart-2',
  driver: 'border-chart-5/40 bg-chart-5/12 text-chart-5',
  collection: 'border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning',
}
function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]',
        ROLE_TONE[role] ?? 'border-border bg-muted text-muted-foreground',
      )}
    >
      {role}
    </span>
  )
}

function AccountStatus({ active }: { active: boolean }) {
  return active ? (
    <StatusStamp status="active" tone="done" label="Active" />
  ) : (
    <StatusStamp status="inactive" tone="neutral" label="Inactive" />
  )
}

function DriverAvatar({ user, className }: { user: StaffProfileRow; className?: string }) {
  if (user.avatar_url)
    return (
      <img
        src={user.avatar_url}
        alt={user.full_name}
        className={cn('rounded-full object-cover', className)}
      />
    )
  return <ReceiverAvatar name={user.full_name} className={className} />
}

/** Per-row actions menu, shared by the table and card layouts. */
function RowActions({
  user,
  onEdit,
  onToggle,
  canDelete,
  onDelete,
}: {
  user: StaffProfileRow
  onEdit: (u: StaffProfileRow) => void
  onToggle: (u: StaffProfileRow) => void
  /** Hard delete is admin-only and never offered for your own account. */
  canDelete: boolean
  onDelete: (u: StaffProfileRow) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Actions">
          <MoreVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onEdit(user)}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggle(user)}>
          <Power /> {user.is_active ? 'Deactivate' : 'Reactivate'}
        </DropdownMenuItem>
        {canDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => onDelete(user)}
            >
              <Trash2 /> Delete permanently
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function UserCard({
  user,
  canManage,
  onEdit,
  onToggle,
  canDelete,
  onDelete,
}: {
  user: StaffProfileRow
  canManage: boolean
  onEdit: (u: StaffProfileRow) => void
  onToggle: (u: StaffProfileRow) => void
  canDelete: (u: StaffProfileRow) => boolean
  onDelete: (u: StaffProfileRow) => void
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/30',
        !user.is_active && 'opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <DriverAvatar user={user} className="size-10" />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-semibold">{user.full_name}</span>
            <RoleBadge role={user.role} />
          </div>
        </div>
        {canManage && (
          <RowActions
            user={user}
            onEdit={onEdit}
            onToggle={onToggle}
            canDelete={canDelete(user)}
            onDelete={onDelete}
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5 text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          <Mail className="size-3.5 shrink-0" /> <span className="truncate">{user.email}</span>
        </span>
        {user.phone && (
          <span className="flex items-center gap-2 text-muted-foreground">
            <Phone className="size-3.5 shrink-0" /> {user.phone}
          </span>
        )}
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <span className="truncate text-xs text-muted-foreground">{user.department ?? '—'}</span>
        <AccountStatus active={user.is_active} />
      </div>
    </div>
  )
}

function UsersTable({
  users,
  canManage,
  onEdit,
  onToggle,
  canDelete,
  onDelete,
}: {
  users: StaffProfileRow[]
  canManage: boolean
  onEdit: (u: StaffProfileRow) => void
  onToggle: (u: StaffProfileRow) => void
  canDelete: (u: StaffProfileRow) => boolean
  onDelete: (u: StaffProfileRow) => void
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Department</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            {canManage && (
              <TableHead className="pr-4 text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) => (
            <TableRow key={u.id} className={cn(!u.is_active && 'opacity-70')}>
              <TableCell className="pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <DriverAvatar user={u} className="size-9" />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{u.full_name}</span>
                    <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <Mail className="size-3 shrink-0" /> {u.email}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <RoleBadge role={u.role} />
              </TableCell>
              <TableCell className="text-muted-foreground">{u.department ?? '—'}</TableCell>
              <TableCell className="text-muted-foreground">{u.phone ?? '—'}</TableCell>
              <TableCell>
                <AccountStatus active={u.is_active} />
              </TableCell>
              {canManage && (
                <TableCell className="pr-4 text-right">
                  <RowActions
                    user={u}
                    onEdit={onEdit}
                    onToggle={onToggle}
                    canDelete={canDelete(u)}
                    onDelete={onDelete}
                  />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'table' | 'cards'>('table')
  const [showInactive, setShowInactive] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StaffProfileRow | null>(null)
  const [deleting, setDeleting] = useState<StaffProfileRow | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['staff'], queryFn: listStaffProfiles })
  const { can, isAdmin } = usePermissions()
  const canManage = can('users.manage')

  const { data: principal } = useCurrentPrincipal()
  const currentUserId = principal?.kind === 'staff' ? principal.profile.user_id : undefined
  // Hard delete is admin-only, and you can never delete your own account.
  const canDelete = (u: StaffProfileRow) => isAdmin && u.user_id !== currentUserId

  const inactiveCount = useMemo(
    () => (data ?? []).filter((u) => !u.is_active).length,
    [data],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let rows = data ?? []
    if (!showInactive) rows = rows.filter((u) => u.is_active)
    if (!q) return rows
    return rows.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role ?? '').toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q),
    )
  }, [data, search, showInactive])

  const toggle = useMutation({
    mutationFn: (u: StaffProfileRow) =>
      u.is_active ? deactivateStaff(u.id) : reactivateStaff(u.id),
    onSuccess: (_, u) => {
      toast.success(u.is_active ? 'User deactivated.' : 'User reactivated.')
      qc.invalidateQueries({ queryKey: ['staff'] })
    },
    onError: (e) => toast.error(reportError(e, 'Could not update the user.', { op: 'users.toggle' })),
  })

  const del = useMutation({
    mutationFn: (u: StaffProfileRow) => deleteStaff(u.user_id),
    onSuccess: (_, u) => {
      toast.success(`${u.full_name} was permanently deleted.`)
      qc.invalidateQueries({ queryKey: ['staff'] })
      setDeleting(null)
    },
    onError: (e) => {
      // The edge function returns the "deactivate instead" guidance for users
      // with activity history; surface it verbatim, then close the dialog so
      // the toast is visible.
      toast.error(reportError(e, 'Could not delete the user.', { op: 'users.delete' }))
      setDeleting(null)
    },
  })

  const onEdit = (u: StaffProfileRow) => {
    setEditing(u)
    setDialogOpen(true)
  }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Users"
        description="Staff accounts, roles, and access."
        actions={
          <PermissionButton
            permission="users.manage"
            size="sm"
            onClick={() => {
              setEditing(null)
              setDialogOpen(true)
            }}
            deniedReason="Only accounts with user management can add staff — ask an admin."
          >
            <UserCog className="size-4" /> Add user
          </PermissionButton>
        }
      />

      <div className="flex items-center justify-between gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Inactive accounts are hidden by default; only offer the toggle
              when there is actually something hidden to reveal. */}
          {inactiveCount > 0 && (
            <Button
              variant={showInactive ? 'secondary' : 'outline'}
              size="sm"
              aria-pressed={showInactive}
              aria-label={showInactive ? 'Hide inactive accounts' : 'Show inactive accounts'}
              onClick={() => setShowInactive((v) => !v)}
            >
              {showInactive ? <EyeOff /> : <Eye />}
              <span className="hidden sm:inline">
                {showInactive ? 'Hide inactive' : `Show inactive (${inactiveCount})`}
              </span>
            </Button>
          )}

          {/* Desktop-only density toggle. Below md the table collapses to cards,
              so the choice would be a no-op there. */}
          <div className="hidden items-center rounded-md border p-0.5 md:inline-flex">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label="Table view"
              aria-pressed={view === 'table'}
              onClick={() => setView('table')}
            >
              <Rows3 />
            </Button>
            <Button
              variant={view === 'cards' ? 'secondary' : 'ghost'}
              size="icon-sm"
              aria-label="Card view"
              aria-pressed={view === 'cards'}
              onClick={() => setView('cards')}
            >
              <LayoutGrid />
            </Button>
          </div>
        </div>
      </div>

      {search.trim() && !isLoading && (
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? 'match' : 'matches'}
        </p>
      )}

      {isLoading ? (
        view === 'table' ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-lg" />
            ))}
          </div>
        )
      ) : filtered.length > 0 ? (
        <>
          {view === 'table' && (
            <div className="hidden md:block">
              <UsersTable
                users={filtered}
                canManage={canManage}
                onEdit={onEdit}
                onToggle={toggle.mutate}
                canDelete={canDelete}
                onDelete={setDeleting}
              />
            </div>
          )}
          <div
            className={cn(
              'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
              view === 'table' && 'md:hidden',
            )}
          >
            {filtered.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                canManage={canManage}
                onEdit={onEdit}
                onToggle={toggle.mutate}
                canDelete={canDelete}
                onDelete={setDeleting}
              />
            ))}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <UserCog className="size-5" />
          </span>
          <p className="text-sm font-medium">{search ? 'No users match' : 'No users yet'}</p>
        </div>
      )}

      <UserDialog user={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open && !del.isPending) setDeleting(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the account and revokes access. It can't be
              undone. Staff with delivery or package history can't be deleted;
              deactivate them instead to keep records intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={buttonVariants({ variant: 'destructive' })}
              disabled={del.isPending}
              onClick={(e) => {
                // Keep the dialog open through the request; the mutation closes
                // it on settle so the button can show a pending state.
                e.preventDefault()
                if (deleting) del.mutate(deleting)
              }}
            >
              {del.isPending ? 'Deleting…' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  )
}
