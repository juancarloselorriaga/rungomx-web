import type { ProfileRequirementSummary } from './requirements';

export const SHIRT_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl'] as const;

export type ShirtSize = (typeof SHIRT_SIZES)[number];

export type ProfileMetadata = {
  shirtSizes: readonly ShirtSize[];
  requiredCategories: ProfileRequirementSummary['categories'];
  requiredFieldKeys: ProfileRequirementSummary['fieldKeys'];
};

export function buildProfileMetadata(
  summary: ProfileRequirementSummary
): ProfileMetadata {
  return {
    shirtSizes: SHIRT_SIZES,
    requiredCategories: summary.categories,
    requiredFieldKeys: summary.fieldKeys,
  };
}
