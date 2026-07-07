/**
 * Receiver profile entity from the receiver_profiles table
 */
export interface ReceiverProfile {
  readonly id: string;
  readonly name: string;
  readonly surname: string;
  readonly email: string;
  readonly phone?: string;
  readonly is_active: boolean;
  readonly created_at: string;
  readonly updated_at: string;
  readonly created_by?: string;
}

/**
 * DTO for creating a new receiver profile
 */
export interface CreateReceiverProfileDto {
  readonly name: string;
  readonly surname: string;
  readonly email: string;
  readonly phone?: string;
}

/**
 * DTO for updating an existing receiver profile
 */
export interface UpdateReceiverProfileDto {
  readonly name?: string;
  readonly surname?: string;
  readonly email?: string;
  readonly phone?: string;
  readonly is_active?: boolean;
}
