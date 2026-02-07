'use server';

import { and, eq, isNull, or } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

import { createAuditLog } from '@/lib/audit';
import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  resultCorrectionRequests,
  resultEntries,
  resultEntryClaims,
  resultIngestionSessions,
  resultVersions,
  users,
} from '@/db/schema';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import {
  confirmRunnerResultClaimSchema,
  createResultDraftVersionSchema,
  finalizeResultVersionAttestationSchema,
  getRunnerResultClaimCandidatesSchema,
  initializeResultIngestionSessionSchema,
  linkDraftResultEntryToUserSchema,
  publishApprovedCorrectionVersionSchema,
  reviewResultCorrectionRequestSchema,
  reviewRunnerResultClaimSchema,
  requestRunnerResultCorrectionSchema,
  upsertDraftResultEntrySchema,
  type ConfirmRunnerResultClaimInput,
  type CreateResultDraftVersionInput,
  type FinalizeResultVersionAttestationInput,
  type GetRunnerResultClaimCandidatesInput,
  type InitializeResultIngestionSessionInput,
  type LinkDraftResultEntryToUserInput,
  type PublishApprovedCorrectionVersionInput,
  type RequestRunnerResultCorrectionInput,
  type ReviewResultCorrectionRequestInput,
  type ReviewRunnerResultClaimInput,
  type UpsertDraftResultEntryInput,
} from '@/lib/events/results/schemas';
import {
  rankingsNationalTag,
  rankingsOrganizerTag,
  rankingsRulesetCurrentTag,
  resultsEditionTag,
  resultsOfficialTag,
} from '@/lib/events/results/cache-tags';
import { deriveResultPlacements } from '@/lib/events/results/derivation/placement';
import { transitionResultVersionLifecycle } from '@/lib/events/results/lifecycle/state-machine';
import {
  findUnclaimedResultClaimCandidateByEntryId,
  findUnclaimedResultClaimCandidates,
} from '@/lib/events/results/queries';
import type {
  ResultClaimCandidate,
  ResultClaimCandidateResponse,
  ResultClaimReviewResponse,
  ResultClaimSubmissionResponse,
  ResultCorrectionPublicationResponse,
  ResultCorrectionRequestRecord,
  ResultCorrectionRequestSubmissionResponse,
  ResultCorrectionRequestReviewResponse,
  ResultEntryRecord,
  ResultIngestionSessionInitResponse,
  ResultIngestionSessionRecord,
  ResultVersionFinalizationGateSummary,
  ResultVersionFinalizationResponse,
  ResultVersionRecord,
} from '@/lib/events/results/types';
import {
  checkEventsAccess,
  revalidatePublicEventByEditionId,
  type ActionResult,
} from '@/lib/events/shared';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';

const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';
const RESULT_VERSION_CREATE_RETRY_LIMIT = 3;
const LINKED_USER_NOT_FOUND_ERROR = 'Linked user not found';
const LINK_CONFLICT_ERROR =
  'Result entry is already linked to a different user. Resolve conflict before reassigning.';
const CLAIM_CANDIDATE_QUERY_MULTIPLIER = 4;
const CLAIM_CANDIDATE_QUERY_LIMIT_MAX = 80;
const DEFAULT_SAFE_CLAIM_CONFIDENCE = 0.65;
const DEFAULT_AUTO_LINK_CLAIM_CONFIDENCE = 0.8;
const CLAIM_REVIEW_REASON_LOW_CONFIDENCE = 'low_confidence_match';
const RESULT_ENTRY_CLAIMS_ENTRY_UNIQUE_IDX = 'result_entry_claims_entry_unique_idx';
const RESULT_INGESTION_SESSIONS_VERSION_UNIQUE_IDX = 'result_ingestion_sessions_version_unique_idx';
const AUDIT_LOG_FAILURE_PREFIX = 'AUDIT_LOG_FAILED:';
const CLAIM_ALREADY_LINKED_ERROR = 'This result is already linked to another account.';
const CLAIM_NOT_ELIGIBLE_ERROR = 'Selected result is not eligible for claiming.';
const CLAIM_NOT_REVIEWABLE_ERROR = 'Claim is no longer reviewable.';
const CLAIM_LINKED_MESSAGE = 'Claim confirmed. Your result is now linked to your profile history.';
const CLAIM_PENDING_REVIEW_MESSAGE =
  'Claim needs organizer review before it can be linked. No ownership was assigned yet.';
const RESULT_CORRECTION_FORBIDDEN_ERROR =
  'You can only request corrections for results linked to your account.';
const RESULT_CORRECTION_SUBMISSION_FORBIDDEN_ERROR =
  'Only the linked runner or an eligible organizer can submit a correction request for this result.';
const RESULT_CORRECTION_REVIEW_FORBIDDEN_ERROR =
  'Only eligible organizers for this event can approve or reject correction requests.';
const RESULT_CORRECTION_INVALID_STATE_ERROR =
  'Corrections can only be requested for official or corrected result versions.';
const CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR = 'Correction request is no longer reviewable.';
const CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR = 'Correction request is not approved for publication.';
const CORRECTION_REQUEST_ALREADY_PUBLISHED_ERROR =
  'Correction request is already published as a corrected version.';
const CORRECTION_PUBLICATION_PATCH_REQUIRED_ERROR =
  'Correction request is missing a valid correction patch payload.';
const CORRECTION_PUBLICATION_FAILED_ERROR =
  'Correction publication failed. Request remains approved for retry.';
const OFFICIAL_IMMUTABLE_MUTATION_ERROR =
  'Official versions are immutable. Publish a correction version instead of editing this version in place.';
const OFFICIAL_IMMUTABLE_LINK_ERROR =
  'Official versions are immutable. Use the correction-version workflow to adjust linked identities.';
const FINALIZATION_ATTESTATION_REQUIRED_ERROR =
  'Attestation confirmation is required before publishing official results.';
const FINALIZATION_EMPTY_DRAFT_ERROR =
  'Draft review gate failed: no draft rows are available for attestation.';
const FINALIZATION_BLOCKED_ERROR =
  'Draft review gate failed. Resolve blockers before attestation.';

const CLAIM_PENDING_REVIEW_STEPS = [
  'Wait for organizer review of this contested claim.',
  'If needed, share bib and race details with the organizer.',
  'No official result data changed while this claim is pending.',
] as const;

type CorrectionDeniedAuditAction =
  | 'results.correction.request.denied'
  | 'results.correction.review.denied';

const DEFAULT_CLAIM_EMPTY_STATE = {
  title: 'No safe claim candidates found yet',
  description:
    'We could not find a confident match for your profile right now. This protects official records from misattribution.',
  nextSteps: [
    'Verify your profile name and try again.',
    'Confirm race details like bib number and category with your organizer.',
    'Ask the organizer to resolve your identity link manually if needed.',
  ],
} as const;

type ResultDraftSyncState = 'synced' | 'pending_sync' | 'conflict';
type ResultMutationClient = Pick<typeof db, 'query' | 'update'>;

const correctionPublicationPatchSchema = z
  .object({
    runnerFullName: z.string().trim().min(1).max(255).optional(),
    bibNumber: z.union([z.string().trim().min(1).max(50), z.null()]).optional(),
    gender: z.union([z.string().trim().min(1).max(20), z.null()]).optional(),
    age: z.union([z.number().int().min(0).max(120), z.null()]).optional(),
    status: z.enum(['finish', 'dq', 'dnf', 'dns']).optional(),
    finishTimeMillis: z.union([z.number().int().positive(), z.null()]).optional(),
    distanceId: z.union([z.string().uuid(), z.null()]).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: CORRECTION_PUBLICATION_PATCH_REQUIRED_ERROR,
  });

type CorrectionPublicationPatch = z.infer<typeof correctionPublicationPatchSchema>;

type PostgresErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

function isUniqueConstraintViolation(error: unknown, constraintNames?: readonly string[]): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const dbError = error as PostgresErrorLike;
  if (dbError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) return false;
  if (!constraintNames || constraintNames.length === 0) return true;

  return (
    typeof dbError.constraint === 'string' && constraintNames.includes(dbError.constraint)
  );
}

