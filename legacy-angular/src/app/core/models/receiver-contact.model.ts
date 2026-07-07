/**
 * Alternative contact person attached to a receiver profile.
 * Stored in the `receiver_contacts` table.
 */
export interface ReceiverContact {
  readonly id: string;
  readonly receiver_id: string;
  readonly name: string;
  readonly phone: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * DTO for creating a new alternative contact.
 */
export interface CreateReceiverContactDto {
  readonly receiver_id: string;
  readonly name: string;
  readonly phone: string;
}

/**
 * DTO for updating an existing alternative contact.
 */
export interface UpdateReceiverContactDto {
  readonly name?: string;
  readonly phone?: string;
}

