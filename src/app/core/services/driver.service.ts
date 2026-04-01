import { Injectable, inject, signal, computed } from '@angular/core';
import { SupabaseService } from '../../shared/services/supabase.service';
import { StaffService } from './staff.service';
import { StaffProfile, CreateStaffProfileDto } from '../models/staff-profile.model';
import { Package, PACKAGE_STATUS } from '../models/package.models';
import {
  DriverProfile,
  DriverLocation,
  CreateDriverDto,
  UpdateDriverLocationDto,
  DriverMapMarker,
  DriverStatus
} from '../models/driver.models';

export interface DriverOperationResult {
  readonly driver: DriverProfile | null;
  readonly error: string | null;
}

/**
 * DriverService handles driver-specific operations.
 *
 * Key features:
 * - Fetches all drivers (staff with role 'driver')
 * - Manages driver locations
 * - Retrieves packages assigned to drivers
 * - Uses Angular signals for reactive state management
 */
@Injectable({
  providedIn: 'root'
})
export class DriverService {
  private readonly supabaseService = inject(SupabaseService);
  private readonly staffService = inject(StaffService);

  /** List of all drivers */
  readonly drivers = signal<DriverProfile[]>([]);

  /** Currently selected driver */
  readonly selectedDriver = signal<DriverProfile | null>(null);

  /** Packages for selected driver */
  readonly selectedDriverPackages = signal<Package[]>([]);

  /** Loading state */
  readonly loading = signal<boolean>(false);

  /** Error state */
  readonly error = signal<string | null>(null);

  /** Map markers for all drivers with locations */
  readonly mapMarkers = computed<DriverMapMarker[]>(() => {
    return this.drivers()
      .filter(d => d.current_location)
      .map(d => this.mapDriverToMarker(d));
  });

  /** Count of available drivers */
  readonly availableDriversCount = computed(() =>
    this.drivers().filter(d => d.is_available !== false && d.is_active).length
  );

  /** Count of drivers currently on delivery */
  readonly onDeliveryCount = computed(() =>
    this.drivers().filter(d => !d.is_available && d.is_active).length
  );

  /**
   * Load all drivers (staff with role 'driver')
   */
  async loadDrivers(): Promise<DriverProfile[]> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('*')
        .eq('role', 'driver')
        .order('created_at', { ascending: false });

      if (error) {
        this.error.set(error.message);
        return [];
      }

