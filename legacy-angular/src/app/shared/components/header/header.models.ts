/**
 * Header component models and type definitions
 */


/**
 * Icon types available for help links
 */
export type HelpLinkIcon = 'documentation' | 'contact';

/**
 * Help link item displayed in the info dropdown
 */
export interface HelpLink {
  readonly icon: HelpLinkIcon;
  readonly text: string;
  readonly href: string;
}


/**
 * Dropdown types for state management
 */
export type DropdownType = 'notifications' | 'info' | 'user';

/**
 * State interface for header dropdowns
 */
export interface HeaderDropdownState {
  readonly notifications: boolean;
  readonly info: boolean;
  readonly user: boolean;
}

/**
 * Default state for header dropdowns
 */
export const INITIAL_DROPDOWN_STATE: HeaderDropdownState = {
  notifications: false,
  info: false,
  user: false,
} as const;

/**
 * Configuration for avatar generation
 */
export interface AvatarConfig {
  readonly name: string;
  readonly background: string;
  readonly color: string;
  readonly size: number;
}

/**
 * Default values for avatar configuration
 */
export const DEFAULT_AVATAR_CONFIG: Readonly<Omit<AvatarConfig, 'name'>> = {
  background: '6366f1',
  color: 'fff',
  size: 32,
} as const;

/**
 * Guest user avatar configuration
 */
export const GUEST_AVATAR_CONFIG: Readonly<AvatarConfig> = {
  name: 'Guest',
  background: '94a3b8',
  color: 'fff',
  size: 32,
} as const;

