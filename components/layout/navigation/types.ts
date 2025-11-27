import { User } from '@/lib/auth/types';
import { Link } from '@/i18n/navigation';
import type { ComponentProps } from 'react';

import type navigationMessages from '@/messages/navigation/es.json';

type NavigationMessages = typeof navigationMessages;
export type NavigationMessageKey = keyof NavigationMessages;

type LinkHref = ComponentProps<typeof Link>['href'];

// Icon unions by context
export type PublicNavIconName =
  | 'Info'
  | 'Mail'
  | 'CircleHelp'
  | 'Trophy'
  | 'Calendar'
  | 'Newspaper';

export type ProtectedNavIconName =
  | 'LayoutDashboard'
  | 'Settings'
  | 'User'
  | 'Users'
  | 'FileText';

export type NavIconName = PublicNavIconName | ProtectedNavIconName;

export interface NavItem<TIcon extends NavIconName = NavIconName> {
  href: LinkHref;
  labelKey: NavigationMessageKey;
  iconName: TIcon;
}

export interface NavSection<TIcon extends NavIconName = NavIconName> {
  titleKey?: NavigationMessageKey;
  items: readonly NavItem<TIcon>[];
}

export interface NavigationDrawerContentProps {
  user: User | null;
  items: readonly NavItem[];
}
