import type { DriverStatus } from '@/lib/api/drivers'

interface DriverStatusMeta {
  label: string
  /** tailwind text/bg/dot classes */
  text: string
  dot: string
  chip: string
  /** raw color for the map marker */
  color: string
}

export const DRIVER_STATUS: Record<DriverStatus, DriverStatusMeta> = {
  available: {
    label: 'Available',
    text: 'text-success',
    dot: 'bg-success',
    chip: 'border-success/40 bg-success/12 text-success',
    color: 'var(--chart-3)',
  },
  on_delivery: {
    label: 'On Delivery',
    text: 'text-primary',
    dot: 'bg-primary',
    chip: 'border-primary/40 bg-primary/12 text-primary',
    color: 'var(--chart-1)',
  },
  offline: {
    label: 'Offline',
    text: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
    chip: 'border-border bg-muted text-muted-foreground',
    color: 'var(--chart-5)',
  },
}
