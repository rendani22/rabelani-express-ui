import { HelpLink, HeaderNotification } from './header.models';
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
 * Default notifications displayed in the header
 */
export const DEFAULT_HELP_LINKS: readonly HelpLink[] = [
  { icon: 'documentation', text: 'Documentation', href: '#0' },
  { icon: 'support', text: 'Support Site', href: '#0' },
  { icon: 'contact', text: 'Contact us', href: '#0' },
] as const;