function toResultVersionRecord(row: typeof resultVersions.$inferSelect): ResultVersionRecord {
  return {
    id: row.id,
    editionId: row.editionId,
    status: row.status,
    source: row.source,
    versionNumber: row.versionNumber,
    parentVersionId: row.parentVersionId,
    createdByUserId: row.createdByUserId,
    finalizedByUserId: row.finalizedByUserId,
    finalizedAt: row.finalizedAt,
    sourceFileChecksum: row.sourceFileChecksum,
    sourceReference: row.sourceReference,
    provenanceJson: row.provenanceJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toResultEntryRecord(row: typeof resultEntries.$inferSelect): ResultEntryRecord {
  return {
    id: row.id,
    resultVersionId: row.resultVersionId,
    distanceId: row.distanceId,
    userId: row.userId,
    discipline: row.discipline,
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    gender: row.gender,
    age: row.age,
    status: row.status,
    finishTimeMillis: row.finishTimeMillis,
    overallPlace: row.overallPlace,
    genderPlace: row.genderPlace,
    ageGroupPlace: row.ageGroupPlace,
    identitySnapshot: row.identitySnapshot,
    rawSourceData: row.rawSourceData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toResultIngestionSessionRecord(
  row: typeof resultIngestionSessions.$inferSelect,
): ResultIngestionSessionRecord {
  return {
    id: row.id,
    editionId: row.editionId,
    resultVersionId: row.resultVersionId,
    sourceLane: row.sourceLane,
    startedByUserId: row.startedByUserId,
    sourceReference: row.sourceReference,
    sourceFileChecksum: row.sourceFileChecksum,
    provenanceJson: row.provenanceJson,
    startedAt: row.startedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toResultCorrectionRequestRecord(
  row: typeof resultCorrectionRequests.$inferSelect,
): ResultCorrectionRequestRecord {
  return {
    id: row.id,
    resultEntryId: row.resultEntryId,
    resultVersionId: row.resultVersionId,
    requestedByUserId: row.requestedByUserId,
    status: row.status,
    reason: row.reason,
    requestContext: row.requestContext,
    requestedAt: row.requestedAt,
    reviewedByUserId: row.reviewedByUserId,
    reviewedAt: row.reviewedAt,
    reviewDecisionNote: row.reviewDecisionNote,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getPublishedCorrectionResultVersionId(
  requestContext: Record<string, unknown>,
): string | null {
  const publication = requestContext.publication;
  if (!isRecord(publication)) return null;
  const resultVersionId = publication.publishedResultVersionId;
  return typeof resultVersionId === 'string' && resultVersionId.length > 0
    ? resultVersionId
    : null;
}

function readCorrectionPublicationPatch(
  requestContext: Record<string, unknown>,
): CorrectionPublicationPatch | null {
  const candidate = isRecord(requestContext.correctionPatch)
    ? requestContext.correctionPatch
    : requestContext;
  const parsed = correctionPublicationPatchSchema.safeParse(candidate);
  if (!parsed.success) return null;
  return parsed.data;
}

function toDraftSyncState(rawSourceData: unknown): ResultDraftSyncState {
  if (!isRecord(rawSourceData)) return 'synced';
  const value = rawSourceData.syncStatus;
  if (value === 'pending_sync' || value === 'conflict') return value;
  return 'synced';
}

function throwIfAuditLogFailed(
  result: Awaited<ReturnType<typeof createAuditLog>>,
  context: string,
): void {
  if (result.ok) return;
  throw new Error(`${AUDIT_LOG_FAILURE_PREFIX}${context}`);
}

async function buildDraftFinalizationGateSummary(
  resultVersionId: string,
): Promise<ResultVersionFinalizationGateSummary> {
  const rows = await db.query.resultEntries.findMany({
    where: and(
      eq(resultEntries.resultVersionId, resultVersionId),
      isNull(resultEntries.deletedAt),
    ),
    columns: {
      status: true,
      finishTimeMillis: true,
      rawSourceData: true,
    },
  });

  let blockerCount = 0;
  let warningCount = 0;

  for (const row of rows) {
    const syncStatus = toDraftSyncState(row.rawSourceData);
    if (syncStatus === 'pending_sync' || syncStatus === 'conflict') {
      blockerCount += 1;
    }

    if (row.status === 'finish' && row.finishTimeMillis === null) {
      blockerCount += 1;
    } else if (row.status !== 'finish' && row.finishTimeMillis !== null) {
      warningCount += 1;
    }
  }

  return {
    rowCount: rows.length,
    blockerCount,
    warningCount,
    canProceed: rows.length > 0 && blockerCount === 0,
  };
}

async function deriveAndPersistDraftPlacements(
  resultVersionId: string,
  mutationClient: ResultMutationClient = db,
): Promise<
  Record<
    string,
    Pick<
      typeof resultEntries.$inferSelect,
      'overallPlace' | 'genderPlace' | 'ageGroupPlace'
    >
  >
> {
  const rows = await mutationClient.query.resultEntries.findMany({
    where: and(
      eq(resultEntries.resultVersionId, resultVersionId),
      isNull(resultEntries.deletedAt),
    ),
    columns: {
      id: true,
      runnerFullName: true,
      bibNumber: true,
      status: true,
      finishTimeMillis: true,
      gender: true,
      age: true,
      identitySnapshot: true,
      rawSourceData: true,
      overallPlace: true,
      genderPlace: true,
      ageGroupPlace: true,
    },
  });

  if (rows.length === 0) return {};

  const derived = deriveResultPlacements(
    rows.map((row) => ({
      id: row.id,
      runnerFullName: row.runnerFullName,
      bibNumber: row.bibNumber,
      status: row.status,
      finishTimeMillis: row.finishTimeMillis,
      gender: row.gender,
      age: row.age,
      identitySnapshot: row.identitySnapshot,
      rawSourceData: row.rawSourceData,
    })),
  );

  const byEntryId: Record<
    string,
    Pick<typeof resultEntries.$inferSelect, 'overallPlace' | 'genderPlace' | 'ageGroupPlace'>
  > = {};

  for (const row of rows) {
    const derivedForEntry = derived.byEntryId[row.id];
    if (!derivedForEntry) continue;

    const nextPlacement = {
      overallPlace: derivedForEntry.overallPlace,
      genderPlace: derivedForEntry.genderPlace,
      ageGroupPlace: derivedForEntry.ageGroupPlace,
    };
    byEntryId[row.id] = nextPlacement;

    if (
      row.overallPlace === nextPlacement.overallPlace &&
      row.genderPlace === nextPlacement.genderPlace &&
      row.ageGroupPlace === nextPlacement.ageGroupPlace
    ) {
      continue;
    }

    await mutationClient
      .update(resultEntries)
      .set(nextPlacement)
      .where(
        and(
          eq(resultEntries.id, row.id),
          eq(resultEntries.resultVersionId, resultVersionId),
          isNull(resultEntries.deletedAt),
        ),
      );
  }

  return byEntryId;
}

async function assertCanWriteResultsForEdition(
  userId: string,
  editionId: string,
  canManageEvents: boolean,
) {
  if (canManageEvents) return true;

  const membership = await canUserAccessEvent(userId, editionId);
  try {
    requireOrgPermission(membership, 'canEditRegistrationSettings');
  } catch {
    return false;
  }

  return true;
}

async function resolveEditionOrganizationId(editionId: string): Promise<string | null> {
  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: { id: true },
    with: {
      series: {
        columns: {
          organizationId: true,
        },
      },
    },
  });

  return edition?.series?.organizationId ?? null;
}

async function logCorrectionAuthorizationDenied(params: {
  action: CorrectionDeniedAuditAction;
  actorUserId: string;
  entityType: 'result_entry' | 'result_correction_request';
  entityId: string;
  organizationId: string | null;
  reason: string;
  details?: Record<string, unknown>;
}) {
  const auditResult = await createAuditLog({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    after: {
      outcome: 'denied',
      reason: params.reason,
      ...(params.details ?? {}),
    },
  });

  if (!auditResult.ok) {
    console.warn('[results-corrections] Failed to write authorization denied audit log', {
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      reason: params.reason,
      error: auditResult.error,
    });
  }
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildNameTokens(value: string): string[] {
  return [...new Set(normalizeName(value).split(' ').filter((token) => token.length >= 2))];
}

function normalizeGender(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (['f', 'female', 'woman', 'mujer'].includes(normalized)) return 'female';
  if (['m', 'male', 'man', 'hombre'].includes(normalized)) return 'male';
  return normalized;
}

function calculateAgeAtDate(dateOfBirth: Date | null | undefined, referenceDate: Date): number | null {
  if (!dateOfBirth) return null;

  let age = referenceDate.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const referenceMonth = referenceDate.getUTCMonth();
  const referenceDay = referenceDate.getUTCDate();
  const birthMonth = dateOfBirth.getUTCMonth();
  const birthDay = dateOfBirth.getUTCDate();

  if (referenceMonth < birthMonth || (referenceMonth === birthMonth && referenceDay < birthDay)) {
    age -= 1;
  }

  return age >= 0 ? age : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toConfidenceLabel(score: number): ResultClaimCandidate['confidenceLabel'] {
  return score >= 0.8 ? 'high' : 'medium';
}

function toConfidenceBasisPoints(score: number): number {
  return Math.round(clamp(score, 0, 1) * 1000);
}

function fromConfidenceBasisPoints(basisPoints: number | null | undefined): number {
  if (typeof basisPoints !== 'number') return 0;
  return Number((basisPoints / 1000).toFixed(3));
}

function toClaimOutcome(
  status: (typeof resultEntryClaims.$inferSelect)['status'],
): ResultClaimSubmissionResponse['outcome'] {
  return status === 'linked' ? 'linked' : 'pending_review';
}

function buildClaimSubmissionResponse(params: {
  claimId: string;
  entryId: string;
  resultVersionId: string;
  status: (typeof resultEntryClaims.$inferSelect)['status'];
  confidenceScore: number;
  message?: string;
}): ResultClaimSubmissionResponse {
  const outcome = toClaimOutcome(params.status);
  return {
    claimId: params.claimId,
    entryId: params.entryId,
    resultVersionId: params.resultVersionId,
    outcome,
    confidenceScore: Number(clamp(params.confidenceScore, 0, 1).toFixed(3)),
    message:
      params.message ??
      (outcome === 'linked' ? CLAIM_LINKED_MESSAGE : CLAIM_PENDING_REVIEW_MESSAGE),
    nextSteps: outcome === 'pending_review' ? CLAIM_PENDING_REVIEW_STEPS : null,
  };
}

function toExistingClaimMessage(params: {
  claim: typeof resultEntryClaims.$inferSelect;
  userId: string;
}): string {
  if (params.claim.status === 'linked') {
    return 'This result is already linked to your profile history.';
  }

  return params.claim.requestedByUserId === params.userId
    ? 'Your claim is already pending organizer review.'
    : 'This result already has a pending claim review.';
}

function buildClaimReviewContext(input: ReviewRunnerResultClaimInput): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  if (input.reviewContextNote) {
    context.note = input.reviewContextNote;
  }
  return context;
}

function scoreClaimCandidate(
  candidate: Awaited<ReturnType<typeof findUnclaimedResultClaimCandidates>>[number],
  runner: {
    normalizedName: string;
    nameTokens: string[];
    normalizedGender: string | null;
    dateOfBirth: Date | null;
  },
): ResultClaimCandidate {
  const matchSignals: ResultClaimCandidate['matchSignals'] = [];

  const candidateNormalizedName = normalizeName(candidate.runnerFullName);
  const candidateTokens = buildNameTokens(candidate.runnerFullName);
  const sharedTokens = runner.nameTokens.filter((token) => candidateTokens.includes(token));
  const tokenCoverage =
    runner.nameTokens.length > 0 ? sharedTokens.length / runner.nameTokens.length : 0;

  let score = 0;

  if (candidateNormalizedName === runner.normalizedName) {
    score += 0.62;
    matchSignals.push('exact_name');
  } else if (sharedTokens.length > 0) {
    score += Math.min(0.52, tokenCoverage * 0.52);
    matchSignals.push('name_token_overlap');
  }

  const candidateGender = normalizeGender(candidate.gender);
  if (runner.normalizedGender && candidateGender) {
    if (runner.normalizedGender === candidateGender) {
      score += 0.18;
      matchSignals.push('gender_match');
    } else {
      score -= 0.22;
    }
  }

  if (candidate.age !== null) {
    const referenceDate = candidate.editionStartsAt ?? candidate.entryCreatedAt;
    const expectedAge = calculateAgeAtDate(runner.dateOfBirth, referenceDate);
    if (expectedAge !== null) {
      const ageDelta = Math.abs(expectedAge - candidate.age);
      if (ageDelta <= 1) {
        score += 0.2;
        matchSignals.push('strong_age_match');
      } else if (ageDelta <= 2) {
        score += 0.12;
        matchSignals.push('age_match');
      } else if (ageDelta <= 4) {
        score += 0.05;
        matchSignals.push('age_close');
      } else {
        score -= 0.15;
      }
    }
  }

  if (candidate.bibNumber) {
    score += 0.03;
    matchSignals.push('bib_present');
  }
  if (candidate.finishTimeMillis !== null) {
    score += 0.02;
    matchSignals.push('timing_present');
  }
  if (
    candidate.overallPlace !== null ||
    candidate.genderPlace !== null ||
    candidate.ageGroupPlace !== null
  ) {
    score += 0.03;
    matchSignals.push('placement_present');
  }
  if (candidate.distanceLabel) {
    score += 0.02;
    matchSignals.push('distance_present');
  }

  const confidenceScore = Number(clamp(score, 0, 1).toFixed(3));

  return {
    entryId: candidate.entryId,
    resultVersionId: candidate.resultVersionId,
    confidenceScore,
    confidenceLabel: toConfidenceLabel(confidenceScore),
    matchSignals,
    eventContext: {
      editionId: candidate.editionId,
      seriesName: candidate.seriesName,
      seriesSlug: candidate.seriesSlug,
      editionLabel: candidate.editionLabel,
      editionSlug: candidate.editionSlug,
      startsAt: candidate.editionStartsAt,
      city: candidate.editionCity,
      state: candidate.editionState,
    },
    resultContext: {
      discipline: candidate.discipline,
      status: candidate.status,
      bibNumber: candidate.bibNumber,
      distanceLabel: candidate.distanceLabel,
      finishTimeMillis: candidate.finishTimeMillis,
      overallPlace: candidate.overallPlace,
      genderPlace: candidate.genderPlace,
      ageGroupPlace: candidate.ageGroupPlace,
      gender: candidate.gender,
      age: candidate.age,
    },
  };
}

export const createResultDraftVersion = withAuthenticatedUser<ActionResult<ResultVersionRecord>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: CreateResultDraftVersionInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = createResultDraftVersionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, source, parentResultVersionId, sourceReference, sourceFileChecksum } =
    validated.data;

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
  });

  if (!edition) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  if (parentResultVersionId) {
    const parentVersion = await db.query.resultVersions.findFirst({
      where: and(
        eq(resultVersions.id, parentResultVersionId),
        eq(resultVersions.editionId, editionId),
        isNull(resultVersions.deletedAt),
      ),
      columns: { id: true },
    });

    if (!parentVersion) {
      return {
        ok: false,
        error: 'Parent result version not found for this edition',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  for (let attempt = 0; attempt < RESULT_VERSION_CREATE_RETRY_LIMIT; attempt += 1) {
    const latestVersion = await db.query.resultVersions.findFirst({
      where: and(eq(resultVersions.editionId, editionId), isNull(resultVersions.deletedAt)),
      orderBy: (rv, { desc }) => [desc(rv.versionNumber)],
      columns: { versionNumber: true },
    });

    try {
      const [createdVersion] = await db
        .insert(resultVersions)
        .values({
          editionId,
          status: 'draft',
          source,
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          parentVersionId: parentResultVersionId ?? null,
          createdByUserId: authContext.user.id,
          sourceReference: sourceReference ?? null,
          sourceFileChecksum: sourceFileChecksum ?? null,
          provenanceJson: {},
        })
        .returning();

      return { ok: true, data: toResultVersionRecord(createdVersion) };
    } catch (error) {
      const isVersionConflict = isUniqueConstraintViolation(error, [
        'result_versions_edition_version_idx',
      ]);
      if (isVersionConflict && attempt < RESULT_VERSION_CREATE_RETRY_LIMIT - 1) {
        continue;
      }
      if (isVersionConflict) {
        return {
          ok: false,
          error: 'Could not allocate a draft version number. Please retry.',
          code: 'CONFLICT',
        };
      }
      throw error;
    }
  }

  return {
    ok: false,
    error: 'Could not allocate a draft version number. Please retry.',
    code: 'CONFLICT',
  };
});

export const initializeResultIngestionSession = withAuthenticatedUser<
  ActionResult<ResultIngestionSessionInitResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: InitializeResultIngestionSessionInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = initializeResultIngestionSessionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, sourceLane, sourceReference, sourceFileChecksum } = validated.data;

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: { id: true },
    with: {
      series: {
        columns: {
          organizationId: true,
        },
      },
    },
  });
  if (!edition) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  for (let attempt = 0; attempt < RESULT_VERSION_CREATE_RETRY_LIMIT; attempt += 1) {
    const latestVersion = await db.query.resultVersions.findFirst({
      where: and(eq(resultVersions.editionId, editionId), isNull(resultVersions.deletedAt)),
      orderBy: (rv, { desc }) => [desc(rv.versionNumber)],
      columns: { id: true, versionNumber: true },
    });

    try {
      const { createdVersion, createdSession } = await db.transaction(async (tx) => {
        const [nextVersion] = await tx
          .insert(resultVersions)
          .values({
            editionId,
            status: 'draft',
            source: sourceLane,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            parentVersionId: latestVersion?.id ?? null,
            createdByUserId: authContext.user.id,
            sourceReference: sourceReference ?? null,
            sourceFileChecksum: sourceFileChecksum ?? null,
            provenanceJson: {
              sourceLane,
              startedByUserId: authContext.user.id,
            },
          })
          .returning();

        const [nextSession] = await tx
          .insert(resultIngestionSessions)
          .values({
            editionId,
            resultVersionId: nextVersion.id,
            sourceLane,
            startedByUserId: authContext.user.id,
            sourceReference: sourceReference ?? null,
            sourceFileChecksum: sourceFileChecksum ?? null,
            provenanceJson: {
              sourceLane,
              startedByUserId: authContext.user.id,
            },
          })
          .returning();

        const auditResult = await createAuditLog(
          {
            organizationId: edition.series?.organizationId ?? null,
            actorUserId: authContext.user.id,
            action: 'results.ingestion.initialize',
            entityType: 'result_ingestion_session',
            entityId: nextSession.id,
            after: {
              editionId,
              resultVersionId: nextVersion.id,
              sourceLane,
              sourceReference: nextSession.sourceReference,
              sourceFileChecksum: nextSession.sourceFileChecksum,
              startedAt: nextSession.startedAt.toISOString(),
            },
          },
          tx,
        );

        throwIfAuditLogFailed(auditResult, 'results.ingestion.initialize');

        return {
          createdVersion: nextVersion,
          createdSession: nextSession,
        };
      });

      return {
        ok: true,
        data: {
          resultVersion: toResultVersionRecord(createdVersion),
          session: toResultIngestionSessionRecord(createdSession),
        },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith(AUDIT_LOG_FAILURE_PREFIX)
      ) {
        return {
          ok: false,
          error: 'Failed to create audit log for ingestion initialization',
          code: 'SERVER_ERROR',
        };
      }

      const isVersionConflict = isUniqueConstraintViolation(error, [
        'result_versions_edition_version_idx',
      ]);
      if (isVersionConflict && attempt < RESULT_VERSION_CREATE_RETRY_LIMIT - 1) {
        continue;
      }
      if (isVersionConflict) {
        return {
          ok: false,
          error: 'Could not allocate a draft version number. Please retry.',
          code: 'CONFLICT',
        };
      }

      if (isUniqueConstraintViolation(error, [RESULT_INGESTION_SESSIONS_VERSION_UNIQUE_IDX])) {
        return {
          ok: false,
          error: 'Ingestion session already exists for this draft version',
          code: 'CONFLICT',
        };
      }

      throw error;
    }
  }

  return {
    ok: false,
    error: 'Could not allocate a draft version number. Please retry.',
    code: 'CONFLICT',
  };
});

