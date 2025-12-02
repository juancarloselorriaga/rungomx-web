import { computeProfileStatus, getProfileByUserId } from '@/lib/profiles';
import type { ProfileStatus } from '@/lib/profiles';
import { EMPTY_PROFILE_STATUS } from './constants';
import { getUserRolesWithInternalFlag } from './roles';

export type BasicUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

export type ResolvedUserContext = {
  roles: string[];
  isInternal: boolean;
  profileStatus: ProfileStatus;
};

export async function resolveUserContext(
  user: BasicUser | null | undefined
): Promise<ResolvedUserContext> {
  if (!user) {
    return {
      roles: [],
      isInternal: false,
      profileStatus: EMPTY_PROFILE_STATUS,
    };
  }

  const { roles, isInternal } = await getUserRolesWithInternalFlag(user.id);
  const profile = await getProfileByUserId(user.id);
  const profileStatus = computeProfileStatus({ profile, isInternal });

  return {
    roles,
    isInternal,
    profileStatus,
  };
}

export { EMPTY_PROFILE_STATUS };
