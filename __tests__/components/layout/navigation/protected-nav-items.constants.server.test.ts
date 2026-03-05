import { buildProtectedNavItems } from '@/components/layout/navigation/protected-nav-items.constants';
import type { PermissionSet } from '@/lib/auth/roles';

const basePermissions: PermissionSet = {
  canAccessAdminArea: false,
  canAccessUserArea: true,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: false,
};

describe('buildProtectedNavItems', () => {
  it('includes organizer payments entry for organizer-facing users', () => {
    const items = buildProtectedNavItems({
      ...basePermissions,
      canViewOrganizersDashboard: true,
    });

    expect(items.some((item) => item.href === '/dashboard/payments')).toBe(true);
  });

  it('includes organizer payments entry for internal staff with events permissions', () => {
    const items = buildProtectedNavItems({
      ...basePermissions,
      canManageEvents: true,
    });

    expect(items.some((item) => item.href === '/dashboard/payments')).toBe(true);
  });

  it('does not include organizer payments entry for users without organizer access', () => {
    const items = buildProtectedNavItems(basePermissions);

    expect(items.some((item) => item.href === '/dashboard/payments')).toBe(false);
  });
});
