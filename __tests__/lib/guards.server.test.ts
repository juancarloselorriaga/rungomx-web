jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

import { requireProfileCompleteUser, UnauthenticatedError } from '@/lib/auth/guards';
import type { PermissionSet } from '@/lib/auth/roles';
import type { AuthContext } from '@/lib/auth/server';
import { getAuthContext } from '@/lib/auth/server';
import type { Session } from '@/lib/auth/types';
import { buildProfileMetadata } from '@/lib/profiles/metadata';
import { buildProfileRequirementSummary } from '@/lib/profiles/requirements';
import type { ProfileStatus } from '@/lib/profiles/types';

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;

describe('requireProfileCompleteUser', () => {
  const baseRequirements = buildProfileRequirementSummary([]);
  const baseMetadata = buildProfileMetadata(baseRequirements);
  const basePermissions: PermissionSet = {
    canAccessAdminArea: false,
    canAccessUserArea: true,
    canManageUsers: false,
    canManageEvents: false,
    canViewStaffTools: false,
    canViewOrganizersDashboard: false,
    canViewAthleteDashboard: false,
  };

  beforeEach(() => {
    mockGetAuthContext.mockReset();
  });

  it('throws when unauthenticated', async () => {
    mockGetAuthContext.mockResolvedValue({
      session: null,
      user: null,
      roles: [],
      canonicalRoles: [],
      isInternal: false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      profileStatus: {
        hasProfile: false,
        isComplete: false,
        mustCompleteProfile: true,
      },
    });

    await expect(requireProfileCompleteUser()).rejects.toBeInstanceOf(UnauthenticatedError);
  });

  it('throws ProfileIncompleteError when enforcement is required', async () => {
    const status: ProfileStatus = {
      hasProfile: true,
      isComplete: false,
      mustCompleteProfile: true,
    };

    const session = {
      session: {
        id: 'sess-1',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-1',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '1.1.1.1',
        userAgent: 'jest',
      },
      roles: [],
      canonicalRoles: [],
      isInternal: false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      user: {
        id: 'user-1',
        email: 'u@example.com',
        name: 'User One',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        isInternal: false,
        canonicalRoles: [],
        permissions: basePermissions,
        needsRoleAssignment: false,
        profileRequirements: baseRequirements,
        profileMetadata: baseMetadata,
        profile: null,
        availableExternalRoles: [],
        profileStatus: status,
      },
    } as unknown as Session;

    mockGetAuthContext.mockResolvedValue({
      session,
      user: session.user,
      roles: session.roles ?? [],
      canonicalRoles: session.canonicalRoles ?? [],
      isInternal: session.isInternal ?? false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      profileStatus: status,
    });

    await expect(requireProfileCompleteUser()).rejects.toMatchObject({
      code: 'PROFILE_INCOMPLETE',
      profileStatus: status,
    });
  });

  it('returns context when internal', async () => {
    const session = {
      session: {
        id: 'sess-2',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-2',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '1.1.1.1',
        userAgent: 'jest',
      },
      roles: ['admin'],
      canonicalRoles: ['internal.admin'],
      isInternal: true,
      permissions: {
        ...basePermissions,
        canAccessAdminArea: true,
        canAccessUserArea: false,
      },
      needsRoleAssignment: false,
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      user: {
        id: 'user-2',
        email: 'i@example.com',
        name: 'Internal User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        isInternal: true,
        canonicalRoles: ['internal.admin'],
        permissions: {
          ...basePermissions,
          canAccessAdminArea: true,
          canAccessUserArea: false,
        },
        needsRoleAssignment: false,
        profileRequirements: baseRequirements,
        profileMetadata: baseMetadata,
        profile: null,
        availableExternalRoles: [],
        profileStatus: {
          hasProfile: false,
          isComplete: false,
          mustCompleteProfile: true,
        },
      },
    } as unknown as Session;

    const context: AuthContext = {
      session,
      user: session.user,
      roles: session.roles ?? [],
      canonicalRoles: session.canonicalRoles ?? [],
      isInternal: session.isInternal ?? false,
      permissions: {
        ...basePermissions,
        canAccessAdminArea: true,
        canAccessUserArea: false,
      },
      needsRoleAssignment: false,
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      profileStatus: session.user.profileStatus,
    };

    mockGetAuthContext.mockResolvedValue(context);

    await expect(requireProfileCompleteUser()).resolves.toEqual(context);
  });

  it('returns context when profile is complete', async () => {
    const session = {
      session: {
        id: 'sess-3',
        createdAt: new Date(),
        updatedAt: new Date(),
        userId: 'user-3',
        expiresAt: new Date(),
        token: 'token',
        ipAddress: '1.1.1.1',
        userAgent: 'jest',
      },
      roles: [],
      canonicalRoles: [],
      isInternal: false,
      permissions: basePermissions,
      needsRoleAssignment: false,
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      user: {
        id: 'user-3',
        email: 'c@example.com',
        name: 'Complete User',
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        isInternal: false,
        canonicalRoles: [],
        permissions: basePermissions,
        needsRoleAssignment: false,
        profileRequirements: baseRequirements,
        profileMetadata: baseMetadata,
        profile: null,
        availableExternalRoles: [],
        profileStatus: {
          hasProfile: true,
          isComplete: true,
          mustCompleteProfile: false,
        },
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
      profileRequirements: baseRequirements,
      profileMetadata: baseMetadata,
      profile: null,
      availableExternalRoles: [],
      profileStatus: session.user.profileStatus,
    };

    mockGetAuthContext.mockResolvedValue(context);

    await expect(requireProfileCompleteUser()).resolves.toEqual(context);
  });
});