export const finalizeResultVersionAttestation = withAuthenticatedUser<
  ActionResult<ResultVersionFinalizationResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: FinalizeResultVersionAttestationInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = finalizeResultVersionAttestationSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { editionId, attestationConfirmed, attestationNote } = validated.data;
  if (!attestationConfirmed) {
    return {
      ok: false,
      error: FINALIZATION_ATTESTATION_REQUIRED_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }

  const draftVersion = await db.query.resultVersions.findFirst({
    where: and(
      eq(resultVersions.editionId, editionId),
      eq(resultVersions.status, 'draft'),
      isNull(resultVersions.deletedAt),
    ),
    orderBy: (rv, { desc }) => [desc(rv.versionNumber), desc(rv.createdAt)],
  });

  if (!draftVersion) {
    return {
      ok: false,
      error: 'No draft result version available for attestation',
      code: 'NOT_FOUND',
    };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    draftVersion.editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const gate = await buildDraftFinalizationGateSummary(draftVersion.id);
  if (gate.rowCount === 0) {
    return {
      ok: false,
      error: FINALIZATION_EMPTY_DRAFT_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }
  if (!gate.canProceed) {
    return {
      ok: false,
      error: FINALIZATION_BLOCKED_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }

  await deriveAndPersistDraftPlacements(draftVersion.id);

  const finalizedAt = new Date();
  const lifecycleTransition = await transitionResultVersionLifecycle({
    resultVersionId: draftVersion.id,
    toStatus: 'official',
    finalizedByUserId: authContext.user.id,
    finalizedAt,
    transitionReason: 'attestation',
    provenancePatch: {
      attestation: {
        confirmed: true,
        attestedByUserId: authContext.user.id,
        attestedAt: finalizedAt.toISOString(),
        sourceLane: draftVersion.source,
        note: attestationNote ?? null,
      },
    },
  });

  if (!lifecycleTransition.ok) {
    return lifecycleTransition;
  }

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, draftVersion.editionId), isNull(eventEditions.deletedAt)),
    columns: { id: true },
    with: {
      series: {
        columns: {
          organizationId: true,
        },
      },
    },
  });

  const finalizationAudit = await createAuditLog({
    organizationId: edition?.series?.organizationId ?? null,
    actorUserId: authContext.user.id,
    action: 'results.version.finalize',
    entityType: 'result_version',
    entityId: lifecycleTransition.data.id,
    before: {
      editionId: draftVersion.editionId,
      status: draftVersion.status,
      versionNumber: draftVersion.versionNumber,
    },
    after: {
      editionId: draftVersion.editionId,
      status: lifecycleTransition.data.status,
      versionNumber: lifecycleTransition.data.versionNumber,
      finalizedAt: lifecycleTransition.data.finalizedAt?.toISOString() ?? null,
      finalizedByUserId: lifecycleTransition.data.finalizedByUserId,
      gate,
      attestationNote: attestationNote ?? null,
    },
  });

  if (!finalizationAudit.ok) {
    return {
      ok: false,
      error: 'Failed to create audit log for result finalization',
      code: 'SERVER_ERROR',
    };
  }

  revalidateTag(resultsEditionTag(draftVersion.editionId), { expire: 0 });
  revalidateTag(resultsOfficialTag(draftVersion.editionId), { expire: 0 });
  revalidateTag(rankingsNationalTag(), { expire: 0 });
  revalidateTag(rankingsRulesetCurrentTag(), { expire: 0 });
  if (edition?.series?.organizationId) {
    revalidateTag(rankingsOrganizerTag(edition.series.organizationId), { expire: 0 });
  }
  await revalidatePublicEventByEditionId(draftVersion.editionId);

  return {
    ok: true,
    data: {
      resultVersion: lifecycleTransition.data,
      gate,
    },
  };
});

