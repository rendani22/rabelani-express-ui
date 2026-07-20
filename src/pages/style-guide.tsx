import { Package, Plus, Search, Truck } from 'lucide-react'
import { ModeToggle } from '@/components/mode-toggle'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  MetricStat,
  RouteTimeline,
  SectionLabel,
  StatusStamp,
  TrackingNumber,
  type RouteStop,
} from '@/components/dispatch'
import { PACKAGE_STATUS } from '@/lib/status'

function Section({
  label,
  title,
  children,
}: {
  label: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <SectionLabel>{label}</SectionLabel>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      </div>
      {children}
    </section>
  )
}

const SWATCHES = [
  { name: 'background', cls: 'bg-background border' },
  { name: 'card', cls: 'bg-card border' },
  { name: 'muted', cls: 'bg-muted' },
  { name: 'primary · cargo', cls: 'bg-primary' },
  { name: 'success · delivered', cls: 'bg-success' },
  { name: 'warning · caution', cls: 'bg-warning' },
  { name: 'destructive', cls: 'bg-destructive' },
  { name: 'chart · route blue', cls: 'bg-chart-2' },
]

const TYPE_SCALE = [
  { label: 'display / 44', cls: 'text-[2.75rem] font-semibold tracking-tight leading-none' },
  { label: 'h1 / 28', cls: 'text-[1.75rem] font-semibold tracking-tight' },
  { label: 'h2 / 22', cls: 'text-[1.375rem] font-semibold tracking-tight' },
  { label: 'h3 / 18', cls: 'text-lg font-medium' },
  { label: 'body / 14', cls: 'text-sm' },
  { label: 'caption / 11', cls: 'text-[11px] text-muted-foreground' },
]

const ROWS = [
  { track: 'RBX-2K4H-8801', receiver: 'Thabo Mokoena', status: PACKAGE_STATUS.IN_TRANSIT, dest: 'Polokwane' },
  { track: 'RBX-2K4H-8794', receiver: 'Naledi Dlamini', status: PACKAGE_STATUS.DELIVERED, dest: 'Thohoyandou' },
  { track: 'RBX-2K4H-8788', receiver: 'Sipho Nkosi', status: PACKAGE_STATUS.READY_FOR_COLLECTION, dest: 'Musina' },
  { track: 'RBX-2K4H-8781', receiver: 'Lerato Khumalo', status: PACKAGE_STATUS.NOTIFIED, dest: 'Giyani' },
  { track: 'RBX-2K4H-8775', receiver: 'Johan van Wyk', status: PACKAGE_STATUS.RETURNED, dest: 'Tzaneen' },
]

const STOPS: RouteStop[] = [
  { label: 'Package created', detail: 'Depot · Makhado', timestamp: '08:12', state: 'done' },
  { label: 'Picked up by driver', detail: 'S. Nkosi · Bakkie 14', timestamp: '09:40', state: 'done' },
  { label: 'In transit', detail: 'En route to collection point', timestamp: '10:05', state: 'current' },
  { label: 'Ready for collection', detail: 'Polokwane depot', state: 'upcoming' },
  { label: 'Delivered', state: 'upcoming' },
]

export function StyleGuide() {
  return (
    <div className="min-h-svh bg-background">
      {/* header */}
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Truck className="size-4" />
            </span>
            <div className="flex flex-col leading-none">
              <span className="text-sm font-semibold tracking-tight">Rabelani Express</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Dispatch
              </span>
            </div>
          </div>
          <ModeToggle />
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-14 px-6 py-12">
        {/* intro */}
        <div className="flex flex-col gap-3">
          <SectionLabel>Design direction</SectionLabel>
          <h1 className="max-w-2xl text-[2.5rem] font-semibold leading-[1.05] tracking-tight">
            An operational control surface for a courier depot.
          </h1>
          <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
            Dense but breathable. Tracking numbers as a first-class monospace texture, status as an
            ink-stamp, chain-of-custody as a literal route line. One accent — cargo orange — used
            only for action. Depth from borders and surface tint, not shadow.
          </p>
        </div>

        <div className="tear-line" />

        {/* palette */}
        <Section label="Foundations" title="Colour world">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SWATCHES.map((s) => (
              <div key={s.name} className="flex flex-col gap-2">
                <div className={`h-16 w-full rounded-md ${s.cls}`} />
                <span className="text-[11px] font-medium text-muted-foreground">{s.name}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* type */}
        <Section label="Foundations" title="Type — Archivo + JetBrains Mono">
          <div className="flex flex-col divide-y rounded-lg border">
            {TYPE_SCALE.map((t) => (
              <div key={t.label} className="flex items-baseline gap-6 px-5 py-3.5">
                <span className="w-24 shrink-0 text-[11px] text-muted-foreground tabular">
                  {t.label}
                </span>
                <span className={t.cls}>Dispatch board</span>
              </div>
            ))}
            <div className="flex items-baseline gap-6 px-5 py-3.5">
              <span className="w-24 shrink-0 text-[11px] text-muted-foreground tabular">mono</span>
              <span className="mono text-sm">RBX-2K4H-8801 · 27.048 kg · 10:05</span>
            </div>
          </div>
        </Section>

        <div className="tear-line" />

        {/* signatures */}
        <Section label="Signatures" title="Status stamps">
          <div className="flex flex-wrap gap-2.5">
            {Object.values(PACKAGE_STATUS).map((s) => (
              <StatusStamp key={s} status={s} />
            ))}
          </div>
        </Section>

        <Section label="Signatures" title="Metrics & tracking token">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-5">
              <MetricStat label="In transit" value={128} delta={{ value: '12%', direction: 'up' }} />
            </div>
            <div className="rounded-lg border bg-card p-5">
              <MetricStat
                label="Delivered today"
                value={342}
                delta={{ value: '4%', direction: 'up' }}
              />
            </div>
            <div className="rounded-lg border bg-card p-5">
              <MetricStat
                label="Awaiting collection"
                value={57}
                delta={{ value: '8%', direction: 'down', good: false }}
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">Copyable ID:</span>
            <TrackingNumber value="RBX-2K4H-8801" copyable />
          </div>
        </Section>

        <Section label="Signatures" title="Chain of custody">
          <div className="max-w-md rounded-lg border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <TrackingNumber value="RBX-2K4H-8801" />
              <StatusStamp status={PACKAGE_STATUS.IN_TRANSIT} />
            </div>
            <RouteTimeline stops={STOPS} />
          </div>
        </Section>

        <div className="tear-line" />

        {/* controls */}
        <Section label="Primitives" title="Controls">
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button>
                <Plus /> New package
              </Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Delete</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input placeholder="Search tracking number…" className="pl-9" />
              </div>
              <Badge>Active</Badge>
              <Badge variant="secondary">Draft</Badge>
              <Badge variant="outline">
                <Package className="size-3" /> 12 items
              </Badge>
            </div>
          </div>
        </Section>

        {/* table */}
        <Section label="Primitives" title="Dispatch table">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead className="text-[11px] uppercase tracking-wider">Tracking</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Receiver</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Destination</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ROWS.map((r) => (
                  <TableRow key={r.track}>
                    <TableCell>
                      <TrackingNumber value={r.track} copyable />
                    </TableCell>
                    <TableCell className="font-medium">{r.receiver}</TableCell>
                    <TableCell className="text-muted-foreground">{r.dest}</TableCell>
                    <TableCell>
                      <StatusStamp status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>

        <div className="tear-line" />
        <p className="pb-8 text-center text-xs text-muted-foreground">
          Dispatch design system · Rabelani Express UI
        </p>
      </main>
    </div>
  )
}
