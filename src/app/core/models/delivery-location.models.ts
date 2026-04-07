/**
 * Delivery location entity matching the delivery_locations table schema.
 */
export interface DeliveryLocation {
  readonly id: string;
  readonly name: string;
  readonly address?: string;
  readonly notes?: string;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at?: string;
}

/**
 * DTO for creating a new delivery location.
 */
export interface CreateDeliveryLocationDto {
  readonly name: string;
  readonly address?: string;
  readonly notes?: string;
}

/**
 * DTO for updating an existing delivery location.
 */
export interface UpdateDeliveryLocationDto {
  readonly name?: string;
  readonly address?: string;
  readonly notes?: string;
  readonly is_active?: boolean;
}
