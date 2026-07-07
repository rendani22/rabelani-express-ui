import { supabase } from '@/lib/supabase'
import { PACKAGE_STATUS } from '@/lib/status'
import type { Package } from '@/lib/models/package'

// ============================================================================
// Types (ported from core/models/driver.models.ts + staff-profile.model.ts)
// ============================================================================

export type StaffRole =
  | 'admin'
  | 'manager'
  | 'driver'
  | 'staff'
  | 'viewer'
  | 'collection'

/**
 * A staff_profiles row. The Angular model exposes `full_name`; some datasets
 * also carry `name`/`surname`, so both are included as optional for the React
 * rewrite. `select('*')` returns whatever columns exist.
 */
export interface StaffProfileRow {
  id: string
  user_id: string
  email: string
  full_name: string
  name?: string | null
  surname?: string | null
  role: StaffRole
  is_active: boolean
  avatar_url?: string
  phone?: string
  department?: string
  created_at: string
  updated_at: string
}

/** Driver location (`driver_locations` table, UNIQUE on driver_id). */
export interface DriverLocation {
  id: string
  driver_id: string
  user_id: string
  latitude: number
  longitude: number
  accuracy?: number
  heading?: number
  speed?: number
  updated_at: string
}

/** Extended driver profile with its latest location and availability. */
export interface DriverProfile extends StaffProfileRow {
  current_location?: DriverLocation
  is_available?: boolean
  last_seen?: string
}

export type DriverStatus = 'available' | 'on_delivery' | 'offline'

/** Map marker data for displaying a driver on the map. */
export interface DriverMapMarker {
  driverId: string
  driverName: string
  latitude: number
  longitude: number
  status: DriverStatus
  activePackages: number
  lastUpdated: string
}

// ============================================================================
// Reads
// ============================================================================

/**
 * Load all drivers (staff with role 'driver'), newest first, enriched with
 * their latest location + a derived `is_available` flag.
 * Ported from `DriverService.loadDrivers()` + `enrichDriversWithLocations()`.
 */
export async function listDrivers(): Promise<DriverProfile[]> {
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .eq('role', 'driver')
    .order('created_at', { ascending: false })

  if (error) throw error

  const drivers = (data ?? []) as StaffProfileRow[]
  return enrichDriversWithLocations(drivers)
}

/**
 * Load all staff profiles, newest first.
 * Ported from `StaffService.loadAllStaff()` (used where a full staff list /
 * driver directory is needed).
 */
export async function listStaffProfiles(): Promise<StaffProfileRow[]> {
  const { data, error } = await supabase
    .from('staff_profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []) as StaffProfileRow[]
}

/**
 * Fetch the latest location rows for the given driver ids.
 * Ported from the `driver_locations` read inside `enrichDriversWithLocations()`.
 */
export async function listDriverLocations(driverIds: string[]): Promise<DriverLocation[]> {
  if (!driverIds.length) return []
  const { data, error } = await supabase
    .from('driver_locations')
    .select('*')
    .in('driver_id', driverIds)

  if (error) throw error
  return (data ?? []) as DriverLocation[]
}

// ============================================================================
// Enrichment + display helpers (pure, ported from DriverService)
// ============================================================================

/**
 * Merge each driver profile with its latest location and a derived
 * availability flag. Ported from `DriverService.enrichDriversWithLocations()`.
 */
export async function enrichDriversWithLocations(
  drivers: StaffProfileRow[],
): Promise<DriverProfile[]> {
  if (drivers.length === 0) return []

  const locations = await listDriverLocations(drivers.map((d) => d.id))
  const locationMap = new Map<string, DriverLocation>()
  for (const loc of locations) locationMap.set(loc.driver_id, loc)

  return drivers.map((driver) => ({
    ...driver,
    current_location: locationMap.get(driver.id),
    is_available: calculateAvailability(driver, locationMap.get(driver.id)),
  }))
}

/**
 * Driver is available when active and either has no location or a location
 * updated within the last 10 minutes. Ported from
 * `DriverService.calculateAvailability()`.
 */
export function calculateAvailability(
  driver: StaffProfileRow,
  location?: DriverLocation,
): boolean {
  if (!driver.is_active) return false
  if (!location) return true
  const lastUpdate = new Date(location.updated_at)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  return lastUpdate > tenMinutesAgo
}

/** Determine a driver's display status. Ported from `DriverService.getDriverStatus()`. */
export function getDriverStatus(driver: DriverProfile): DriverStatus {
  if (!driver.is_active) return 'offline'
  if (!driver.current_location) return 'offline'
  const lastUpdate = new Date(driver.current_location.updated_at)
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
  if (lastUpdate < tenMinutesAgo) return 'offline'
  if (!driver.is_available) return 'on_delivery'
  return 'available'
}

/**
 * Build map markers for the drivers that have a current location.
 * Ported from `DriverService.mapMarkers` + `mapDriverToMarker()`.
 */
export function toDriverMapMarkers(drivers: DriverProfile[]): DriverMapMarker[] {
  return drivers
    .filter((d) => d.current_location)
    .map((d) => {
      const location = d.current_location!
      return {
        driverId: d.id,
        driverName: d.full_name,
        latitude: location.latitude,
        longitude: location.longitude,
        status: getDriverStatus(d),
        activePackages: 0,
        lastUpdated: location.updated_at,
      }
    })
}

/**
 * Packages currently assigned to a driver — in-transit packages picked up by
 * the driver's auth user_id. Ported from `loadDriverPackages`.
 */
export async function listDriverActivePackages(driverUserId: string): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*, items:package_items(id, quantity, description, inventory_item_id)')
    .eq('status', PACKAGE_STATUS.IN_TRANSIT)
    .eq('picked_up_by', driverUserId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return []
  return (data ?? []) as Package[]
}
