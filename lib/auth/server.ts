import { auth } from '@/lib/auth';
import { resolveUserContext } from '@/lib/auth/user-context';
import type {
  ProfileMetadata,
  ProfileRequirementSummary,
  ProfileStatus,
  ProfileRecord,
} from '@/lib/profiles';
import { headers } from 'next/headers';
import { cache } from 'react';
import type { Session } from './types';
import type { CanonicalRole, PermissionSet } from './roles';

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
};

export const getSession = cache(async () => {
  'use cache: private';
  return await auth.api.getSession({
    headers: await headers(),
  });
});

export const getAuthContext = cache(async (): Promise<AuthContext> => {
  'use cache: private';
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
  'use cache: private';
  const context = await getAuthContext();
  return context.user;
});
