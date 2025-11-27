import type { NavItem, NavSection, ProtectedNavIconName } from './types';

const mainSectionItems = [
  {
    href: '/dashboard',
    labelKey: 'dashboard' as const,
    iconName: 'LayoutDashboard' as const,
  },
  {
    href: '/settings',
    labelKey: 'settings' as const,
    iconName: 'Settings' as const,
  },
  {
    href: '/profile',
    labelKey: 'profile' as const,
    iconName: 'User' as const,
  },
] as const satisfies readonly NavItem<ProtectedNavIconName>[];

export const protectedNavSections = [
  {
    titleKey: 'sectionGeneral',
    items: mainSectionItems,
  },
] as const satisfies readonly NavSection<ProtectedNavIconName>[];

export const protectedNavItems = protectedNavSections.flatMap((section) => section.items);