export const upsertDraftResultEntry = withAuthenticatedUser<ActionResult<ResultEntryRecord>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: UpsertDraftResultEntryInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = upsertDraftResultEntrySchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const {
    entryId,
    resultVersionId,
    distanceId,
    userId,
    discipline,
    runnerFullName,
    bibNumber,
    gender,
    age,
    status,
    finishTimeMillis,
    identitySnapshot,
    rawSourceData,
  } = validated.data;

  const version = await db.query.resultVersions.findFirst({
    where: and(eq(resultVersions.id, resultVersionId), isNull(resultVersions.deletedAt)),
  });

  if (!version) {
    return { ok: false, error: 'Result version not found', code: 'NOT_FOUND' };
  }

  if (version.status !== 'draft') {
    return {
      ok: false,
      error: OFFICIAL_IMMUTABLE_MUTATION_ERROR,
      code: 'INVALID_STATE',
    };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    version.editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  if (userId) {
    const existingUser = await db.query.users.findFirst({
      where: and(eq(users.id, userId), isNull(users.deletedAt)),
      columns: { id: true },
    });
    if (!existingUser) {
      return { ok: false, error: LINKED_USER_NOT_FOUND_ERROR, code: 'VALIDATION_ERROR' };
    }
  }

  if (distanceId) {
    const existingDistance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, distanceId),
        eq(eventDistances.editionId, version.editionId),
        isNull(eventDistances.deletedAt),
      ),
      columns: { id: true },
    });
    if (!existingDistance) {
      return {
        ok: false,
        error: 'Distance must belong to the same edition as the draft result version',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  const baseEntryValues = {
    distanceId: distanceId ?? null,
    discipline,
    runnerFullName,
    bibNumber: bibNumber ?? null,
    gender: gender ?? null,
    age: age ?? null,
    status,
    finishTimeMillis: finishTimeMillis ?? null,
    // Canonical placements are always derived server-side from status/time policy.
    overallPlace: null,
    genderPlace: null,
    ageGroupPlace: null,
    identitySnapshot,
    rawSourceData,
  };

  if (entryId) {
    const existingEntry = await db.query.resultEntries.findFirst({
      where: and(
        eq(resultEntries.id, entryId),
        eq(resultEntries.resultVersionId, resultVersionId),
        isNull(resultEntries.deletedAt),
      ),
      columns: { id: true, userId: true },
    });

    if (!existingEntry) {
      return { ok: false, error: 'Result entry not found for draft version', code: 'NOT_FOUND' };
    }

    if (existingEntry.userId && userId && existingEntry.userId !== userId) {
      return { ok: false, error: LINK_CONFLICT_ERROR, code: 'CONFLICT' };
    }

    const entryValues = {
      ...baseEntryValues,
      // Preserve existing verified link unless explicitly matching the same user.
      userId: existingEntry.userId ?? userId ?? null,
    };

    try {
      const [updatedEntry] = await db
        .update(resultEntries)
        .set(entryValues)
        .where(and(eq(resultEntries.id, entryId), eq(resultEntries.resultVersionId, resultVersionId)))
        .returning();

      const derivedPlacements = await deriveAndPersistDraftPlacements(resultVersionId);
      const derivedPlacement = derivedPlacements[updatedEntry.id];
      const nextRow = derivedPlacement
        ? { ...updatedEntry, ...derivedPlacement }
        : updatedEntry;

      return { ok: true, data: toResultEntryRecord(nextRow) };
    } catch (error) {
      if (
        isUniqueConstraintViolation(error, [
          'result_entries_version_bib_unique_idx',
          'result_entries_version_name_no_bib_unique_idx',
        ])
      ) {
        return {
          ok: false,
          error: 'A draft entry with the same identity already exists in this version',
          code: 'CONFLICT',
        };
      }
      throw error;
    }
  }

  try {
    const [createdEntry] = await db
      .insert(resultEntries)
      .values({
        resultVersionId,
        ...baseEntryValues,
        userId: userId ?? null,
      })
      .returning();

    const derivedPlacements = await deriveAndPersistDraftPlacements(resultVersionId);
    const derivedPlacement = derivedPlacements[createdEntry.id];
    const nextRow = derivedPlacement ? { ...createdEntry, ...derivedPlacement } : createdEntry;

    return { ok: true, data: toResultEntryRecord(nextRow) };
  } catch (error) {
    if (
      isUniqueConstraintViolation(error, [
        'result_entries_version_bib_unique_idx',
        'result_entries_version_name_no_bib_unique_idx',
      ])
    ) {
      return {
        ok: false,
        error: 'A draft entry with the same identity already exists in this version',
        code: 'CONFLICT',
      };
    }
    throw error;
  }
});

