import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DefaultDriversView = 'map' | 'list'

export interface AppSettings {
  /** periodically refetch live data (drivers/dashboard) */
  autoRefreshEnabled: boolean
  /** refresh interval in seconds */
  autoRefreshInterval: number
  /** pre-selected status filter when opening Orders */
  defaultOrdersFilter: string
  /** map or list layout when opening Drivers */
  defaultDriversView: DefaultDriversView
  /** reduce padding/density across the app */
  compactMode: boolean
}

const DEFAULTS: AppSettings = {
  autoRefreshEnabled: true,
  autoRefreshInterval: 30,
  defaultOrdersFilter: 'all',
  defaultDriversView: 'map',
  compactMode: false,
}

interface SettingsState extends AppSettings {
  update: (patch: Partial<AppSettings>) => void
  reset: () => void
}

/** App preferences, persisted to localStorage (ported from SettingsService). */
export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      update: (patch) => set(patch),
      reset: () => set(DEFAULTS),
    }),
    { name: 'app-settings' },
  ),
)

export const REFRESH_INTERVAL_OPTIONS = [
  { label: 'Every 15 seconds', value: 15 },
  { label: 'Every 30 seconds', value: 30 },
  { label: 'Every minute', value: 60 },
  { label: 'Every 5 minutes', value: 300 },
]
