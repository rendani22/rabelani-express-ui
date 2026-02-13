import { HelpLink, HeaderNotification, RecentPage, RecentSearch, UserMenuItem } from './header.models';

/**
 * Default recent searches displayed in the search modal
 */
export const DEFAULT_RECENT_SEARCHES: readonly RecentSearch[] = [
  { text: 'Form Builder - 23 hours on-demand video', href: '#0' },
  { text: 'Access Mosaic on mobile and TV', href: '#0' },
  { text: 'Product Update - Q4 2024', href: '#0' },
  { text: 'Master Digital Marketing Strategy course', href: '#0' },
  { text: 'Dedicated forms for products', href: '#0' },
  { text: 'Product Update - Q4 2024', href: '#0' },
] as const;

/**
 * Default recent pages displayed in the search modal
 */
export const DEFAULT_RECENT_PAGES: readonly RecentPage[] = [
  { title: 'Messages', subtitle: 'Conversation / … / Mike Mills', href: '#0' },
  { title: 'Messages', subtitle: 'Conversation / … / Eva Patrick', href: '#0' },
] as const;

/**
 * Default notifications displayed in the header
 */
export const DEFAULT_NOTIFICATIONS: readonly HeaderNotification[] = [
  {
    emoji: '📣',
    title: 'Edit your information in a swipe',
    description: 'Sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim.',
    date: 'Feb 12, 2024',
    href: '#0',
  },
  {
    emoji: '📣',
    title: 'Edit your information in a swipe',
    description: 'Sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim.',
    date: 'Feb 9, 2024',
    href: '#0',
  },
  {
    emoji: '🚀',
    title: 'Say goodbye to paper receipts!',
    description: 'Sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim.',
    date: 'Jan 24, 2024',
    href: '#0',
  },
] as const;

/**
 * Default help links displayed in the info dropdown
 */
export const DEFAULT_HELP_LINKS: readonly HelpLink[] = [
  { icon: 'documentation', text: 'Documentation', href: '#0' },
  { icon: 'support', text: 'Support Site', href: '#0' },
  { icon: 'contact', text: 'Contact us', href: '#0' },
] as const;

/**
 * Default user menu items
 */
export const DEFAULT_USER_MENU_ITEMS: readonly UserMenuItem[] = [
  { text: 'Settings', href: '#/settings' },
  { text: 'Sign Out', href: '#/logout' },
] as const;

/**
 * User role default value
 */
export const DEFAULT_USER_ROLE = 'User' as const;