export const linkDraftResultEntryToUser = withAuthenticatedUser<ActionResult<ResultEntryRecord>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: LinkDraftResultEntryToUserInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = linkDraftResultEntryToUserSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const { resultVersionId, entryId, userId: targetUserId } = validated.data;

  const version = await db.query.resultVersions.findFirst({
    where: and(eq(resultVersions.id, resultVersionId), isNull(resultVersions.deletedAt)),
  });

  if (!version) {
    return { ok: false, error: 'Result version not found', code: 'NOT_FOUND' };
  }

  if (version.status !== 'draft') {
    return {
      ok: false,
      error: OFFICIAL_IMMUTABLE_LINK_ERROR,
      code: 'INVALID_STATE',
    };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    version.editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const existingEntry = await db.query.resultEntries.findFirst({
    where: and(
      eq(resultEntries.id, entryId),
      eq(resultEntries.resultVersionId, resultVersionId),
      isNull(resultEntries.deletedAt),
    ),
    columns: { id: true, userId: true },
  });

  if (!existingEntry) {
    return { ok: false, error: 'Result entry not found for draft version', code: 'NOT_FOUND' };
  }

  if (existingEntry.userId && existingEntry.userId !== targetUserId) {
    return { ok: false, error: LINK_CONFLICT_ERROR, code: 'CONFLICT' };
  }

  if (existingEntry.userId === targetUserId) {
    const currentEntry = await db.query.resultEntries.findFirst({
      where: and(
        eq(resultEntries.id, entryId),
        eq(resultEntries.resultVersionId, resultVersionId),
        isNull(resultEntries.deletedAt),
      ),
    });

    if (!currentEntry) {
      return { ok: false, error: 'Result entry not found for draft version', code: 'NOT_FOUND' };
    }

    return { ok: true, data: toResultEntryRecord(currentEntry) };
  }

  const existingUser = await db.query.users.findFirst({
    where: and(eq(users.id, targetUserId), isNull(users.deletedAt)),
    columns: { id: true },
  });
  if (!existingUser) {
    return { ok: false, error: LINKED_USER_NOT_FOUND_ERROR, code: 'VALIDATION_ERROR' };
  }

  const [linkedEntry] = await db
    .update(resultEntries)
    .set({ userId: targetUserId })
    .where(
      and(
        eq(resultEntries.id, entryId),
        eq(resultEntries.resultVersionId, resultVersionId),
        isNull(resultEntries.deletedAt),
        or(isNull(resultEntries.userId), eq(resultEntries.userId, targetUserId)),
      ),
    )
    .returning();

  if (!linkedEntry) {
    const refreshedEntry = await db.query.resultEntries.findFirst({
      where: and(
        eq(resultEntries.id, entryId),
        eq(resultEntries.resultVersionId, resultVersionId),
        isNull(resultEntries.deletedAt),
      ),
      columns: { userId: true },
    });

    if (refreshedEntry?.userId && refreshedEntry.userId !== targetUserId) {
      return { ok: false, error: LINK_CONFLICT_ERROR, code: 'CONFLICT' };
    }

    return { ok: false, error: 'Result entry not found for draft version', code: 'NOT_FOUND' };
  }

  return { ok: true, data: toResultEntryRecord(linkedEntry) };
});

export const getRunnerResultClaimCandidates = withAuthenticatedUser<
  ActionResult<ResultClaimCandidateResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: GetRunnerResultClaimCandidatesInput) => {
  const validated = getRunnerResultClaimCandidatesSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const runnerName = authContext.user.name?.trim() ?? '';
  if (!runnerName) {
    return {
      ok: false,
      error: 'Runner profile name is required to search claim candidates',
      code: 'VALIDATION_ERROR',
    };
  }

  const nameTokens = buildNameTokens(runnerName);
  if (nameTokens.length === 0) {
    return {
      ok: true,
      data: {
        candidates: [],
        emptyState: DEFAULT_CLAIM_EMPTY_STATE,
      },
    };
  }

  const queryLimit = Math.min(
    validated.data.limit * CLAIM_CANDIDATE_QUERY_MULTIPLIER,
    CLAIM_CANDIDATE_QUERY_LIMIT_MAX,
  );

  const rawCandidates = await findUnclaimedResultClaimCandidates({
    runnerName,
    runnerNameTokens: nameTokens,
    limit: queryLimit,
  });

  const normalizedRunnerName = normalizeName(runnerName);
  const normalizedRunnerGender = normalizeGender(authContext.profile?.gender);
  const runnerDateOfBirth = authContext.profile?.dateOfBirth ?? null;

  const scoredCandidates = rawCandidates
    .map((candidate) =>
      scoreClaimCandidate(candidate, {
        normalizedName: normalizedRunnerName,
        nameTokens,
        normalizedGender: normalizedRunnerGender,
        dateOfBirth: runnerDateOfBirth,
      }),
    )
    .sort((a, b) => {
      if (b.confidenceScore !== a.confidenceScore) {
        return b.confidenceScore - a.confidenceScore;
      }

      const aStartsAt = a.eventContext.startsAt?.getTime() ?? 0;
      const bStartsAt = b.eventContext.startsAt?.getTime() ?? 0;
      if (bStartsAt !== aStartsAt) {
        return bStartsAt - aStartsAt;
      }

      return a.entryId.localeCompare(b.entryId);
    });

  const minimumConfidence = validated.data.minimumConfidence ?? DEFAULT_SAFE_CLAIM_CONFIDENCE;
  const safeCandidates = scoredCandidates
    .filter((candidate) => candidate.confidenceScore >= minimumConfidence)
    .slice(0, validated.data.limit);

  if (safeCandidates.length === 0) {
    return {
      ok: true,
      data: {
        candidates: [],
        emptyState: DEFAULT_CLAIM_EMPTY_STATE,
      },
    };
  }

  return {
    ok: true,
    data: {
      candidates: safeCandidates,
      emptyState: null,
    },
  };
});

