import type { NavItem, PublicNavIconName } from './types';

export const publicNavItems = [
  {
    href: '/events',
    labelKey: 'events' as const,
    iconName: 'Calendar' as const,
  },
  {
    href: '/results',
    labelKey: 'results' as const,
    iconName: 'Medal' as const,
  },
  {
    href: '/rankings',
    labelKey: 'rankings' as const,
    iconName: 'Trophy' as const,
  },
  {
    href: '/about',
    labelKey: 'about' as const,
    iconName: 'Info' as const,
  },
  {
    href: '/help',
    labelKey: 'help' as const,
    iconName: 'CircleHelp' as const,
    emphasis: 'secondary' as const,
  },
  {
    href: '/contact',
    labelKey: 'contact' as const,
    iconName: 'Mail' as const,
    emphasis: 'secondary' as const,
  },
] as const satisfies readonly NavItem<PublicNavIconName>[];
