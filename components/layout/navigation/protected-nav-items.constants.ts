import type { PermissionSet } from '@/lib/auth/roles';
import type { NavItem, NavSection, ProtectedNavIconName } from './types';

/**
 * Build protected nav sections based on user permissions.
 * Events link visibility:
 * - External organizers: when they have organizer dashboard permission
 * - Internal staff: always visible if they have admin access (support access per Phase 0 plan)
 */
export function buildProtectedNavSections(
  permissions: PermissionSet,
): readonly NavSection<ProtectedNavIconName>[] {
  const items: NavItem<ProtectedNavIconName>[] = [
    {
      href: '/dashboard',
      labelKey: 'dashboard',
      iconName: 'LayoutDashboard',
    },
    ...(permissions.canAccessUserArea
      ? [
          {
            href: '/dashboard/my-registrations',
            labelKey: 'myRegistrations',
            iconName: 'FileText',
          } as const,
        ]
      : []),
    {
      href: '/settings/profile',
      labelKey: 'settings',
      iconName: 'Settings',
    },
  ];

  // Access gate: organizers and internal staff only.
  const canSeeEvents =
    permissions.canViewOrganizersDashboard ||
    permissions.canAccessAdminArea;
  if (canSeeEvents) {
    items.push({
      href: '/dashboard/events',
      labelKey: 'events',
      iconName: 'Calendar',
    });
    items.push({
      href: '/dashboard/organizations',
      labelKey: 'organizations',
      iconName: 'Users',
    });
  }

  return [
    {
      titleKey: 'sectionGeneral',
      items,
    },
  ];
}

export function buildProtectedNavItems(permissions: PermissionSet) {
  return buildProtectedNavSections(permissions).flatMap((section) => section.items);
}

// Legacy exports for backwards compatibility during migration
// TODO: Remove these once all consumers are updated
const defaultPermissions: PermissionSet = {
  canAccessAdminArea: false,
  canAccessUserArea: true,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: false,
};

export const protectedNavSections = buildProtectedNavSections(defaultPermissions);
export const protectedNavItems = buildProtectedNavItems(defaultPermissions);