export const confirmRunnerResultClaim = withAuthenticatedUser<
  ActionResult<ResultClaimSubmissionResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: ConfirmRunnerResultClaimInput) => {
  const validated = confirmRunnerResultClaimSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const runnerName = authContext.user.name?.trim() ?? '';
  if (!runnerName) {
    return {
      ok: false,
      error: 'Runner profile name is required to confirm a result claim',
      code: 'VALIDATION_ERROR',
    };
  }

  const requestedEntry = await db.query.resultEntries.findFirst({
    where: and(
      eq(resultEntries.id, validated.data.entryId),
      isNull(resultEntries.deletedAt),
    ),
    columns: {
      id: true,
      resultVersionId: true,
    },
  });
  if (!requestedEntry) {
    return { ok: false, error: CLAIM_NOT_ELIGIBLE_ERROR, code: 'NOT_FOUND' };
  }

  const existingClaim = await db.query.resultEntryClaims.findFirst({
    where: and(
      eq(resultEntryClaims.resultEntryId, validated.data.entryId),
      isNull(resultEntryClaims.deletedAt),
    ),
  });

  if (existingClaim) {
    if (existingClaim.status === 'linked') {
      if (existingClaim.linkedUserId === authContext.user.id) {
        return {
          ok: true,
          data: buildClaimSubmissionResponse({
            claimId: existingClaim.id,
            entryId: validated.data.entryId,
            resultVersionId: requestedEntry.resultVersionId,
            status: existingClaim.status,
            confidenceScore: fromConfidenceBasisPoints(existingClaim.confidenceBasisPoints),
            message: toExistingClaimMessage({
              claim: existingClaim,
              userId: authContext.user.id,
            }),
          }),
        };
      }

      return {
        ok: false,
        error: CLAIM_ALREADY_LINKED_ERROR,
        code: 'CONFLICT',
      };
    }

    if (existingClaim.status === 'pending_review') {
      return {
        ok: true,
        data: buildClaimSubmissionResponse({
          claimId: existingClaim.id,
          entryId: validated.data.entryId,
          resultVersionId: requestedEntry.resultVersionId,
          status: 'pending_review',
          confidenceScore: fromConfidenceBasisPoints(existingClaim.confidenceBasisPoints),
          message: toExistingClaimMessage({
            claim: existingClaim,
            userId: authContext.user.id,
          }),
        }),
      };
    }

    if (existingClaim.status !== 'rejected') {
      return {
        ok: false,
        error: 'Claim is in an unsupported state',
        code: 'INVALID_STATE',
      };
    }
  }

  const runnerNameTokens = buildNameTokens(runnerName);
  if (runnerNameTokens.length === 0) {
    return { ok: false, error: CLAIM_NOT_ELIGIBLE_ERROR, code: 'VALIDATION_ERROR' };
  }

  const candidate = await findUnclaimedResultClaimCandidateByEntryId({
    entryId: validated.data.entryId,
    runnerName,
    runnerNameTokens,
  });

  if (!candidate) {
    return { ok: false, error: CLAIM_NOT_ELIGIBLE_ERROR, code: 'NOT_FOUND' };
  }

  const scoredCandidate = scoreClaimCandidate(candidate, {
    normalizedName: normalizeName(runnerName),
    nameTokens: runnerNameTokens,
    normalizedGender: normalizeGender(authContext.profile?.gender),
    dateOfBirth: authContext.profile?.dateOfBirth ?? null,
  });

  const shouldAutoLink = scoredCandidate.confidenceScore >= DEFAULT_AUTO_LINK_CLAIM_CONFIDENCE;
  const status = shouldAutoLink ? 'linked' : 'pending_review';
  const confidenceBasisPoints = toConfidenceBasisPoints(scoredCandidate.confidenceScore);

  if (existingClaim?.status === 'rejected') {
    const [reopenedClaim] = await db
      .update(resultEntryClaims)
      .set({
        requestedByUserId: authContext.user.id,
        linkedUserId: shouldAutoLink ? authContext.user.id : null,
        reviewedByUserId: null,
        reviewedAt: null,
        status,
        confidenceBasisPoints,
        reviewReason: shouldAutoLink ? null : CLAIM_REVIEW_REASON_LOW_CONFIDENCE,
        reviewContext: {},
      })
      .where(
        and(
          eq(resultEntryClaims.id, existingClaim.id),
          eq(resultEntryClaims.status, 'rejected'),
          isNull(resultEntryClaims.deletedAt),
        ),
      )
      .returning();

    if (reopenedClaim) {
      return {
        ok: true,
        data: buildClaimSubmissionResponse({
          claimId: reopenedClaim.id,
          entryId: validated.data.entryId,
          resultVersionId: candidate.resultVersionId,
          status,
          confidenceScore: scoredCandidate.confidenceScore,
        }),
      };
    }

    const concurrentClaim = await db.query.resultEntryClaims.findFirst({
      where: and(
        eq(resultEntryClaims.resultEntryId, validated.data.entryId),
        isNull(resultEntryClaims.deletedAt),
      ),
    });

    if (!concurrentClaim) {
      return {
        ok: false,
        error: 'Claim could not be confirmed due to a concurrent update. Please retry.',
        code: 'CONFLICT',
      };
    }

    if (
      concurrentClaim.status === 'linked' &&
      concurrentClaim.linkedUserId &&
      concurrentClaim.linkedUserId !== authContext.user.id
    ) {
      return {
        ok: false,
        error: CLAIM_ALREADY_LINKED_ERROR,
        code: 'CONFLICT',
      };
    }

    if (concurrentClaim.status === 'rejected') {
      return {
        ok: false,
        error: CLAIM_NOT_ELIGIBLE_ERROR,
        code: 'CONFLICT',
      };
    }

    return {
      ok: true,
      data: buildClaimSubmissionResponse({
        claimId: concurrentClaim.id,
        entryId: validated.data.entryId,
        resultVersionId: candidate.resultVersionId,
        status: concurrentClaim.status,
        confidenceScore: fromConfidenceBasisPoints(concurrentClaim.confidenceBasisPoints),
        message: toExistingClaimMessage({
          claim: concurrentClaim,
          userId: authContext.user.id,
        }),
      }),
    };
  }

  try {
    const [createdClaim] = await db
      .insert(resultEntryClaims)
      .values({
        resultEntryId: validated.data.entryId,
        requestedByUserId: authContext.user.id,
        linkedUserId: shouldAutoLink ? authContext.user.id : null,
        status,
        confidenceBasisPoints,
        reviewReason: shouldAutoLink ? null : CLAIM_REVIEW_REASON_LOW_CONFIDENCE,
      })
      .returning();

    return {
      ok: true,
      data: buildClaimSubmissionResponse({
        claimId: createdClaim.id,
        entryId: validated.data.entryId,
        resultVersionId: candidate.resultVersionId,
        status,
        confidenceScore: scoredCandidate.confidenceScore,
      }),
    };
  } catch (error) {
    if (isUniqueConstraintViolation(error, [RESULT_ENTRY_CLAIMS_ENTRY_UNIQUE_IDX])) {
      const concurrentClaim = await db.query.resultEntryClaims.findFirst({
        where: and(
          eq(resultEntryClaims.resultEntryId, validated.data.entryId),
          isNull(resultEntryClaims.deletedAt),
        ),
      });

      if (!concurrentClaim) {
        return {
          ok: false,
          error: 'Claim could not be confirmed due to a concurrent update. Please retry.',
          code: 'CONFLICT',
        };
      }

      if (
        concurrentClaim.status === 'linked' &&
        concurrentClaim.linkedUserId &&
        concurrentClaim.linkedUserId !== authContext.user.id
      ) {
        return {
          ok: false,
          error: CLAIM_ALREADY_LINKED_ERROR,
          code: 'CONFLICT',
        };
      }

      if (concurrentClaim.status === 'rejected') {
        return {
          ok: false,
          error: CLAIM_NOT_ELIGIBLE_ERROR,
          code: 'CONFLICT',
        };
      }

      return {
        ok: true,
        data: buildClaimSubmissionResponse({
          claimId: concurrentClaim.id,
          entryId: validated.data.entryId,
          resultVersionId: candidate.resultVersionId,
          status: concurrentClaim.status,
          confidenceScore: fromConfidenceBasisPoints(concurrentClaim.confidenceBasisPoints),
          message: toExistingClaimMessage({
            claim: concurrentClaim,
            userId: authContext.user.id,
          }),
        }),
      };
    }

    throw error;
  }
});

export const requestRunnerResultCorrection = withAuthenticatedUser<
  ActionResult<ResultCorrectionRequestSubmissionResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: RequestRunnerResultCorrectionInput) => {
  const validated = requestRunnerResultCorrectionSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const entry = await db.query.resultEntries.findFirst({
    where: and(eq(resultEntries.id, validated.data.entryId), isNull(resultEntries.deletedAt)),
    columns: {
      id: true,
      resultVersionId: true,
      userId: true,
    },
  });

  if (!entry) {
    return { ok: false, error: 'Result entry not found', code: 'NOT_FOUND' };
  }

  const resultVersion = await db.query.resultVersions.findFirst({
    where: and(eq(resultVersions.id, entry.resultVersionId), isNull(resultVersions.deletedAt)),
    columns: {
      id: true,
      status: true,
      editionId: true,
    },
  });

  if (!resultVersion) {
    return { ok: false, error: 'Result version not found', code: 'NOT_FOUND' };
  }

  if (resultVersion.status !== 'official' && resultVersion.status !== 'corrected') {
    return {
      ok: false,
      error: RESULT_CORRECTION_INVALID_STATE_ERROR,
      code: 'INVALID_STATE',
    };
  }

  const canSubmitAsLinkedRunner = entry.userId === authContext.user.id;
  const isOrganizerContext =
    authContext.permissions.canManageEvents || authContext.permissions.canViewOrganizersDashboard;
  const canSubmitAsEligibleOrganizer = canSubmitAsLinkedRunner
    ? false
    : isOrganizerContext
      ? await assertCanWriteResultsForEdition(
          authContext.user.id,
          resultVersion.editionId,
          authContext.permissions.canManageEvents,
        )
      : false;

  if (!canSubmitAsLinkedRunner && !canSubmitAsEligibleOrganizer) {
    const organizationId = await resolveEditionOrganizationId(resultVersion.editionId);
    await logCorrectionAuthorizationDenied({
      action: 'results.correction.request.denied',
      actorUserId: authContext.user.id,
      entityType: 'result_entry',
      entityId: entry.id,
      organizationId,
      reason: 'actor_not_runner_owner_or_eligible_organizer',
      details: {
        resultVersionId: resultVersion.id,
        editionId: resultVersion.editionId,
      },
    });

    return {
      ok: false,
      error: isOrganizerContext
        ? RESULT_CORRECTION_SUBMISSION_FORBIDDEN_ERROR
        : RESULT_CORRECTION_FORBIDDEN_ERROR,
      code: 'FORBIDDEN',
    };
  }

  const [createdRequest] = await db
    .insert(resultCorrectionRequests)
    .values({
      resultEntryId: entry.id,
      resultVersionId: resultVersion.id,
      requestedByUserId: authContext.user.id,
      status: 'pending',
      reason: validated.data.reason,
      requestContext: validated.data.requestContext,
      requestedAt: new Date(),
    })
    .returning();

  return {
    ok: true,
    data: {
      request: toResultCorrectionRequestRecord(createdRequest),
    },
  };
});

