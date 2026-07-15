import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { List, Mail, Map as MapIcon, Phone, Plus, RefreshCw, Search, Truck, UserX, X } from 'lucide-react'
import type { DriverProfile } from '@/lib/api/drivers'
import { getDriverStatus, toDriverMapMarkers } from '@/lib/api/drivers'
import { usePermissions } from '@/hooks/use-permissions'
import { useDriverPackages, useDrivers } from '@/hooks/use-drivers'
import { useSettings } from '@/lib/settings-store'
import { DRIVER_STATUS } from '@/lib/driver-status'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { DriverMap } from '@/components/drivers/driver-map'
import { StatusStamp, TrackingNumber } from '@/components/dispatch'
import { ReceiverAvatar } from '@/components/dispatch/receiver-avatar'
import { formatDateTime, timeAgo } from '@/lib/format'
import { cn } from '@/lib/utils'

function DriverAvatar({ driver, className }: { driver: DriverProfile; className?: string }) {
  if (driver.avatar_url) {
    return <img src={driver.avatar_url} alt={driver.full_name} className={cn('rounded-full object-cover', className)} />
  }
  return <ReceiverAvatar name={driver.full_name} className={className} />
}

function StatusChip({ driver }: { driver: DriverProfile }) {
  const meta = DRIVER_STATUS[getDriverStatus(driver)]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium', meta.chip)}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

function StatTile({ label, value, className }: { label: string; value: number; className?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className={cn('tabular text-2xl font-semibold', className)}>{value}</span>
      <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
    </div>
  )
}

function DriverCard({ driver, selected, onClick }: { driver: DriverProfile; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent/40',
        selected && 'ring-2 ring-primary/50',
      )}
    >
      <DriverAvatar driver={driver} className="size-10" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{driver.full_name}</span>
        <span className="truncate text-xs text-muted-foreground">{driver.email}</span>
      </div>
      <StatusChip driver={driver} />
    </button>
  )
}

function DriverDetails({ driver, onClose }: { driver: DriverProfile; onClose: () => void }) {
  const packages = useDriverPackages(driver.user_id)
  const loc = driver.current_location
  return (
    <div className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-3">
          <DriverAvatar driver={driver} className="size-12" />
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{driver.full_name}</span>
            <span className="truncate text-sm text-muted-foreground">{driver.email}</span>
            <div className="mt-1.5">
              <StatusChip driver={driver} />
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
          <X />
        </Button>
      </div>

      <div className="flex flex-col gap-2 border-b p-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Contact</span>
        <div className="flex items-center gap-2 text-sm">
          <Mail className="size-4 text-muted-foreground" /> <span className="truncate">{driver.email}</span>
        </div>
        {driver.phone && (
          <div className="flex items-center gap-2 text-sm">
            <Phone className="size-4 text-muted-foreground" /> <span>{driver.phone}</span>
          </div>
        )}
      </div>

      {loc && (
        <div className="flex flex-col gap-2 border-b p-4">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Current location</span>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Coordinates</span>
            <span className="mono">{loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}</span>
          </div>
          {loc.speed != null && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Speed</span>
              <span className="tabular">{loc.speed.toFixed(0)} km/h</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Last updated</span>
            <span>{timeAgo(loc.updated_at)}</span>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2 p-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Active deliveries {packages.data ? `(${packages.data.length})` : ''}
        </span>
        {packages.isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : packages.data && packages.data.length > 0 ? (
          <ul className="flex flex-col divide-y">
            {packages.data.map((pkg) => (
              <li key={pkg.id} className="flex items-center justify-between gap-2 py-2">
                <div className="flex min-w-0 flex-col">
                  <TrackingNumber value={pkg.reference} />
                  <span className="truncate text-xs text-muted-foreground">{pkg.receiver_email}</span>
                </div>
                <StatusStamp status={pkg.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-2 text-sm text-muted-foreground">No active deliveries.</p>
        )}
        {loc && (
          <p className="pt-1 text-[11px] text-muted-foreground">Location as of {formatDateTime(loc.updated_at)}</p>
        )}
      </div>
    </div>
  )
}

export function DriversPage() {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'map' | 'list'>(() => useSettings.getState().defaultDriversView)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data, isLoading, isError, error, isFetching, refetch } = useDrivers()
  const { can } = usePermissions()

  const drivers = data ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return drivers
    return drivers.filter(
      (d) =>
        d.full_name.toLowerCase().includes(q) ||
        d.email.toLowerCase().includes(q) ||
        (d.phone ?? '').toLowerCase().includes(q),
    )
  }, [drivers, search])

  const stats = useMemo(() => {
    let available = 0, onDelivery = 0, offline = 0
    for (const d of drivers) {
      const s = getDriverStatus(d)
      if (s === 'available') available++
      else if (s === 'on_delivery') onDelivery++
      else offline++
    }
    return { total: drivers.length, available, onDelivery, offline }
  }, [drivers])

  const markers = useMemo(() => toDriverMapMarkers(filtered), [filtered])
  const selected = drivers.find((d) => d.id === selectedId) ?? null

  return (
    <PageBody>
      <PageHeader
        eyebrow="Fleet"
        title="Drivers"
        description="Track drivers on the map and manage deliveries."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={isFetching ? 'animate-spin' : ''} /> Refresh
            </Button>
            {can('users.manage') && (
              <Button size="sm" onClick={() => toast.info('Add-driver lands in a later update.')}>
                <Plus /> Add driver
              </Button>
            )}
          </>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label="Total drivers" value={stats.total} />
        <StatTile label="Available" value={stats.available} className="text-success" />
        <StatTile label="On delivery" value={stats.onDelivery} className="text-primary" />
        <StatTile label="Offline" value={stats.offline} className="text-muted-foreground" />
      </div>

      {/* filter + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search drivers…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex rounded-md border p-0.5">
          {(['map', 'list'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setView(m)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium capitalize transition-colors',
                view === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {m === 'map' ? <MapIcon className="size-3.5" /> : <List className="size-3.5" />} {m}
            </button>
          ))}
        </div>
      </div>

      {isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
          <p className="text-sm font-medium">Couldn&apos;t load drivers</p>
          <p className="max-w-md text-sm text-muted-foreground">{(error as Error)?.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw /> Retry
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* main */}
          <div className="lg:col-span-2">
            {isLoading ? (
              <Skeleton className="h-[560px] rounded-lg" />
            ) : view === 'map' ? (
              <div className="h-[560px] overflow-hidden rounded-lg border">
                <DriverMap markers={markers} selectedId={selectedId} onSelect={setSelectedId} />
              </div>
            ) : filtered.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filtered.map((d) => (
                  <DriverCard key={d.id} driver={d} selected={d.id === selectedId} onClick={() => setSelectedId(d.id)} />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed py-16 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Truck className="size-5" />
                </span>
                <p className="text-sm font-medium">{search ? 'No drivers match your search' : 'No drivers yet'}</p>
              </div>
            )}
          </div>

          {/* details */}
          <div className="lg:col-span-1">
            {selected ? (
              <DriverDetails driver={selected} onClose={() => setSelectedId(null)} />
            ) : (
              <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12 text-center">
                <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <UserX className="size-5" />
                </span>
                <p className="text-sm font-medium">No driver selected</p>
                <p className="max-w-[16rem] text-sm text-muted-foreground">
                  Pick a driver on the {view} to see their status, location, and deliveries.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </PageBody>
  )
}
