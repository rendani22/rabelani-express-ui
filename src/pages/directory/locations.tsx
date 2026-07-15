import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MapPin, MoreVertical, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import type { DeliveryLocation } from '@/lib/api/delivery-locations'
import {
  deactivateDeliveryLocation,
  deleteDeliveryLocation,
  listDeliveryLocations,
  reactivateDeliveryLocation,
} from '@/lib/api/delivery-locations'
import { reportError } from '@/lib/logger'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { PermissionButton } from '@/components/dispatch/permission-button'
import { usePermissions } from '@/hooks/use-permissions'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { cn } from '@/lib/utils'
import { LocationDialog } from './location-dialog'

export function LocationsPage() {
  const qc = useQueryClient()
  const { can } = usePermissions()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<DeliveryLocation | null>(null)
  const [pendingDelete, setPendingDelete] = useState<DeliveryLocation | null>(null)

  const { data, isLoading } = useQuery({ queryKey: ['locations'], queryFn: listDeliveryLocations })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const rows = data ?? []
    if (!q) return rows
    return rows.filter(
      (l) => l.name.toLowerCase().includes(q) || (l.address ?? '').toLowerCase().includes(q),
    )
  }, [data, search])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['locations'] })

  const toggle = useMutation({
    mutationFn: (l: DeliveryLocation) =>
      l.is_active ? deactivateDeliveryLocation(l.id) : reactivateDeliveryLocation(l.id),
    onSuccess: (_, l) => {
      toast.success(l.is_active ? 'Location deactivated.' : 'Location reactivated.')
      invalidate()
    },
    onError: (e) => toast.error(reportError(e, 'Could not update the location.', { op: 'locations.toggle' })),
  })
  const remove = useMutation({
    mutationFn: (id: string) => deleteDeliveryLocation(id),
    onSuccess: () => { toast.success('Location deleted.'); setPendingDelete(null); invalidate() },
    onError: (e) => toast.error(reportError(e, 'Could not delete the location.', { op: 'locations.delete' })),
  })

  const openNew = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (l: DeliveryLocation) => { setEditing(l); setDialogOpen(true) }

  return (
    <PageBody>
      <PageHeader
        eyebrow="Directory"
        title="Delivery locations"
        description="Collection points and depots packages can be routed to."
        actions={
          <PermissionButton permission="locations.create" size="sm" onClick={openNew}>
            <Plus /> New location
          </PermissionButton>
        }
      />

      <div className="relative min-w-0 sm:max-w-xs">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search locations…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-lg" />)}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((l) => (
            <div key={l.id} className={cn('flex flex-col gap-3 rounded-lg border bg-card p-4', !l.is_active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2.5">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <MapPin className="size-4" />
                  </span>
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold">{l.name}</span>
                    {!l.is_active && (
                      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Inactive</span>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label="Actions"><MoreVertical /></Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => openEdit(l)} disabled={!can('locations.update')}><Pencil /> Edit</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => toggle.mutate(l)} disabled={!can('locations.update')}>
                      <Power /> {l.is_active ? 'Deactivate' : 'Reactivate'}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setPendingDelete(l)}
                      disabled={!can('locations.delete')}
                    >
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              {l.description && <p className="text-sm text-muted-foreground">{l.description}</p>}
              {l.address && <p className="text-sm">{l.address}</p>}
              {l.latitude != null && l.longitude != null && (
                <p className="mono text-xs text-muted-foreground">
                  {l.latitude.toFixed(4)}, {l.longitude.toFixed(4)}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MapPin className="size-5" />
          </span>
          <p className="text-sm font-medium">{search ? 'No locations match' : 'No locations yet'}</p>
          {!search && <PermissionButton permission="locations.create" variant="outline" size="sm" onClick={openNew}><Plus /> Add the first location</PermissionButton>}
        </div>
      )}

      <LocationDialog location={editing} open={dialogOpen} onOpenChange={setDialogOpen} />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null) }}
        title={pendingDelete ? `Delete “${pendingDelete.name}”?` : 'Delete location?'}
        description="This permanently removes the location and cannot be undone."
        confirmLabel="Delete"
        destructive
        loading={remove.isPending}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.id) }}
      />
    </PageBody>
  )
}
