/**
 * Header component models and type definitions
 */

/**
 * Recent search item displayed in the search modal
 */
export interface RecentSearch {
  readonly text: string;
  readonly href: string;
}

/**
 * Recent page item displayed in the search modal
 */
export interface RecentPage {
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
}

/**
 * Notification item displayed in the notifications dropdown
 */
export interface HeaderNotification {
  readonly emoji: string;
  readonly title: string;
  readonly description: string;
  readonly date: string;
  readonly href: string;
}

/**
 * Icon types available for help links
 */
export type HelpLinkIcon = 'documentation' | 'support' | 'contact';

/**
 * Help link item displayed in the info dropdown
 */
export interface HelpLink {
  readonly icon: HelpLinkIcon;
  readonly text: string;
  readonly href: string;
}

/**
 * User menu item displayed in the user dropdown
 */
export interface UserMenuItem {
  readonly text: string;
  readonly href: string;
}

/**
 * User menu action identifiers
 */
export type UserMenuAction = 'settings' | 'sign-out';

/**
 * Dropdown types for state management
 */
export type DropdownType = 'notifications' | 'info' | 'user' | 'search';

/**
 * State interface for header dropdowns
 */
export interface HeaderDropdownState {
  readonly search: boolean;
  readonly notifications: boolean;
  readonly info: boolean;
  readonly user: boolean;
}

/**
 * Default state for header dropdowns
 */
export const INITIAL_DROPDOWN_STATE: HeaderDropdownState = {
  search: false,
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

