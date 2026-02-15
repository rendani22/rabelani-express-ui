/**
 * Interface for User data structure
 */
export interface User {
  id: string | number;
  name: string;
  avatar: string;
  country: string;
  countryFlag: string;
  bio: string;
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

