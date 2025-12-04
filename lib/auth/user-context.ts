import { buildProfileMetadata, type ProfileMetadata } from '@/lib/profiles/metadata';
import { buildProfileRequirementSummary, type ProfileRequirementSummary } from '@/lib/profiles/requirements';
import { computeProfileStatus } from '@/lib/profiles/status';
import { type ProfileRecord, ProfileStatus } from '@/lib/profiles/types';
import { getProfileByUserId } from '@/lib/profiles/repository';
import { EMPTY_PROFILE_STATUS } from './constants';
import {
  getSelectableExternalRoles,
  getUserRolesWithInternalFlag,
  type CanonicalRole,
  type PermissionSet,
} from './roles';

export type BasicUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type ResolvedUserContext = {
  profile: ProfileRecord | null;
  profileRequirements: ProfileRequirementSummary;
  profileMetadata: ProfileMetadata;
  canonicalRoles: CanonicalRole[];
  roles: string[];
  isInternal: boolean;
  permissions: PermissionSet;
  needsRoleAssignment: boolean;
  availableExternalRoles: CanonicalRole[];
  profileStatus: ProfileStatus;
};

export async function resolveUserContext(
  user: BasicUser | null | undefined
): Promise<ResolvedUserContext> {
  if (!user) {
    return {
      profile: null,
      profileRequirements: buildProfileRequirementSummary([]),
      profileMetadata: buildProfileMetadata(buildProfileRequirementSummary([])),
      canonicalRoles: [],
      roles: [],
      isInternal: false,
      permissions: {
        canAccessAdminArea: false,
        canAccessUserArea: false,
        canManageUsers: false,
        canManageEvents: false,
        canViewStaffTools: false,
        canViewOrganizersDashboard: false,
        canViewAthleteDashboard: false,
      },
      needsRoleAssignment: false,
      availableExternalRoles: getSelectableExternalRoles(),
      profileStatus: EMPTY_PROFILE_STATUS,
    };
  }

  const roleLookup = await getUserRolesWithInternalFlag(user.id);
  const profile = await getProfileByUserId(user.id);
  const profileRequirements = buildProfileRequirementSummary(roleLookup.profileRequirementCategories);
  const profileMetadata = buildProfileMetadata(profileRequirements);
  const profileStatus = computeProfileStatus({
    profile,
    isInternal: roleLookup.isInternal,
    requirementCategories: profileRequirements.categories,
    requiredFieldKeys: profileRequirements.fieldKeys,
  });

  return {
    profile,
    profileRequirements,
    profileMetadata,
    canonicalRoles: roleLookup.canonicalRoles,
    roles: roleLookup.roles,
    isInternal: roleLookup.isInternal,
    permissions: roleLookup.permissions,
    needsRoleAssignment: roleLookup.needsRoleAssignment,
    availableExternalRoles: getSelectableExternalRoles(),
    profileStatus,
  };
}

export { EMPTY_PROFILE_STATUS };