export const reviewResultCorrectionRequest = withAuthenticatedUser<
  ActionResult<ResultCorrectionRequestReviewResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: ReviewResultCorrectionRequestInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = reviewResultCorrectionRequestSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const request = await db.query.resultCorrectionRequests.findFirst({
    where: and(
      eq(resultCorrectionRequests.id, validated.data.requestId),
      isNull(resultCorrectionRequests.deletedAt),
    ),
  });

  if (!request) {
    return { ok: false, error: 'Correction request not found', code: 'NOT_FOUND' };
  }

  const version = await db.query.resultVersions.findFirst({
    where: and(eq(resultVersions.id, request.resultVersionId), isNull(resultVersions.deletedAt)),
    columns: {
      editionId: true,
    },
  });
  if (!version) {
    return { ok: false, error: CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const organizationId = await resolveEditionOrganizationId(version.editionId);
  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    version.editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    await logCorrectionAuthorizationDenied({
      action: 'results.correction.review.denied',
      actorUserId: authContext.user.id,
      entityType: 'result_correction_request',
      entityId: request.id,
      organizationId,
      reason: 'actor_not_eligible_organizer_for_event',
      details: {
        editionId: version.editionId,
        requestedDecision: validated.data.decision,
      },
    });
    return { ok: false, error: RESULT_CORRECTION_REVIEW_FORBIDDEN_ERROR, code: 'FORBIDDEN' };
  }

  if (request.status !== 'pending') {
    return { ok: false, error: CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const reviewedAt = new Date();
  const nextStatus = validated.data.decision === 'approve' ? 'approved' : 'rejected';

  const [reviewedRequest] = await db
    .update(resultCorrectionRequests)
    .set({
      status: nextStatus,
      reviewedByUserId: authContext.user.id,
      reviewedAt,
      reviewDecisionNote: validated.data.reviewDecisionNote ?? null,
    })
    .where(
      and(
        eq(resultCorrectionRequests.id, request.id),
        eq(resultCorrectionRequests.status, 'pending'),
        isNull(resultCorrectionRequests.deletedAt),
      ),
    )
    .returning();

  if (!reviewedRequest) {
    return { ok: false, error: CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  if (nextStatus === 'approved') {
    const approvalAudit = await createAuditLog({
      organizationId,
      actorUserId: authContext.user.id,
      action: 'results.correction.review.approve',
      entityType: 'result_correction_request',
      entityId: reviewedRequest.id,
      before: {
        editionId: version.editionId,
        status: 'pending',
      },
      after: {
        editionId: version.editionId,
        status: reviewedRequest.status,
        sourceResultVersionId: reviewedRequest.resultVersionId,
        reviewedAt: reviewedRequest.reviewedAt?.toISOString() ?? null,
        reviewedByUserId: reviewedRequest.reviewedByUserId,
      },
    });

    if (!approvalAudit.ok) {
      return {
        ok: false,
        error: 'Failed to create audit log for correction approval',
        code: 'SERVER_ERROR',
      };
    }
  }

  return {
    ok: true,
    data: {
      request: toResultCorrectionRequestRecord(reviewedRequest),
    },
  };
});

export const publishApprovedCorrectionVersion = withAuthenticatedUser<
  ActionResult<ResultCorrectionPublicationResponse>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: PublishApprovedCorrectionVersionInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = publishApprovedCorrectionVersionSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const request = await db.query.resultCorrectionRequests.findFirst({
    where: and(
      eq(resultCorrectionRequests.id, validated.data.requestId),
      isNull(resultCorrectionRequests.deletedAt),
    ),
  });
  if (!request) {
    return { ok: false, error: 'Correction request not found', code: 'NOT_FOUND' };
  }

  if (request.status !== 'approved') {
    return {
      ok: false,
      error: CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR,
      code: 'INVALID_STATE',
    };
  }

  const requestContext = isRecord(request.requestContext) ? request.requestContext : {};
  if (getPublishedCorrectionResultVersionId(requestContext)) {
    return {
      ok: false,
      error: CORRECTION_REQUEST_ALREADY_PUBLISHED_ERROR,
      code: 'CONFLICT',
    };
  }

  const correctionPatch = readCorrectionPublicationPatch(requestContext);
  if (!correctionPatch) {
    return {
      ok: false,
      error: CORRECTION_PUBLICATION_PATCH_REQUIRED_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }

  const sourceVersion = await db.query.resultVersions.findFirst({
    where: and(eq(resultVersions.id, request.resultVersionId), isNull(resultVersions.deletedAt)),
  });
  if (!sourceVersion) {
    return {
      ok: false,
      error: CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR,
      code: 'INVALID_STATE',
    };
  }

  if (sourceVersion.status !== 'official' && sourceVersion.status !== 'corrected') {
    return {
      ok: false,
      error: CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR,
      code: 'INVALID_STATE',
    };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    sourceVersion.editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const editionOrganizationId = await resolveEditionOrganizationId(sourceVersion.editionId);

  const sourceEntries = await db.query.resultEntries.findMany({
    where: and(
      eq(resultEntries.resultVersionId, sourceVersion.id),
      isNull(resultEntries.deletedAt),
    ),
    orderBy: (table, { asc }) => [asc(table.createdAt), asc(table.id)],
  });

  if (sourceEntries.length === 0) {
    return {
      ok: false,
      error: CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR,
      code: 'INVALID_STATE',
    };
  }

  const sourceEntry = sourceEntries.find((entry) => entry.id === request.resultEntryId);
  if (!sourceEntry) {
    return {
      ok: false,
      error: CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR,
      code: 'INVALID_STATE',
    };
  }

  if (correctionPatch.distanceId !== undefined && correctionPatch.distanceId !== null) {
    const existingDistance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, correctionPatch.distanceId),
        eq(eventDistances.editionId, sourceVersion.editionId),
        isNull(eventDistances.deletedAt),
      ),
      columns: { id: true },
    });
    if (!existingDistance) {
      return {
        ok: false,
        error: 'Correction distance must belong to the same edition as the source version',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  const targetStatus = correctionPatch.status ?? sourceEntry.status;
  const targetFinishTimeMillis =
    targetStatus === 'finish'
      ? correctionPatch.finishTimeMillis !== undefined
        ? correctionPatch.finishTimeMillis
        : sourceEntry.finishTimeMillis
      : null;

  if (targetStatus === 'finish' && targetFinishTimeMillis === null) {
    return {
      ok: false,
      error: 'Correction publication requires a finish time for finish status',
      code: 'VALIDATION_ERROR',
    };
  }

  try {
    const publication = await db.transaction(async (tx) => {
      const latestVersion = await tx.query.resultVersions.findFirst({
        where: and(
          eq(resultVersions.editionId, sourceVersion.editionId),
          isNull(resultVersions.deletedAt),
        ),
        orderBy: (table, { desc }) => [desc(table.versionNumber)],
        columns: {
          id: true,
          versionNumber: true,
        },
      });

      const publicationTimestamp = new Date();

      const [draftCorrectionVersion] = await tx
        .insert(resultVersions)
        .values({
          editionId: sourceVersion.editionId,
          status: 'draft',
          source: 'correction',
          versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
          parentVersionId: sourceVersion.id,
          createdByUserId: authContext.user.id,
          sourceReference: `correction-request:${request.id}`,
          provenanceJson: {
            correctionPublication: {
              requestId: request.id,
              sourceResultVersionId: sourceVersion.id,
              publishedByUserId: authContext.user.id,
              publishedAt: publicationTimestamp.toISOString(),
            },
          },
        })
        .returning();

      for (const entry of sourceEntries) {
        const isCorrectionTarget = entry.id === request.resultEntryId;
        const entryStatus = isCorrectionTarget ? targetStatus : entry.status;
        const entryFinishTimeMillis = isCorrectionTarget
          ? targetFinishTimeMillis
          : entry.finishTimeMillis;

        const nextRawSourceData = isCorrectionTarget
          ? {
              ...(entry.rawSourceData ?? {}),
              correctionRequestId: request.id,
              correctionPublishedAt: publicationTimestamp.toISOString(),
            }
          : entry.rawSourceData;

        await tx.insert(resultEntries).values({
          resultVersionId: draftCorrectionVersion.id,
          distanceId: isCorrectionTarget
            ? correctionPatch.distanceId !== undefined
              ? correctionPatch.distanceId
              : entry.distanceId
            : entry.distanceId,
          userId: entry.userId,
          discipline: entry.discipline,
          runnerFullName: isCorrectionTarget
            ? correctionPatch.runnerFullName ?? entry.runnerFullName
            : entry.runnerFullName,
          bibNumber: isCorrectionTarget
            ? correctionPatch.bibNumber !== undefined
              ? correctionPatch.bibNumber
              : entry.bibNumber
            : entry.bibNumber,
          gender: isCorrectionTarget
            ? correctionPatch.gender !== undefined
              ? correctionPatch.gender
              : entry.gender
            : entry.gender,
          age: isCorrectionTarget
            ? correctionPatch.age !== undefined
              ? correctionPatch.age
              : entry.age
            : entry.age,
          status: entryStatus,
          finishTimeMillis: entryFinishTimeMillis,
          overallPlace: null,
          genderPlace: null,
          ageGroupPlace: null,
          identitySnapshot: entry.identitySnapshot,
          rawSourceData: nextRawSourceData,
        });
      }

      await deriveAndPersistDraftPlacements(draftCorrectionVersion.id, tx);

      const correctionVersionProvenance = {
        ...(draftCorrectionVersion.provenanceJson ?? {}),
        lifecycle: {
          from: 'draft',
          to: 'corrected',
          finalizedByUserId: authContext.user.id,
          finalizedAt: publicationTimestamp.toISOString(),
          transitionReason: 'correction_publication',
        },
      };

      const [correctedVersion] = await tx
        .update(resultVersions)
        .set({
          status: 'corrected',
          finalizedByUserId: authContext.user.id,
          finalizedAt: publicationTimestamp,
          provenanceJson: correctionVersionProvenance,
        })
        .where(
          and(
            eq(resultVersions.id, draftCorrectionVersion.id),
            eq(resultVersions.status, 'draft'),
            isNull(resultVersions.deletedAt),
          ),
        )
        .returning();

      if (!correctedVersion) {
        tx.rollback();
      }

      const nextRequestContext = {
        ...requestContext,
        publication: {
          publishedResultVersionId: correctedVersion.id,
          publishedAt: publicationTimestamp.toISOString(),
          publishedByUserId: authContext.user.id,
          sourceResultVersionId: sourceVersion.id,
        },
      };

      const [updatedRequest] = await tx
        .update(resultCorrectionRequests)
        .set({
          requestContext: nextRequestContext,
        })
        .where(
          and(
            eq(resultCorrectionRequests.id, request.id),
            eq(resultCorrectionRequests.status, 'approved'),
            isNull(resultCorrectionRequests.deletedAt),
          ),
        )
        .returning();

      if (!updatedRequest) {
        tx.rollback();
      }

      const correctionPublishAudit = await createAuditLog(
        {
          organizationId: editionOrganizationId,
          actorUserId: authContext.user.id,
          action: 'results.correction.publish',
          entityType: 'result_correction_request',
          entityId: updatedRequest.id,
          before: {
            editionId: sourceVersion.editionId,
            status: request.status,
            sourceResultVersionId: sourceVersion.id,
          },
          after: {
            editionId: sourceVersion.editionId,
            status: updatedRequest.status,
            sourceResultVersionId: sourceVersion.id,
            correctedResultVersionId: correctedVersion.id,
            publishedByUserId: authContext.user.id,
            publishedAt: publicationTimestamp.toISOString(),
          },
        },
        tx,
      );

      throwIfAuditLogFailed(correctionPublishAudit, 'results.correction.publish');

      return {
        correctedVersion,
        updatedRequest,
      };
    });

    const edition = await db.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, sourceVersion.editionId), isNull(eventEditions.deletedAt)),
      columns: { id: true },
      with: {
        series: {
          columns: {
            organizationId: true,
          },
        },
      },
    });

    revalidateTag(resultsEditionTag(sourceVersion.editionId), { expire: 0 });
    revalidateTag(resultsOfficialTag(sourceVersion.editionId), { expire: 0 });
    revalidateTag(rankingsNationalTag(), { expire: 0 });
    revalidateTag(rankingsRulesetCurrentTag(), { expire: 0 });
    if (edition?.series?.organizationId) {
      revalidateTag(rankingsOrganizerTag(edition.series.organizationId), { expire: 0 });
    }
    await revalidatePublicEventByEditionId(sourceVersion.editionId);

    return {
      ok: true,
      data: {
        request: toResultCorrectionRequestRecord(publication.updatedRequest),
        resultVersion: toResultVersionRecord(publication.correctedVersion),
        sourceResultVersionId: sourceVersion.id,
      },
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith(AUDIT_LOG_FAILURE_PREFIX)
    ) {
      return {
        ok: false,
        error: 'Failed to create audit log for correction publication',
        code: 'SERVER_ERROR',
      };
    }

    if (
      isUniqueConstraintViolation(error, [
        'result_versions_edition_version_idx',
        'result_entries_version_bib_unique_idx',
        'result_entries_version_name_no_bib_unique_idx',
      ])
    ) {
      return {
        ok: false,
        error: CORRECTION_PUBLICATION_FAILED_ERROR,
        code: 'CONFLICT',
      };
    }

    return {
      ok: false,
      error: CORRECTION_PUBLICATION_FAILED_ERROR,
      code: 'INVALID_STATE',
    };
  }
});

