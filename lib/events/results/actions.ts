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
  discardResultDraftVersionSchema,
  finalizeResultVersionAttestationSchema,
  getRunnerResultClaimCandidatesSchema,
  importResultDraftRowsSchema,
  initializeResultIngestionSessionSchema,
  linkDraftResultEntryToUserSchema,
  publishApprovedCorrectionVersionSchema,
  reviewResultCorrectionRequestSchema,
  reviewRunnerResultClaimSchema,
  revokeRunnerResultClaimSchema,
  requestRunnerResultCorrectionSchema,
  upsertDraftResultEntrySchema,
  type ConfirmRunnerResultClaimInput,
  type CreateResultDraftVersionInput,
  type DiscardResultDraftVersionInput,
  type FinalizeResultVersionAttestationInput,
  type GetRunnerResultClaimCandidatesInput,
  type ImportResultDraftRowsInput,
  type InitializeResultIngestionSessionInput,
  type LinkDraftResultEntryToUserInput,
  type PublishApprovedCorrectionVersionInput,
  type RequestRunnerResultCorrectionInput,
  type ReviewResultCorrectionRequestInput,
  type ReviewRunnerResultClaimInput,
  type RevokeRunnerResultClaimInput,
  type UpsertDraftResultEntryInput,
} from '@/lib/events/results/schemas';
import {
  createResultDraftVersionWorkflow,
  discardResultDraftVersionWorkflow,
  initializeResultIngestionSessionWorkflow,
} from '@/lib/events/results/actions/ingestion';
import {
  importResultDraftRowsWorkflow,
  type ResultImportResponse,
} from '@/lib/events/results/actions/import';
import { finalizeResultVersionAttestationWorkflow } from '@/lib/events/results/actions/finalization';
import {
  confirmRunnerResultClaimWorkflow,
  getRunnerResultClaimCandidatesWorkflow,
  reviewRunnerResultClaimWorkflow,
  revokeRunnerResultClaimWorkflow,
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
  RESULT_ENTRY_BIB_UNIQUE_CONSTRAINTS,
} from '@/lib/events/results/shared/errors';
import { findConflictingNullDistanceBib } from '@/lib/events/results/shared/bib-uniqueness';
import { lockResultVersion } from '@/lib/events/results/shared/version-lock';
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
  client: ResultMutationClient = db,
): Promise<ResultVersionFinalizationGateSummary> {
  const rows = await client.query.resultEntries.findMany({
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
      distanceId: true,
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
      distanceId: row.distanceId,
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

export const importResultDraftRows = withAuthenticatedUser<ActionResult<ResultImportResponse>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: ImportResultDraftRowsInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = importResultDraftRowsSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return importResultDraftRowsWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
  });
});

export const discardResultDraftVersion = withAuthenticatedUser<
  ActionResult<{ resultVersionId: string }>
