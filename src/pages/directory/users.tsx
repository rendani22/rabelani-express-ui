import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Mail, MoreVertical, Pencil, Phone, Power, Search, UserCog } from 'lucide-react'
import type { StaffProfileRow } from '@/lib/api/drivers'
import { listStaffProfiles } from '@/lib/api/drivers'
import { deactivateStaff, isCurrentUserAdmin, reactivateStaff } from '@/lib/api/staff'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { cn } from '@/lib/utils'
import { UserDialog } from './user-dialog'

const ROLE_TONE: Record<string, string> = {
  admin: 'border-primary/40 bg-primary/12 text-primary',
  manager: 'border-chart-2/35 bg-chart-2/10 text-chart-2',
  driver: 'border-chart-2/35 bg-chart-2/10 text-chart-2',
  collection: 'border-warning/45 bg-warning/15 text-warning-foreground dark:text-warning',
}
function RoleBadge({ role }: { role: string }) {
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]', ROLE_TONE[role] ?? 'border-border bg-muted text-muted-foreground')}>
      {role}
    </span>
  )
}

function DriverAvatar({ user, className }: { user: StaffProfileRow; className?: string }) {
  if (user.avatar_url) return <img src={user.avatar_url} alt={user.full_name} className={cn('rounded-full object-cover', className)} />
  return <ReceiverAvatar name={user.full_name} className={className} />
}

export function UsersPage() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StaffProfileRow | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['staff'], queryFn: listStaffProfiles })
  const admin = useQuery({ queryKey: ['is-admin'], queryFn: isCurrentUserAdmin })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = data ?? []
    if (!q) return rows
    return rows.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.role ?? '').toLowerCase().includes(q) ||
        (u.department ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const toggle = useMutation({
    mutationFn: (u: StaffProfileRow) => (u.is_active ? deactivateStaff(u.id) : reactivateStaff(u.id)),
    onSuccess: (_, u) => { toast.success(u.is_active ? 'User deactivated.' : 'User reactivated.'); qc.invalidateQueries({ queryKey: ['staff'] }) },
    onError: (e) => toast.error(reportError(e, 'Could not update the user.', { op: 'users.toggle' })),
  })

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Users"
        description="Staff accounts, roles, and access."
        actions={
          admin.data && (
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}>
              <UserCog className="size-4" /> Add user
            </Button>
          )
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search users…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-lg" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((u) => (
            <div key={u.id} className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4', !u.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <DriverAvatar user={u} className="size-10" />
                  <div className="flex min-w-0 flex-col gap-1">
                    <span className="truncate font-semibold">{u.full_name}</span>
                    <RoleBadge role={u.role} />
                  </div>
                </div>
                {admin.data && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreVertical /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => { setEditing(u); setDialogOpen(true) }}><Pencil /> Edit</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => toggle.mutate(u)}><Power /> {u.is_active ? 'Deactivate' : 'Reactivate'}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              <div className="flex flex-col gap-1.5 text-sm">
                <span className="flex items-center gap-2 text-muted-foreground"><Mail className="size-3.5" /> <span className="truncate">{u.email}</span></span>
                {u.phone && <span className="flex items-center gap-2 text-muted-foreground"><Phone className="size-3.5" /> {u.phone}</span>}
              </div>
              {u.department && <span className="text-xs text-muted-foreground">{u.department}{!u.is_active ? ' · Inactive' : ''}</span>}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserCog className="size-5" /></span>
          <p className="text-sm font-medium">{search ? 'No users match' : 'No users yet'}</p>
        </div>
      )}

      <UserDialog user={editing} open={dialogOpen} onOpenChange={setDialogOpen} />
    </PageBody>
  )
}
