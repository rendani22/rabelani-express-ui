import { useNavigate } from 'react-router-dom'
import { useTheme } from 'next-themes'
import { Compass, LayoutGrid, List, LogOut, Map as MapIcon, Moon, Package, Play, RotateCcw, Sun, User } from 'lucide-react'
import { useAuth } from '@/lib/auth'
import { REFRESH_INTERVAL_OPTIONS, useSettings } from '@/lib/settings-store'
import { ALL_TOUR_IDS, TOUR_LABELS, useTourStore } from '@/lib/tour-store'
import { ORDER_STATUS_FILTERS } from '@/hooks/use-orders'
import { PageBody, PageHeader } from '@/components/layout/page-header'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

function Card({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Sun
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border bg-card">
      <header className="flex items-center gap-3 border-b p-4">
        <span className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
          <Icon className="size-[18px]" />
        </span>
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </header>
      <div className="flex flex-col divide-y">{children}</div>
    </section>
  )
}

function Row({ name, hint, children }: { name: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{name}</span>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string; icon?: typeof Sun }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex rounded-md border p-0.5">
      {options.map((o) => {
        const Icon = o.icon
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-3 py-1 text-xs font-medium transition-colors',
              value === o.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {Icon && <Icon className="size-3.5" />} {o.label}
          </button>
        )
      })}
    </div>
  )
}

/** A tour's home route — a tour targets elements on its own page. */
const TOUR_ROUTES: Record<string, string> = {
  dashboard: '/dashboard',
  orders: '/orders',
  'purchase-orders': '/purchase-orders',
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { user, signOut } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const s = useSettings()
  const restartTour = useTourStore((t) => t.restart)

  const replayTour = (id: (typeof ALL_TOUR_IDS)[number]) => {
    const route = TOUR_ROUTES[id]
    // Navigate to the tour's page first, then start once it has mounted.
    if (route) navigate(route)
    window.setTimeout(() => restartTour(id), route ? 350 : 0)
  }

  return (
    <PageBody className="mx-auto w-full max-w-3xl">
      <PageHeader eyebrow="Preferences" title="Settings" description="Manage your application preferences." />

      <Card icon={Sun} title="Appearance" description="Choose your preferred colour scheme.">
        <Row name="Theme" hint="Applies across all pages">
          <Segmented
            value={resolvedTheme === 'dark' ? 'dark' : 'light'}
            onChange={(v) => setTheme(v)}
            options={[
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ]}
          />
        </Row>
      </Card>

      <Card icon={RotateCcw} title="Data & refresh" description="Control how often live data is updated.">
        <Row name="Auto-refresh" hint="Periodically reload drivers and dashboard">
          <Switch checked={s.autoRefreshEnabled} onCheckedChange={(v) => s.update({ autoRefreshEnabled: v })} />
        </Row>
        {s.autoRefreshEnabled && (
          <Row name="Refresh interval" hint="How often to fetch new data">
            <Select value={String(s.autoRefreshInterval)} onValueChange={(v) => s.update({ autoRefreshInterval: Number(v) })}>
              <SelectTrigger className="w-[180px]" size="sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REFRESH_INTERVAL_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
        )}
      </Card>

      <Card icon={Package} title="Orders" description="Default view options for the Orders page.">
        <Row name="Default status filter" hint="Pre-selected filter when opening Orders">
          <Select value={s.defaultOrdersFilter} onValueChange={(v) => s.update({ defaultOrdersFilter: v })}>
            <SelectTrigger className="w-[190px]" size="sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {ORDER_STATUS_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Row>
      </Card>

      <Card icon={MapIcon} title="Drivers" description="Default view options for the Drivers page.">
        <Row name="Default view" hint="Map or list layout when opening Drivers">
          <Segmented
            value={s.defaultDriversView}
            onChange={(v) => s.update({ defaultDriversView: v })}
            options={[
              { value: 'map', label: 'Map', icon: MapIcon },
              { value: 'list', label: 'List', icon: List },
            ]}
          />
        </Row>
      </Card>

      <Card icon={LayoutGrid} title="Display" description="Layout and density preferences.">
        <Row name="Compact mode" hint="Reduce padding to show more content">
          <Switch checked={s.compactMode} onCheckedChange={(v) => s.update({ compactMode: v })} />
        </Row>
      </Card>

      <div className="flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => s.reset()}>
          <RotateCcw /> Reset to defaults
        </Button>
        <span className="text-xs text-muted-foreground">Preferences are saved automatically.</span>
      </div>

      <Card icon={Compass} title="Help & onboarding" description="Replay a guided product tour at any time.">
        {ALL_TOUR_IDS.map((id) => (
          <Row key={id} name={`${TOUR_LABELS[id]} tour`} hint="Walk through the key features of this page">
            <Button variant="outline" size="sm" onClick={() => replayTour(id)}>
              <Play /> Replay
            </Button>
          </Row>
        ))}
      </Card>

      <Card icon={User} title="Account" description="Your current session.">
        <Row name="Signed in as" hint={user?.email ?? 'Not signed in'}>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={async () => {
              await signOut()
              navigate('/login', { replace: true })
            }}
          >
            <LogOut /> Sign out
          </Button>
        </Row>
      </Card>
    </PageBody>
  )
}
