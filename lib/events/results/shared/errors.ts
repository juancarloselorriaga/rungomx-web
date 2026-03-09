const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';

export const LINKED_USER_NOT_FOUND_ERROR = 'Linked user not found';
export const LINK_CONFLICT_ERROR =
  'Result entry is already linked to a different user. Resolve conflict before reassigning.';
export const RESULT_ENTRY_CLAIMS_ENTRY_UNIQUE_IDX = 'result_entry_claims_entry_unique_idx';
export const RESULT_INGESTION_SESSIONS_VERSION_UNIQUE_IDX =
  'result_ingestion_sessions_version_unique_idx';
export const AUDIT_LOG_FAILURE_PREFIX = 'AUDIT_LOG_FAILED:';
export const CLAIM_ALREADY_LINKED_ERROR = 'This result is already linked to another account.';
export const CLAIM_NOT_ELIGIBLE_ERROR = 'Selected result is not eligible for claiming.';
export const CLAIM_NOT_REVIEWABLE_ERROR = 'Claim is no longer reviewable.';
export const CLAIM_LINKED_MESSAGE =
  'Claim confirmed. Your result is now linked to your profile history.';
export const CLAIM_PENDING_REVIEW_MESSAGE =
  'Claim needs organizer review before it can be linked. No ownership was assigned yet.';
export const RESULT_CORRECTION_FORBIDDEN_ERROR =
  'You can only request corrections for results linked to your account.';
export const RESULT_CORRECTION_SUBMISSION_FORBIDDEN_ERROR =
  'Only the linked runner or an eligible organizer can submit a correction request for this result.';
export const RESULT_CORRECTION_REVIEW_FORBIDDEN_ERROR =
  'Only eligible organizers for this event can approve or reject correction requests.';
export const RESULT_CORRECTION_INVALID_STATE_ERROR =
  'Corrections can only be requested for official or corrected result versions.';
export const CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR = 'Correction request is no longer reviewable.';
export const CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR =
  'Correction request is not approved for publication.';
export const CORRECTION_REQUEST_ALREADY_PUBLISHED_ERROR =
  'Correction request is already published as a corrected version.';
export const CORRECTION_PUBLICATION_PATCH_REQUIRED_ERROR =
  'Correction request is missing a valid correction patch payload.';
export const CORRECTION_PUBLICATION_FAILED_ERROR =
  'Correction publication failed. Request remains approved for retry.';
export const OFFICIAL_IMMUTABLE_MUTATION_ERROR =
  'Official versions are immutable. Publish a correction version instead of editing this version in place.';
export const OFFICIAL_IMMUTABLE_LINK_ERROR =
  'Official versions are immutable. Use the correction-version workflow to adjust linked identities.';
export const FINALIZATION_ATTESTATION_REQUIRED_ERROR =
  'Confirmation is required before publishing official results.';
export const FINALIZATION_EMPTY_DRAFT_ERROR =
  'Draft review gate failed: no draft rows are available for publishing.';
export const FINALIZATION_BLOCKED_ERROR =
  'Draft review gate failed. Resolve blockers before publishing official results.';

export const CLAIM_PENDING_REVIEW_STEPS = [
  'Wait for organizer review of this contested claim.',
  'If needed, share bib and race details with the organizer.',
  'No official result data changed while this claim is pending.',
] as const;

export const DEFAULT_CLAIM_EMPTY_STATE = {
  title: 'No safe claim candidates found yet',
  description:
    'We could not find a confident match for your profile right now. This protects official records from misattribution.',
  nextSteps: [
    'Verify your profile name and try again.',
    'Confirm race details like bib number and category with your organizer.',
    'Ask the organizer to resolve your identity link manually if needed.',
  ],
} as const;

type PostgresErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

export function isUniqueConstraintViolation(
  error: unknown,
  constraintNames?: readonly string[],
): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const dbError = error as PostgresErrorLike;
  if (dbError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) return false;
  if (!constraintNames || constraintNames.length === 0) return true;

  return (
    typeof dbError.constraint === 'string' && constraintNames.includes(dbError.constraint)
  );
}
