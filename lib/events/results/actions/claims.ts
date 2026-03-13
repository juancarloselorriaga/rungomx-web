import { and, eq, isNull } from 'drizzle-orm';

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { db } from '@/db';
import { resultEntries, resultEntryClaims, resultVersions } from '@/db/schema';
import {
  CLAIM_ALREADY_LINKED_ERROR,
  CLAIM_LINKED_MESSAGE,
  CLAIM_NOT_ELIGIBLE_ERROR,
  CLAIM_NOT_REVIEWABLE_ERROR,
  CLAIM_PENDING_REVIEW_MESSAGE,
  CLAIM_PENDING_REVIEW_STEPS,
  DEFAULT_CLAIM_EMPTY_STATE,
  RESULT_ENTRY_CLAIMS_ENTRY_UNIQUE_IDX,
  isUniqueConstraintViolation,
} from '@/lib/events/results/shared/errors';
import {
  findUnclaimedResultClaimCandidateByEntryId,
  findUnclaimedResultClaimCandidates,
} from '@/lib/events/results/queries';
import type {
  ConfirmRunnerResultClaimInput,
  GetRunnerResultClaimCandidatesInput,
  ReviewRunnerResultClaimInput,
} from '@/lib/events/results/schemas';
import type {
  ResultClaimCandidate,
  ResultClaimCandidateResponse,
  ResultClaimReviewResponse,
  ResultClaimSubmissionResponse,
} from '@/lib/events/results/types';
import type { ActionResult } from '@/lib/events/shared';

const CLAIM_CANDIDATE_QUERY_MULTIPLIER = 4;
const CLAIM_CANDIDATE_QUERY_LIMIT_MAX = 80;
const DEFAULT_SAFE_CLAIM_CONFIDENCE = 0.65;
const DEFAULT_AUTO_LINK_CLAIM_CONFIDENCE = 0.8;
const CLAIM_REVIEW_REASON_LOW_CONFIDENCE = 'low_confidence_match';

type AssertCanWriteResultsForEdition = (
  userId: string,
  editionId: string,
  canManageEvents: boolean,
) => Promise<boolean>;

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

export async function getRunnerResultClaimCandidatesWorkflow(params: {
  authContext: AuthenticatedContext;
  input: GetRunnerResultClaimCandidatesInput;
}): Promise<ActionResult<ResultClaimCandidateResponse>> {
  const runnerName = params.authContext.user.name?.trim() ?? '';
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

  const limit = params.input.limit ?? 10;
  const queryLimit = Math.min(
    limit * CLAIM_CANDIDATE_QUERY_MULTIPLIER,
    CLAIM_CANDIDATE_QUERY_LIMIT_MAX,
  );

  const rawCandidates = await findUnclaimedResultClaimCandidates({
    runnerName,
    runnerNameTokens: nameTokens,
    limit: queryLimit,
  });

  const normalizedRunnerName = normalizeName(runnerName);
  const normalizedRunnerGender = normalizeGender(params.authContext.profile?.gender);
  const runnerDateOfBirth = params.authContext.profile?.dateOfBirth ?? null;

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

  const minimumConfidence = params.input.minimumConfidence ?? DEFAULT_SAFE_CLAIM_CONFIDENCE;
  const safeCandidates = scoredCandidates
    .filter((candidate) => candidate.confidenceScore >= minimumConfidence)
    .slice(0, limit);

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
}

