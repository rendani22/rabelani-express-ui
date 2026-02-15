/**
 * Interface representing a navigation item in the sidebar.
 */
export interface NavItem {
  /** Icon identifier for the navigation item */
  icon: string;

  /** Display label for the navigation item */
  label: string;

  /** Whether the navigation item is currently active */
  active?: boolean;

  /** Optional router link for navigation */
  routerLink?: string;

  /** Optional click handler for the navigation item */
  onClick?: () => void;
}

