import type { ProfileRequirementSummary } from './requirements';

export const SHIRT_SIZES = ['xs', 's', 'm', 'l', 'xl', 'xxl'] as const;

export type ShirtSize = (typeof SHIRT_SIZES)[number];

export const BLOOD_TYPES = ['a+', 'a-', 'b+', 'b-', 'ab+', 'ab-', 'o+', 'o-'] as const;

export type BloodType = (typeof BLOOD_TYPES)[number];

export const GENDER_CODES = [
  'female',
  'male',
  'non_binary',
  'prefer_not_to_say',
  'self_described',
] as const;

export type GenderCode = (typeof GENDER_CODES)[number];

export type ProfileMetadata = {
  shirtSizes: readonly ShirtSize[];
  bloodTypes: readonly BloodType[];
  genderOptions: readonly GenderCode[];
  requiredCategories: ProfileRequirementSummary['categories'];
  requiredFieldKeys: ProfileRequirementSummary['fieldKeys'];
};

export function buildProfileMetadata(
  summary: ProfileRequirementSummary
): ProfileMetadata {
  return {
    shirtSizes: SHIRT_SIZES,
    bloodTypes: BLOOD_TYPES,
    genderOptions: GENDER_CODES,
    requiredCategories: summary.categories,
    requiredFieldKeys: summary.fieldKeys,
  };
}
