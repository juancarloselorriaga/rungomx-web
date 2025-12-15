import type { ProfileRecord } from './types';

export const PROFILE_REQUIREMENT_CATEGORIES = [
  'basicContact',
  'emergencyContact',
  'demographics',
  'physicalAttributes',
] as const;

export type ProfileRequirementCategory = (typeof PROFILE_REQUIREMENT_CATEGORIES)[number];

const BASE_REQUIRED_FIELDS: (keyof ProfileRecord)[] = [
  'phone',
  'city',
  'state',
  'dateOfBirth',
  'emergencyContactName',
  'emergencyContactPhone',
];

const CATEGORY_FIELD_MAP: Record<ProfileRequirementCategory, (keyof ProfileRecord)[]> = {
  basicContact: ['phone', 'city', 'state'],
  emergencyContact: ['emergencyContactName', 'emergencyContactPhone'],
  demographics: ['dateOfBirth'],
  physicalAttributes: ['shirtSize'],
};

const dedupe = <T>(items: Iterable<T> | null | undefined): T[] => {
  const seen = new Set<T>();
  if (!items) return [];

  for (const item of items) {
    if (item === undefined || item === null) continue;
    seen.add(item);
  }
  return Array.from(seen);
};

export type ProfileRequirementSummary = {
  categories: ProfileRequirementCategory[];
  fieldKeys: (keyof ProfileRecord)[];
};

function expandCategories(categories: ProfileRequirementCategory[]): (keyof ProfileRecord)[] {
  if (categories.length === 0) return BASE_REQUIRED_FIELDS;

  const fieldSets = categories.map((category) => CATEGORY_FIELD_MAP[category] ?? []);
  return dedupe(fieldSets.flat());
}

export function buildProfileRequirementSummary(
  categories: ProfileRequirementCategory[] | null | undefined,
): ProfileRequirementSummary {
  const normalizedCategories = dedupe(categories ?? []);
  const fieldKeys = expandCategories(normalizedCategories);

  return {
    categories: normalizedCategories.length > 0 ? normalizedCategories : [],
    fieldKeys,
  };
}

export const FALLBACK_PROFILE_FIELDS = BASE_REQUIRED_FIELDS;