>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input: DiscardResultDraftVersionInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = discardResultDraftVersionSchema.safeParse(input);
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return discardResultDraftVersionWorkflow({
    authContext,
    input: validated.data,
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

  // Fast-fail hint only: the authoritative draft check runs again under the version lock
  // inside the transaction below. This out-of-transaction read just avoids the permission and
  // reference lookups for a version that is already clearly non-draft.
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

  // A distance-less bib is not covered by the partial unique index, so it is guarded in-app
  // under the version lock below (P2). Distanced bibs are still enforced by the DB index and
  // surface as a unique-violation in the catch.
  const trimmedBib = bibNumber?.trim() || null;

  const duplicateEntryConflict = {
    ok: false,
    error: 'A draft entry with the same identity already exists in this version',
    code: 'CONFLICT',
  } as const;

  try {
    // Lock the version and re-check it is still an editable draft INSIDE the transaction, then
    // write and derive placements under that lock. This closes the time-of-check/time-of-use
    // race where finalization could flip the version to `official` between the out-of-
    // transaction status read above and the write (P1).
    return await db.transaction(async (tx): Promise<ActionResult<ResultEntryRecord>> => {
      const locked = await lockResultVersion(tx, resultVersionId);
      if (!locked) {
        return { ok: false, error: 'Result version not found', code: 'NOT_FOUND' };
      }
      if (locked.status !== 'draft') {
        return { ok: false, error: OFFICIAL_IMMUTABLE_MUTATION_ERROR, code: 'INVALID_STATE' };
      }

      if (entryId) {
        const existingEntry = await tx.query.resultEntries.findFirst({
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

        if (
          trimmedBib &&
          !distanceId &&
          (await findConflictingNullDistanceBib(tx, {
            resultVersionId,
            bibNumbers: [trimmedBib],
            excludeEntryId: entryId,
          }))
        ) {
          return duplicateEntryConflict;
        }

        const [updatedEntry] = await tx
          .update(resultEntries)
          .set({
            ...baseEntryValues,
            // Preserve existing verified link unless explicitly matching the same user.
            userId: existingEntry.userId ?? userId ?? null,
          })
          .where(and(eq(resultEntries.id, entryId), eq(resultEntries.resultVersionId, resultVersionId)))
          .returning();

        const derivedPlacements = await deriveAndPersistDraftPlacements(resultVersionId, tx);
        const derivedPlacement = derivedPlacements[updatedEntry.id];
        const nextRow = derivedPlacement ? { ...updatedEntry, ...derivedPlacement } : updatedEntry;
        return { ok: true, data: toResultEntryRecord(nextRow) };
      }

      if (
        trimmedBib &&
        !distanceId &&
        (await findConflictingNullDistanceBib(tx, {
          resultVersionId,
          bibNumbers: [trimmedBib],
        }))
      ) {
        return duplicateEntryConflict;
      }

      const [createdEntry] = await tx
        .insert(resultEntries)
        .values({ resultVersionId, ...baseEntryValues, userId: userId ?? null })
        .returning();

      const derivedPlacements = await deriveAndPersistDraftPlacements(resultVersionId, tx);
      const derivedPlacement = derivedPlacements[createdEntry.id];
      const nextRow = derivedPlacement ? { ...createdEntry, ...derivedPlacement } : createdEntry;
      return { ok: true, data: toResultEntryRecord(nextRow) };
    });
  } catch (error) {
    if (isUniqueConstraintViolation(error, RESULT_ENTRY_BIB_UNIQUE_CONSTRAINTS)) {
      return duplicateEntryConflict;
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

  // Fast-fail hint only: re-checked authoritatively under the version lock inside the
  // transaction below.
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

  // Lock the version and re-check it is still a draft INSIDE the transaction before linking, so
  // an identity link can never land on a version finalization just flipped to `official` (P1).
  // The CAS on `userId` in the update predicate still guards concurrent links to the same entry.
  return await db.transaction(async (tx): Promise<ActionResult<ResultEntryRecord>> => {
    const locked = await lockResultVersion(tx, resultVersionId);
    if (!locked || locked.status !== 'draft') {
      return { ok: false, error: OFFICIAL_IMMUTABLE_LINK_ERROR, code: 'INVALID_STATE' };
    }

    const existingEntry = await tx.query.resultEntries.findFirst({
      where: and(
        eq(resultEntries.id, entryId),
        eq(resultEntries.resultVersionId, resultVersionId),
        isNull(resultEntries.deletedAt),
      ),
    });

    if (!existingEntry) {
      return { ok: false, error: 'Result entry not found for draft version', code: 'NOT_FOUND' };
    }

    if (existingEntry.userId && existingEntry.userId !== targetUserId) {
      return { ok: false, error: LINK_CONFLICT_ERROR, code: 'CONFLICT' };
    }

    if (existingEntry.userId === targetUserId) {
      return { ok: true, data: toResultEntryRecord(existingEntry) };
    }

    const existingUser = await tx.query.users.findFirst({
      where: and(eq(users.id, targetUserId), isNull(users.deletedAt)),
      columns: { id: true },
    });
    if (!existingUser) {
      return { ok: false, error: LINKED_USER_NOT_FOUND_ERROR, code: 'VALIDATION_ERROR' };
    }

    const [linkedEntry] = await tx
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
      // The CAS predicate failed: a claim-approval path (which does not take the version lock)
      // may have assigned a different owner. Disambiguate a conflict from a vanished entry.
      const refreshedEntry = await tx.query.resultEntries.findFirst({
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

export const revokeRunnerResultClaim = withAuthenticatedUser<ActionResult<ResultClaimReviewResponse>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext, input?: RevokeRunnerResultClaimInput) => {
  const accessError = checkEventsAccess(authContext);
  if (accessError) return { ok: false, ...accessError };

  const validated = revokeRunnerResultClaimSchema.safeParse(input ?? {});
  if (!validated.success) {
    return { ok: false, error: validated.error.issues[0].message, code: 'VALIDATION_ERROR' };
  }

  return revokeRunnerResultClaimWorkflow({
    authContext,
    input: validated.data,
    assertCanWriteResultsForEdition,
  });
});
