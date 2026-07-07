/**
 * Interface for User data structure
 */
export interface User {
  id: string | number;
  name: string;
  avatar: string;
  /** Department / secondary label shown under the name */
  country: string;
  /** Optional role emoji / flag shown inside the role badge */
  countryFlag: string;
  /** Free-form fallback text shown when no email/phone are provided */
  bio: string;
  /** Optional role label (e.g. admin, manager, staff) used for the colored badge */
  role?: string;
  /** Optional email displayed as an info row */
  email?: string;
  /** Optional phone number displayed as an info row */
  phone?: string;
  /** Optional active state – renders a green/grey status dot on the avatar */
  isActive?: boolean;
}

/**
 * Interface for menu options in the user card
 */
export interface UserCardMenuOption {
  label: string;
  action: string;
  isDanger?: boolean;
}

/**
 * Interface for user card action events
 */
export interface UserCardAction {
  userId: string | number;
  actionType: 'sendEmail' | 'editProfile' | 'menuOption';
  menuOption?: string;
}
