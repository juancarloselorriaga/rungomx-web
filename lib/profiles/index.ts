export { profileSchema, profileUpsertSchema } from './schema';
export { getProfileByUserId, upsertProfile } from './repository';
export { computeProfileStatus } from './status';
export {
  buildProfileRequirementSummary,
  PROFILE_REQUIREMENT_CATEGORIES,
  type ProfileRequirementCategory,
  type ProfileRequirementSummary,
  FALLBACK_PROFILE_FIELDS,
} from './requirements';
export {
  buildProfileMetadata,
  getAllowedCountries,
  SHIRT_SIZES,
  BLOOD_TYPES,
  type ShirtSize,
  type BloodType,
  type CountryCode,
  type ProfileMetadata,
} from './metadata';
export type { ProfileInput, ProfileRecord, ProfileStatus, ProfileUpsertInput } from './types';
