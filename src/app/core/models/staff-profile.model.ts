/**
 * Staff role types
 */
export type StaffRole = 'admin' | 'manager' | 'staff' | 'viewer';

/**
 * Staff profile entity from the database
 */
export interface StaffProfile {
  readonly id: string;
  readonly user_id: string;
  readonly email: string;
  readonly full_name: string;
  readonly role: StaffRole;
  readonly is_active: boolean;
  readonly avatar_url?: string;
  readonly phone?: string;
  readonly department?: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * DTO for creating a new staff profile
 */
export interface CreateStaffProfileDto {
  readonly email: string;
  readonly password: string;
  readonly full_name: string;
  readonly role: StaffRole;
  readonly phone?: string;
  readonly department?: string;
  readonly avatar_url?: string;
}

/**
 * DTO for updating an existing staff profile
 */
export interface UpdateStaffProfileDto {
  readonly full_name?: string;
  readonly role?: StaffRole;
  readonly is_active?: boolean;
  readonly phone?: string;
  readonly department?: string;
  readonly avatar_url?: string;
}

