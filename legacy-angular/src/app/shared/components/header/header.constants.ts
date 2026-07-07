import { HelpLink } from './header.models';

/**
 * Default help links displayed in the info dropdown
 */
export const DEFAULT_HELP_LINKS: readonly HelpLink[] = [
  { icon: 'documentation', text: 'Documentation', href: '#docs' },
  { icon: 'contact', text: 'Contact us', href: 'mailto:rendanig.mulaudzi@gmail.com' },
] as const;