      // Fetch latest locations for all drivers
      const driversWithLocations = await this.enrichDriversWithLocations(data as StaffProfile[]);
      this.drivers.set(driversWithLocations);
      return driversWithLocations;
    } catch (err) {
      this.error.set('An unexpected error occurred while loading drivers.');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Enrich driver profiles with their latest location
   */
  private async enrichDriversWithLocations(drivers: StaffProfile[]): Promise<DriverProfile[]> {
    if (drivers.length === 0) return [];

    const driverIds = drivers.map(d => d.id);

    // Fetch locations for all drivers (one location per driver due to UNIQUE constraint)
    const { data: locations } = await this.supabaseService.client
      .from('driver_locations')
      .select('*')
      .in('driver_id', driverIds);

    // Create a map of driver_id to location
    const locationMap = new Map<string, DriverLocation>();
    if (locations) {
      for (const loc of locations) {
        locationMap.set(loc.driver_id, this.mapDbLocationToModel(loc));
      }
    }

    // Merge locations with driver profiles
    return drivers.map(driver => ({
      ...driver,
      current_location: locationMap.get(driver.id),
      is_available: this.calculateAvailability(driver, locationMap.get(driver.id))
    }));
  }

  /**
   * Map database location row to DriverLocation model
   */
  private mapDbLocationToModel(row: Record<string, unknown>): DriverLocation {
    return {
      id: row['id'] as string,
      driver_id: row['driver_id'] as string,
      user_id: row['user_id'] as string,
      latitude: row['latitude'] as number,
      longitude: row['longitude'] as number,
      heading: row['heading'] as number | undefined,
      speed: row['speed'] as number | undefined,
      accuracy: row['accuracy'] as number | undefined,
      updated_at: row['updated_at'] as string
    };
  }

  /**
   * Calculate driver availability based on location freshness
   */
  private calculateAvailability(driver: StaffProfile, location?: DriverLocation): boolean {
    if (!driver.is_active) return false;
    if (!location) return true; // No location = assume available

    // Consider offline if no update in last 10 minutes
    const lastUpdate = new Date(location.updated_at);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    return lastUpdate > tenMinutesAgo;
  }

  /**
   * Get a specific driver by ID
   */
  async getDriver(driverId: string): Promise<DriverProfile | null> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const { data, error } = await this.supabaseService.client
        .from('staff_profiles')
        .select('*')
        .eq('id', driverId)
        .eq('role', 'driver')
        .single();

      if (error) {
        this.error.set(error.message);
        return null;
      }

      const driversWithLocations = await this.enrichDriversWithLocations([data as StaffProfile]);
      const driver = driversWithLocations[0] || null;
      this.selectedDriver.set(driver);
      return driver;
    } catch (err) {
      this.error.set('Failed to load driver details.');
      return null;
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Load packages assigned to a driver (in_transit status, picked up by this driver)
   */
  async loadDriverPackages(driverId: string): Promise<Package[]> {
    this.loading.set(true);

    try {
      // First get the driver's user_id from their staff profile
      const driver = this.drivers().find(d => d.id === driverId);
      if (!driver) {
        this.selectedDriverPackages.set([]);
        return [];
      }

      // Packages that are in_transit and were picked up by this driver's user_id
      const { data, error } = await this.supabaseService.client
        .from('packages')
        .select('*')
        .eq('status', PACKAGE_STATUS.IN_TRANSIT)
        .eq('picked_up_by', driver.user_id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Failed to load driver packages:', error);
        this.selectedDriverPackages.set([]);
        return [];
      }

      this.selectedDriverPackages.set((data || []) as Package[]);
      return (data || []) as Package[];
    } catch (err) {
      this.error.set('Failed to load driver packages.');
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Create a new driver account
   */
  async createDriver(dto: CreateDriverDto): Promise<DriverOperationResult> {
    this.loading.set(true);
    this.error.set(null);

    try {
      // Use staff service to create the driver with role 'driver'
      const staffDto: CreateStaffProfileDto = {
        email: dto.email,
        password: dto.password,
        full_name: dto.full_name,
        role: 'driver',
        phone: dto.phone,
        department: dto.vehicle_type ? `Vehicle: ${dto.vehicle_type}` : undefined
      };

      const result = await this.staffService.createStaff(staffDto);

      if (result.error) {
        this.error.set(result.error);
        return { driver: null, error: result.error };
      }

      // Refresh drivers list
      await this.loadDrivers();

      return {
        driver: result.profile as DriverProfile,
        error: null
      };
    } catch (err) {
      const errorMessage = 'Failed to create driver account.';
      this.error.set(errorMessage);
      return { driver: null, error: errorMessage };
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * Update driver's current location (upserts due to UNIQUE constraint on driver_id)
   */
  async updateDriverLocation(driverId: string, userId: string, location: UpdateDriverLocationDto): Promise<boolean> {
    try {
      const { error } = await this.supabaseService.client
        .from('driver_locations')
        .upsert({
          driver_id: driverId,
          user_id: userId,
          latitude: location.latitude,
          longitude: location.longitude,
          heading: location.heading,
          speed: location.speed,
          accuracy: location.accuracy,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'driver_id'
        });

      if (error) {
        console.error('Failed to update driver location:', error);
        return false;
      }

      // Refresh drivers to update map markers
      await this.loadDrivers();
      return true;
    } catch (err) {
      console.error('Error updating driver location:', err);
      return false;
    }
  }

  /**
   * Select a driver and load their packages
   */
  async selectDriver(driver: DriverProfile | null): Promise<void> {
    this.selectedDriver.set(driver);
    if (driver) {
      await this.loadDriverPackages(driver.id);
    } else {
      this.selectedDriverPackages.set([]);
    }
  }

  /**
   * Map driver profile to map marker
   */
  private mapDriverToMarker(driver: DriverProfile): DriverMapMarker {
    const location = driver.current_location!;
    return {
      driverId: driver.id,
      driverName: driver.full_name,
      latitude: location.latitude,
      longitude: location.longitude,
      status: this.getDriverStatus(driver),
      activePackages: 0, // Will be updated when we have package assignments
      lastUpdated: location.updated_at
    };
  }

  /**
   * Determine driver status for display
   */
  private getDriverStatus(driver: DriverProfile): DriverStatus {
    if (!driver.is_active) return 'offline';
    if (!driver.current_location) return 'offline';

    const lastUpdate = new Date(driver.current_location.updated_at);
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    if (lastUpdate < tenMinutesAgo) return 'offline';
    if (!driver.is_available) return 'on_delivery';
    return 'available';
  }

  /**
   * Refresh driver data (for polling)
   */
  async refresh(): Promise<void> {
    await this.loadDrivers();
    const selected = this.selectedDriver();
    if (selected) {
      await this.loadDriverPackages(selected.id);
    }
  }
}


