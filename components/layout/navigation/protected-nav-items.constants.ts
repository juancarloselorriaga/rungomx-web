import type { PermissionSet } from '@/lib/auth/roles';
import { isEventsEnabled } from '@/lib/features/flags';
import type { NavItem, NavSection, ProtectedNavIconName } from './types';

/**
 * Build protected nav sections based on user permissions and feature flags.
 * Events link visibility follows Phase 0 gate:
 * - External organizers: only when feature flag is enabled AND have organizer dashboard permission
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
    {
      href: '/settings/profile',
      labelKey: 'profile',
      iconName: 'User',
    },
  ];

  // Phase 0 gate: organizers see Events only when flag enabled, internal staff with admin access always have access
  const canSeeEvents =
    (isEventsEnabled() && permissions.canViewOrganizersDashboard) ||
    permissions.canAccessAdminArea;
  if (canSeeEvents) {
    items.push({
      href: '/dashboard/events',
      labelKey: 'events',
      iconName: 'Calendar',
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
