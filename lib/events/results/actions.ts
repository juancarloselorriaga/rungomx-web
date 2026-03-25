'use server';

import { and, eq, isNull, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventDistances,
  resultEntries,
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
  createResultDraftVersionWorkflow,
  initializeResultIngestionSessionWorkflow,
} from '@/lib/events/results/actions/ingestion';
import { finalizeResultVersionAttestationWorkflow } from '@/lib/events/results/actions/finalization';
import {
  confirmRunnerResultClaimWorkflow,
  getRunnerResultClaimCandidatesWorkflow,
  reviewRunnerResultClaimWorkflow,
} from '@/lib/events/results/actions/claims';
import {
  publishApprovedCorrectionVersionWorkflow,
  requestRunnerResultCorrectionWorkflow,
  reviewResultCorrectionRequestWorkflow,
} from '@/lib/events/results/actions/corrections';
import {
  isUniqueConstraintViolation,
  LINK_CONFLICT_ERROR,
  LINKED_USER_NOT_FOUND_ERROR,
  OFFICIAL_IMMUTABLE_LINK_ERROR,
  OFFICIAL_IMMUTABLE_MUTATION_ERROR,
} from '@/lib/events/results/shared/errors';
import { deriveResultPlacements } from '@/lib/events/results/derivation/placement';
import { toResultEntryRecord } from '@/lib/events/results/shared/mappers';
import type {
  ResultClaimCandidateResponse,
  ResultClaimReviewResponse,
  ResultClaimSubmissionResponse,
  ResultCorrectionPublicationResponse,
  ResultCorrectionRequestSubmissionResponse,
  ResultCorrectionRequestReviewResponse,
  ResultEntryRecord,
  ResultIngestionSessionInitResponse,
  ResultVersionFinalizationGateSummary,
  ResultVersionFinalizationResponse,
  ResultVersionRecord,
} from '@/lib/events/results/types';
import { checkEventsAccess, type ActionResult } from '@/lib/events/shared';
import { canUserAccessEvent, requireOrgPermission } from '@/lib/organizations/permissions';

const RESULT_VERSION_CREATE_RETRY_LIMIT = 3;

type ResultDraftSyncState = 'synced' | 'pending_sync' | 'conflict';
type ResultMutationClient = Pick<typeof db, 'query' | 'update'>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toDraftSyncState(rawSourceData: unknown): ResultDraftSyncState {
  if (!isRecord(rawSourceData)) return 'synced';
  const value = rawSourceData.syncStatus;
  if (value === 'pending_sync' || value === 'conflict') return value;
  return 'synced';
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
  return createResultDraftVersionWorkflow({
    authContext,
    input: {
      editionId,
      source,
      parentResultVersionId,
      sourceReference,
      sourceFileChecksum,
    },
    retryLimit: RESULT_VERSION_CREATE_RETRY_LIMIT,
    assertCanWriteResultsForEdition,
  });
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
  return initializeResultIngestionSessionWorkflow({
    authContext,
    input: {
      editionId,
      sourceLane,
      sourceReference,
      sourceFileChecksum,
    },
    retryLimit: RESULT_VERSION_CREATE_RETRY_LIMIT,
    assertCanWriteResultsForEdition,
  });
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

  return finalizeResultVersionAttestationWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
    buildDraftFinalizationGateSummary,
    deriveAndPersistDraftPlacements,
  });
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

  return getRunnerResultClaimCandidatesWorkflow({
    authContext,
    input: validated.data,
  });
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

  return confirmRunnerResultClaimWorkflow({
    authContext,
    input: validated.data,
  });
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

  return requestRunnerResultCorrectionWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
  });
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

  return reviewResultCorrectionRequestWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
  });
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

  return publishApprovedCorrectionVersionWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
    deriveAndPersistDraftPlacements,
  });
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

  return reviewRunnerResultClaimWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
  });
});
