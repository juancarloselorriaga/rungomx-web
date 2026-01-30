import { Link } from '@/i18n/navigation';
import { User } from '@/lib/auth/types';

import type navigationMessages from '@/messages/navigation/es.json';
import type { ComponentProps } from 'react';

type NavigationMessages = typeof navigationMessages;
type NavigationStringKey = {
  [K in keyof NavigationMessages]: NavigationMessages[K] extends string ? K : never;
}[keyof NavigationMessages];
export type NavigationMessageKey = NavigationStringKey;

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
  | 'FileText'
  | 'Calendar';

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
  user?: User | null;
  isPro?: boolean;
  items: readonly NavItem[];
}
