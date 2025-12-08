import type { PermissionSet } from '@/lib/auth/roles';
import type { NavItem, NavSection, ProtectedNavIconName } from './types';

export function buildAdminNavSections(
  permissions: PermissionSet
): readonly NavSection<ProtectedNavIconName>[] {
  const items: NavItem<ProtectedNavIconName>[] = [
    {
      href: '/admin',
      labelKey: 'adminDashboard',
      iconName: 'LayoutDashboard',
    },
    {
      href: '/admin/account',
      labelKey: 'account',
      iconName: 'User',
    },
  ];

  if (permissions.canManageUsers) {
    items.push({
      href: '/admin/users',
      labelKey: 'adminUsers',
      iconName: 'Users',
    });
  }

  if (permissions.canViewStaffTools || permissions.canManageEvents) {
    items.push({
      href: '/admin/tools',
      labelKey: 'staffTools',
      iconName: 'FileText',
    });
  }

  return [
    {
      titleKey: 'sectionGeneral',
      items,
    },
  ];
}

export function buildAdminNavItems(permissions: PermissionSet) {
  return buildAdminNavSections(permissions).flatMap((section) => section.items);
}
