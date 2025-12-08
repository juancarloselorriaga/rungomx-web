import ProtectedLayout from '@/app/[locale]/(protected)/layout';
import AdminLayout from '@/app/[locale]/(admin)/admin/layout';
import { getAuthContext, type AuthContext } from '@/lib/auth/server';
import type { Session } from '@/lib/auth/types';
import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import { buildProfileMetadata } from '@/lib/profiles/metadata';
import type { ProfileStatus } from '@/lib/profiles/types';
import { redirect } from 'next/navigation';
import React from 'react';

jest.mock('@/components/layout/navigation/nav-bar', () => function MockNavBar() {
  return <div>NavBar</div>;
});
jest.mock('@/components/layout/navigation/sidebar', () => function MockSidebar() {
  return <div>Sidebar</div>;
});
jest.mock('@/components/layout/navigation/nav-drawer-context', () => ({
  NavDrawerProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  MobileNavPushLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/protected-layout-wrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/layout/admin-layout-wrapper', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/settings/settings-shell', () => ({
  SettingsShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock('@/components/settings/sections', () => ({
  buildSettingsSections: () => [],
}));
jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));
jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;
const buildParams = (locale: 'en' | 'es' = 'en') =>
  Promise.resolve({ locale } as { locale: 'en' | 'es' });

describe('Settings Route Protection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('redirects unauthenticated users to sign-in for profile and account pages', async () => {
    const basePermissions: import('@/lib/auth/roles').PermissionSet = {
      canAccessAdminArea: false,
      canAccessUserArea: false,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: false,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };

    const profileRequirements = buildProfileRequirementSummary([]);
    const profileMetadata = buildProfileMetadata(profileRequirements);
    const profileStatus: ProfileStatus = {
      hasProfile: false,
      isComplete: false,
      mustCompleteProfile: false,
    };

    mockGetAuthContext.mockResolvedValue({
      session: null,
      user: null,
      roles: [],
      canonicalRoles: [],
      isInternal: false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profileStatus,
      profile: null,
      availableExternalRoles: [],
    });

    await expect(
      ProtectedLayout({ children: <div />, params: buildParams('en') })
    ).rejects.toThrow('REDIRECT:/en/sign-in');

    await expect(
      ProtectedLayout({ children: <div />, params: buildParams('en') })
    ).rejects.toThrow('REDIRECT:/en/sign-in');
  });

  it('redirects internal users accessing settings to the admin area', async () => {
    const basePermissions: import('@/lib/auth/roles').PermissionSet = {
      canAccessAdminArea: false,
      canAccessUserArea: false,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: false,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };

    const profileRequirements = buildProfileRequirementSummary([]);
    const profileMetadata = buildProfileMetadata(profileRequirements);
    const profileStatus: ProfileStatus = {
      hasProfile: false,
      isComplete: false,
      mustCompleteProfile: false,
    };

    const session = {
      session: {
        id: 'sess-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      roles: [] as string[],
      canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      isInternal: true,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profile: null,
      availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'User One',
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isInternal: true,
        canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
        permissions: basePermissions,
        needsRoleAssignment: false,
        profileRequirements,
        profileMetadata,
        profileStatus,
        profile: null,
        availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      },
    } as unknown as Session;

    const context: AuthContext = {
      session,
      user: session.user,
      roles: session.roles ?? [],
      canonicalRoles: session.canonicalRoles ?? [],
      isInternal: session.isInternal ?? true,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profileStatus,
      profile: null,
      availableExternalRoles: [],
    };

    mockGetAuthContext.mockResolvedValue(context);

    await expect(
      ProtectedLayout({ children: <div />, params: buildParams('es') })
    ).rejects.toThrow('REDIRECT:/es/admin');
  });

  it('redirects external users away from admin routes', async () => {
    const basePermissions: import('@/lib/auth/roles').PermissionSet = {
      canAccessAdminArea: false,
      canAccessUserArea: false,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: false,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };

    const profileRequirements = buildProfileRequirementSummary([]);
    const profileMetadata = buildProfileMetadata(profileRequirements);
    const profileStatus: ProfileStatus = {
      hasProfile: false,
      isComplete: false,
      mustCompleteProfile: false,
    };

    const session = {
      session: {
        id: 'sess-2',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      roles: [] as string[],
      canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      isInternal: false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profile: null,
      availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'User One',
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isInternal: false,
        canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
        permissions: basePermissions,
        needsRoleAssignment: false,
        profileRequirements,
        profileMetadata,
        profileStatus,
        profile: null,
        availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      },
    } as unknown as Session;

    const context: AuthContext = {
      session,
      user: session.user,
      roles: session.roles ?? [],
      canonicalRoles: session.canonicalRoles ?? [],
      isInternal: session.isInternal ?? false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profileStatus,
      profile: null,
      availableExternalRoles: [],
    };

    mockGetAuthContext.mockResolvedValue(context);

    await expect(
      AdminLayout({ children: <div />, params: buildParams('en') })
    ).rejects.toThrow('REDIRECT:/en/dashboard');
  });

  it('allows authenticated external users to access settings', async () => {
    const basePermissions: import('@/lib/auth/roles').PermissionSet = {
      canAccessAdminArea: false,
      canAccessUserArea: true,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: false,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };

    const profileRequirements = buildProfileRequirementSummary([]);
    const profileMetadata = buildProfileMetadata(profileRequirements);
    const profileStatus: ProfileStatus = {
      hasProfile: false,
      isComplete: false,
      mustCompleteProfile: false,
    };

    const session = {
      session: {
        id: 'sess-3',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      roles: [] as string[],
      canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      isInternal: false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profile: null,
      availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'User One',
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isInternal: false,
        canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
        permissions: basePermissions,
        needsRoleAssignment: false,
        profileRequirements,
        profileMetadata,
        profileStatus,
        profile: null,
        availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      },
    } as unknown as Session;

    const context: AuthContext = {
      session,
      user: session.user,
      roles: session.roles ?? [],
      canonicalRoles: session.canonicalRoles ?? [],
      isInternal: session.isInternal ?? false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profileStatus,
      profile: null,
      availableExternalRoles: [],
    };

    mockGetAuthContext.mockResolvedValue(context);

    await expect(
      ProtectedLayout({ children: <div>settings</div>, params: buildParams('en') })
    ).resolves.toEqual(expect.anything());
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('allows internal admins to access admin account pages', async () => {
    const basePermissions: import('@/lib/auth/roles').PermissionSet = {
      canAccessAdminArea: true,
      canAccessUserArea: false,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: false,
      canViewOrganizersDashboard: false,
      canViewAthleteDashboard: false,
    };

    const profileRequirements = buildProfileRequirementSummary([]);
    const profileMetadata = buildProfileMetadata(profileRequirements);
    const profileStatus: ProfileStatus = {
      hasProfile: false,
      isComplete: false,
      mustCompleteProfile: false,
    };

    const session = {
      session: {
        id: 'sess-4',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      },
      roles: [] as string[],
      canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      isInternal: true,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profile: null,
      availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'User One',
        createdAt: new Date(),
        updatedAt: new Date(),
        emailVerified: true,
        isInternal: true,
        canonicalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
        permissions: basePermissions,
        needsRoleAssignment: false,
        profileRequirements,
        profileMetadata,
        profileStatus,
        profile: null,
        availableExternalRoles: [] as import('@/lib/auth/roles').CanonicalRole[],
      },
    } as unknown as Session;

    const context: AuthContext = {
      session,
      user: session.user,
      roles: session.roles ?? [],
      canonicalRoles: session.canonicalRoles ?? [],
      isInternal: session.isInternal ?? true,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements,
      profileMetadata,
      profileStatus,
      profile: null,
      availableExternalRoles: [],
    };

    mockGetAuthContext.mockResolvedValue(context);

    await expect(
      AdminLayout({ children: <div>admin</div>, params: buildParams('en') })
    ).resolves.toEqual(expect.anything());
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