export async function confirmRunnerResultClaimWorkflow(params: {
  authContext: AuthenticatedContext;
  input: ConfirmRunnerResultClaimInput;
}): Promise<ActionResult<ResultClaimSubmissionResponse>> {
  const runnerName = params.authContext.user.name?.trim() ?? '';
  if (!runnerName) {
    return {
      ok: false,
      error: 'Runner profile name is required to confirm a result claim',
      code: 'VALIDATION_ERROR',
    };
  }

  const requestedEntry = await db.query.resultEntries.findFirst({
    where: and(eq(resultEntries.id, params.input.entryId), isNull(resultEntries.deletedAt)),
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
      eq(resultEntryClaims.resultEntryId, params.input.entryId),
      isNull(resultEntryClaims.deletedAt),
    ),
  });

  if (existingClaim) {
    if (existingClaim.status === 'linked') {
      if (existingClaim.linkedUserId === params.authContext.user.id) {
        return {
          ok: true,
          data: buildClaimSubmissionResponse({
            claimId: existingClaim.id,
            entryId: params.input.entryId,
            resultVersionId: requestedEntry.resultVersionId,
            status: existingClaim.status,
            confidenceScore: fromConfidenceBasisPoints(existingClaim.confidenceBasisPoints),
            message: toExistingClaimMessage({
              claim: existingClaim,
              userId: params.authContext.user.id,
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
          entryId: params.input.entryId,
          resultVersionId: requestedEntry.resultVersionId,
          status: 'pending_review',
          confidenceScore: fromConfidenceBasisPoints(existingClaim.confidenceBasisPoints),
          message: toExistingClaimMessage({
            claim: existingClaim,
            userId: params.authContext.user.id,
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
    entryId: params.input.entryId,
    runnerName,
    runnerNameTokens,
  });

  if (!candidate) {
    return { ok: false, error: CLAIM_NOT_ELIGIBLE_ERROR, code: 'NOT_FOUND' };
  }

  const scoredCandidate = scoreClaimCandidate(candidate, {
    normalizedName: normalizeName(runnerName),
    nameTokens: runnerNameTokens,
    normalizedGender: normalizeGender(params.authContext.profile?.gender),
    dateOfBirth: params.authContext.profile?.dateOfBirth ?? null,
  });

  const shouldAutoLink = scoredCandidate.confidenceScore >= DEFAULT_AUTO_LINK_CLAIM_CONFIDENCE;
  const status = shouldAutoLink ? 'linked' : 'pending_review';
  const confidenceBasisPoints = toConfidenceBasisPoints(scoredCandidate.confidenceScore);

  if (existingClaim?.status === 'rejected') {
    const [reopenedClaim] = await db
      .update(resultEntryClaims)
      .set({
        requestedByUserId: params.authContext.user.id,
        linkedUserId: shouldAutoLink ? params.authContext.user.id : null,
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
          entryId: params.input.entryId,
          resultVersionId: candidate.resultVersionId,
          status,
          confidenceScore: scoredCandidate.confidenceScore,
        }),
      };
    }

    const concurrentClaim = await db.query.resultEntryClaims.findFirst({
      where: and(
        eq(resultEntryClaims.resultEntryId, params.input.entryId),
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
      concurrentClaim.linkedUserId !== params.authContext.user.id
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
        entryId: params.input.entryId,
        resultVersionId: candidate.resultVersionId,
        status: concurrentClaim.status,
        confidenceScore: fromConfidenceBasisPoints(concurrentClaim.confidenceBasisPoints),
        message: toExistingClaimMessage({
          claim: concurrentClaim,
          userId: params.authContext.user.id,
        }),
      }),
    };
  }

  try {
    const [createdClaim] = await db
      .insert(resultEntryClaims)
      .values({
        resultEntryId: params.input.entryId,
        requestedByUserId: params.authContext.user.id,
        linkedUserId: shouldAutoLink ? params.authContext.user.id : null,
        status,
        confidenceBasisPoints,
        reviewReason: shouldAutoLink ? null : CLAIM_REVIEW_REASON_LOW_CONFIDENCE,
      })
      .returning();

    return {
      ok: true,
      data: buildClaimSubmissionResponse({
        claimId: createdClaim.id,
        entryId: params.input.entryId,
        resultVersionId: candidate.resultVersionId,
        status,
        confidenceScore: scoredCandidate.confidenceScore,
      }),
    };
  } catch (error) {
    if (isUniqueConstraintViolation(error, [RESULT_ENTRY_CLAIMS_ENTRY_UNIQUE_IDX])) {
      const concurrentClaim = await db.query.resultEntryClaims.findFirst({
        where: and(
          eq(resultEntryClaims.resultEntryId, params.input.entryId),
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
        concurrentClaim.linkedUserId !== params.authContext.user.id
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
          entryId: params.input.entryId,
          resultVersionId: candidate.resultVersionId,
          status: concurrentClaim.status,
          confidenceScore: fromConfidenceBasisPoints(concurrentClaim.confidenceBasisPoints),
          message: toExistingClaimMessage({
            claim: concurrentClaim,
            userId: params.authContext.user.id,
          }),
        }),
      };
    }

    throw error;
  }
}

export async function reviewRunnerResultClaimWorkflow(params: {
  authContext: AuthenticatedContext;
  input: ReviewRunnerResultClaimInput;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
}): Promise<ActionResult<ResultClaimReviewResponse>> {
  const claim = await db.query.resultEntryClaims.findFirst({
    where: and(eq(resultEntryClaims.id, params.input.claimId), isNull(resultEntryClaims.deletedAt)),
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

  const canWrite = await params.assertCanWriteResultsForEdition(
    params.authContext.user.id,
    version.editionId,
    params.authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  if (claim.status !== 'pending_review') {
    return { ok: false, error: CLAIM_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const nextStatus = params.input.decision === 'approve' ? 'linked' : 'rejected';
  const now = new Date();
  const reviewContext = buildClaimReviewContext(params.input);

  const [reviewedClaim] = await db
    .update(resultEntryClaims)
    .set({
      status: nextStatus,
      linkedUserId: nextStatus === 'linked' ? claim.requestedByUserId : null,
      reviewedByUserId: params.authContext.user.id,
      reviewedAt: now,
      reviewReason:
        params.input.reviewReason ??
        (params.input.decision === 'reject' ? 'organizer_rejected' : null),
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
}
