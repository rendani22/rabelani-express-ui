/**
 * Driver-specific models for location tracking and package management
 */

import { StaffProfile } from './staff-profile.model';
import { Package } from './package.models';

/**
 * Driver location coordinates and metadata
 * Matches driver_locations table schema (UNIQUE constraint on driver_id)
 */
export interface DriverLocation {
  readonly id: string;
  readonly driver_id: string;
  readonly user_id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracy?: number;
  readonly heading?: number;
  readonly speed?: number;
  readonly updated_at: string;
}

/**
 * Vehicle information for a driver
 */
export interface VehicleInfo {
  readonly vehicle_type?: string;
  readonly vehicle_registration?: string;
  readonly license_number?: string;
}

/**
 * Extended driver profile with location and vehicle info
 */
export interface DriverProfile extends StaffProfile {
  readonly vehicle_info?: VehicleInfo;
  readonly current_location?: DriverLocation;
  readonly is_available?: boolean;
  readonly last_seen?: string;
}

/**
 * Driver with their assigned packages
 */
export interface DriverWithPackages {
  readonly driver: DriverProfile;
  readonly packages: readonly Package[];
  readonly activePackageCount: number;
}

/**
 * DTO for creating a new driver
 */
export interface CreateDriverDto {
  readonly email: string;
  readonly password: string;
  readonly full_name: string;
  readonly phone?: string;
  readonly vehicle_type?: string;
  readonly vehicle_registration?: string;
  readonly license_number?: string;
}

/**
 * DTO for updating driver location
 */
export interface UpdateDriverLocationDto {
  readonly latitude: number;
  readonly longitude: number;
  readonly heading?: number;
  readonly speed?: number;
  readonly accuracy?: number;
}

/**
 * Driver status for display
 */
export type DriverStatus = 'available' | 'on_delivery' | 'offline';

/**
 * Map marker data for displaying drivers on map
 */
export interface DriverMapMarker {
  readonly driverId: string;
  readonly driverName: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: DriverStatus;
  readonly activePackages: number;
  readonly lastUpdated: string;
}

