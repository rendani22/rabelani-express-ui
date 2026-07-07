/**
 * Delivery point entity matching the delivery_locations table schema.
 *
 * (The underlying table is still named `delivery_locations` for backwards
 * compatibility, but the domain concept is now called a "Delivery Point".)
 */
export interface DeliveryLocation {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly address?: string;
  readonly notes?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at?: string;
}

/**
 * DTO for creating a new delivery point.
 */
export interface CreateDeliveryLocationDto {
  readonly name: string;
  readonly description?: string;
  readonly address?: string;
  readonly notes?: string;
  readonly latitude?: number;
  readonly longitude?: number;
}

/**
 * DTO for updating an existing delivery point.
 */
export interface UpdateDeliveryLocationDto {
  readonly name?: string;
  readonly description?: string;
  readonly address?: string;
  readonly notes?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly is_active?: boolean;
}
