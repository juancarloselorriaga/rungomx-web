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
export { buildProfileMetadata, SHIRT_SIZES, type ShirtSize, type ProfileMetadata } from './metadata';
export type {
  ProfileInput,
  ProfileRecord,
  ProfileStatus,
  ProfileUpsertInput,
} from './types';
