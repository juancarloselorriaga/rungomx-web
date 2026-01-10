import { auth } from '@/lib/auth';
import { resolveUserContext } from '@/lib/auth/user-context';
import type { OrgMembership } from '@/lib/organizations/permissions';
import { ProfileMetadata } from '@/lib/profiles/metadata';
import { ProfileRequirementSummary } from '@/lib/profiles/requirements';
import { ProfileRecord, ProfileStatus } from '@/lib/profiles/types';
import { headers } from 'next/headers';
import { cache } from 'react';
import type { CanonicalRole, PermissionSet } from './roles';
import type { Session } from './types';

export type AuthContext = {
  session: Session | null;
  user: Session['user'] | null;
  canonicalRoles: CanonicalRole[];
  roles: string[];
  isInternal: boolean;
  permissions: PermissionSet;
  needsRoleAssignment: boolean;
  profileRequirements: ProfileRequirementSummary;
  profileMetadata: ProfileMetadata;
  profileStatus: ProfileStatus;
  profile: ProfileRecord | null;
  availableExternalRoles: CanonicalRole[];
  /** Organization memberships for the current user (lazy-loaded on demand) */
  organizationMemberships?: OrgMembership[];
};

export const getSession = cache(async () => {
  // Note: React cache() provides request-level memoization
  // Cannot use 'use cache: private' because we call headers() which is a dynamic API
  return await auth.api.getSession({
    headers: await headers(),
  });
});

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  // Note: React cache() provides request-level memoization
  // Cannot use 'use cache: private' because getSession() calls headers()
  const session = await getSession();

  if (!session?.user) {
    const resolved = await resolveUserContext(null);
    return {
      session: null,
      user: null,
      ...resolved,
    };
  }

  const projectedProfileStatus =
    (session.user as { profileStatus?: ProfileStatus | undefined }).profileStatus ?? null;
  const projectedRoles = (session as { roles?: string[] }).roles ?? [];
  const projectedCanonicalRoles =
    (session as { canonicalRoles?: CanonicalRole[] }).canonicalRoles ??
    (session.user as { canonicalRoles?: CanonicalRole[] }).canonicalRoles ??
    [];
  const projectedIsInternal =
    (session as { isInternal?: boolean }).isInternal ??
    (session.user as { isInternal?: boolean }).isInternal ??
    false;
  const projectedPermissions =
    (session as { permissions?: PermissionSet }).permissions ??
    (session.user as { permissions?: PermissionSet }).permissions ??
    null;
  const projectedRequirements =
    (session as { profileRequirements?: ProfileRequirementSummary }).profileRequirements ??
    (session.user as { profileRequirements?: ProfileRequirementSummary }).profileRequirements ??
    null;
  const projectedMetadata =
    (session as { profileMetadata?: ProfileMetadata }).profileMetadata ??
    (session.user as { profileMetadata?: ProfileMetadata }).profileMetadata ??
    null;
  const projectedNeedsRoleAssignment =
    (session as { needsRoleAssignment?: boolean }).needsRoleAssignment ??
    (session.user as { needsRoleAssignment?: boolean }).needsRoleAssignment ??
    false;
  const projectedProfile =
    (session as { profile?: ProfileRecord | null }).profile ??
    (session.user as { profile?: ProfileRecord | null }).profile ??
    null;
  const projectedAvailableExternalRoles =
    (session as { availableExternalRoles?: CanonicalRole[] }).availableExternalRoles ??
    (session.user as { availableExternalRoles?: CanonicalRole[] }).availableExternalRoles ??
    [];

  if (
    projectedProfileStatus &&
    projectedPermissions &&
    projectedRequirements &&
    projectedMetadata
  ) {
    return {
      session,
      user: session.user,
      roles: projectedRoles,
      canonicalRoles: projectedCanonicalRoles,
      isInternal: projectedIsInternal,
      permissions: projectedPermissions,
      needsRoleAssignment: projectedNeedsRoleAssignment,
      profileRequirements: projectedRequirements,
      profileMetadata: projectedMetadata,
      profileStatus: projectedProfileStatus,
      profile: projectedProfile,
      availableExternalRoles: projectedAvailableExternalRoles,
    };
  }

  const resolved = await resolveUserContext(session.user);

  return {
    session,
    user: session.user,
    ...resolved,
  };
});

export const getCurrentUser = cache(async () => {
  // Note: Uses React cache() for request-level memoization only
  // Cannot use 'use cache: private' because getAuthContext() calls headers()
  const context = await getAuthContext();
  return context.user;
});

/**
 * Get the current user's organization memberships.
 * This is a separate cached function to avoid loading memberships on every request.
 * Use this when you need to check organization-level permissions.
 *
 * @returns Array of organization memberships, or empty array if not authenticated
 */
export const getOrgMemberships = cache(async (): Promise<OrgMembership[]> => {
  // Note: Uses React cache() for request-level memoization only
  // Cannot use 'use cache: private' because getSession() calls headers()
  const session = await getSession();

  if (!session?.user?.id) {
    return [];
  }

  // Dynamic import to avoid circular dependencies
  const { getUserOrgMemberships } = await import('@/lib/organizations/permissions');
  return getUserOrgMemberships(session.user.id);
});

/**
 * Get the auth context with organization memberships populated.
 * Use this when you need both auth context and org memberships.
 *
 * @returns AuthContext with organizationMemberships populated
 */
export const getAuthContextWithOrgs = cache(async (): Promise<AuthContext> => {
  // Note: Uses React cache() for request-level memoization only
  // Cannot use 'use cache: private' because dependencies call headers()
  const [authContext, memberships] = await Promise.all([getAuthContext(), getOrgMemberships()]);

  return {
    ...authContext,
    organizationMemberships: memberships,
  };
});

// Re-export OrgMembership type for convenience
export type { OrgMembership } from '@/lib/organizations/permissions';
