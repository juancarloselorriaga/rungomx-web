import { ProfileRecord, ProfileStatus } from '@/lib/profiles/types';
import type { ProfileRequirementCategory, ProfileRequirementSummary } from './requirements';
import { buildProfileRequirementSummary, FALLBACK_PROFILE_FIELDS } from './requirements';

const isPresent = (value: unknown) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  return true;
};

export type ComputeProfileStatusParams = {
  profile: ProfileRecord | null | undefined;
  isInternal?: boolean;
  requirementCategories?: ProfileRequirementCategory[];
  requiredFieldKeys?: (keyof ProfileRecord)[];
};

export function computeProfileStatus({
  profile,
  isInternal = false,
  requirementCategories,
  requiredFieldKeys,
}: ComputeProfileStatusParams): ProfileStatus {
  const hasProfile = Boolean(profile);
  const requirementSummary: ProfileRequirementSummary | null = requirementCategories
    ? buildProfileRequirementSummary(requirementCategories)
    : null;
  const requiredFields =
    requiredFieldKeys && requiredFieldKeys.length > 0
      ? requiredFieldKeys
      : (requirementSummary?.fieldKeys ?? FALLBACK_PROFILE_FIELDS);
  const isComplete =
    hasProfile &&
    requiredFields.every((field) => {
      const value = profile?.[field];
      return isPresent(value);
    });

  return {
    hasProfile,
    isComplete,
    mustCompleteProfile: !isInternal && !isComplete,
  };
}