export const reviewRunnerResultClaim = withAuthenticatedUser<ActionResult<ResultClaimReviewResponse>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: ReviewRunnerResultClaimInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = reviewRunnerResultClaimSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  const claim = await db.query.resultEntryClaims.findFirst({
    where: and(eq(resultEntryClaims.id, validated.data.claimId), isNull(resultEntryClaims.deletedAt)),
  });
  if (!claim) {
    return { ok: false, error: 'Claim not found', code: 'NOT_FOUND' };
  }

  const entry = await db.query.resultEntries.findFirst({
    where: and(eq(resultEntries.id, claim.resultEntryId), isNull(resultEntries.deletedAt)),
    columns: { id: true, resultVersionId: true },
  });
  if (!entry) {
    return { ok: false, error: CLAIM_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const version = await db.query.resultVersions.findFirst({
    where: and(eq(resultVersions.id, entry.resultVersionId), isNull(resultVersions.deletedAt)),
    columns: { editionId: true },
  });
  if (!version) {
    return { ok: false, error: CLAIM_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const canWrite = await assertCanWriteResultsForEdition(
    authContext.user.id,
    version.editionId,
    authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  if (claim.status !== 'pending_review') {
    return { ok: false, error: CLAIM_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const nextStatus = validated.data.decision === 'approve' ? 'linked' : 'rejected';
  const now = new Date();
  const reviewContext = buildClaimReviewContext(validated.data);

  const [reviewedClaim] = await db
    .update(resultEntryClaims)
    .set({
      status: nextStatus,
      linkedUserId: nextStatus === 'linked' ? claim.requestedByUserId : null,
      reviewedByUserId: authContext.user.id,
      reviewedAt: now,
      reviewReason:
        validated.data.reviewReason ??
        (validated.data.decision === 'reject' ? 'organizer_rejected' : null),
      reviewContext,
    })
    .where(
      and(
        eq(resultEntryClaims.id, claim.id),
        eq(resultEntryClaims.status, 'pending_review'),
        isNull(resultEntryClaims.deletedAt),
      ),
    )
    .returning();

  if (!reviewedClaim) {
    return { ok: false, error: CLAIM_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  return {
    ok: true,
    data: {
      claimId: reviewedClaim.id,
      entryId: reviewedClaim.resultEntryId,
      resultVersionId: entry.resultVersionId,
      status: reviewedClaim.status,
      reviewedByUserId: reviewedClaim.reviewedByUserId,
      reviewedAt: reviewedClaim.reviewedAt,
      reviewReason: reviewedClaim.reviewReason,
      reviewContext: reviewedClaim.reviewContext ?? {},
    },
  };
});
