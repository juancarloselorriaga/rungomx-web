import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  resultCorrectionRequests,
  resultEntries,
  resultVersions,
} from '@/db/schema';
import {
  AUDIT_LOG_FAILURE_PREFIX,
  CORRECTION_PUBLICATION_FAILED_ERROR,
  CORRECTION_PUBLICATION_PATCH_REQUIRED_ERROR,
  CORRECTION_REQUEST_ALREADY_PUBLISHED_ERROR,
  CORRECTION_REQUEST_NOT_PUBLISHABLE_ERROR,
  CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR,
  RESULT_CORRECTION_FORBIDDEN_ERROR,
  RESULT_CORRECTION_INVALID_STATE_ERROR,
  RESULT_CORRECTION_REVIEW_FORBIDDEN_ERROR,
  RESULT_CORRECTION_SUBMISSION_FORBIDDEN_ERROR,
  isUniqueConstraintViolation,
} from '@/lib/events/results/shared/errors';
import {
  createResultsCorrectionApprovalAudit,
  createResultsCorrectionPublishAudit,
  logCorrectionAuthorizationDenied,
  throwIfAuditLogFailed,
} from '@/lib/events/results/shared/audit';
import { revalidateResultsPublicationArtifacts } from '@/lib/events/results/shared/cache';
import { toResultVersionRecord } from '@/lib/events/results/shared/mappers';
import type {
  PublishApprovedCorrectionVersionInput,
  RequestRunnerResultCorrectionInput,
  ReviewResultCorrectionRequestInput,
} from '@/lib/events/results/schemas';
import type {
  ResultCorrectionPublicationResponse,
  ResultCorrectionRequestRecord,
  ResultCorrectionRequestSubmissionResponse,
  ResultCorrectionRequestReviewResponse,
} from '@/lib/events/results/types';
import type { ActionResult } from '@/lib/events/shared';

type ResultMutationClient = Pick<typeof db, 'query' | 'update'>;

type AssertCanWriteResultsForEdition = (
  userId: string,
  editionId: string,
  canManageEvents: boolean,
) => Promise<boolean>;

type DeriveAndPersistDraftPlacements = (
  resultVersionId: string,
  mutationClient?: ResultMutationClient,
) => Promise<unknown>;

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

export async function requestRunnerResultCorrectionWorkflow(params: {
  authContext: AuthenticatedContext;
  input: RequestRunnerResultCorrectionInput;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
}): Promise<ActionResult<ResultCorrectionRequestSubmissionResponse>> {
  const entry = await db.query.resultEntries.findFirst({
    where: and(eq(resultEntries.id, params.input.entryId), isNull(resultEntries.deletedAt)),
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

  const canSubmitAsLinkedRunner = entry.userId === params.authContext.user.id;
  const isOrganizerContext =
    params.authContext.permissions.canManageEvents ||
    params.authContext.permissions.canViewOrganizersDashboard;
  const canSubmitAsEligibleOrganizer = canSubmitAsLinkedRunner
    ? false
    : isOrganizerContext
      ? await params.assertCanWriteResultsForEdition(
          params.authContext.user.id,
          resultVersion.editionId,
          params.authContext.permissions.canManageEvents,
        )
      : false;

  if (!canSubmitAsLinkedRunner && !canSubmitAsEligibleOrganizer) {
    const organizationId = await resolveEditionOrganizationId(resultVersion.editionId);
    await logCorrectionAuthorizationDenied({
      action: 'results.correction.request.denied',
      actorUserId: params.authContext.user.id,
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
      requestedByUserId: params.authContext.user.id,
      status: 'pending',
      reason: params.input.reason,
      requestContext: params.input.requestContext,
      requestedAt: new Date(),
    })
    .returning();

  return {
    ok: true,
    data: {
      request: toResultCorrectionRequestRecord(createdRequest),
    },
  };
}

export async function reviewResultCorrectionRequestWorkflow(params: {
  authContext: AuthenticatedContext;
  input: ReviewResultCorrectionRequestInput;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
}): Promise<ActionResult<ResultCorrectionRequestReviewResponse>> {
  const request = await db.query.resultCorrectionRequests.findFirst({
    where: and(
      eq(resultCorrectionRequests.id, params.input.requestId),
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
  const canWrite = await params.assertCanWriteResultsForEdition(
    params.authContext.user.id,
    version.editionId,
    params.authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    await logCorrectionAuthorizationDenied({
      action: 'results.correction.review.denied',
      actorUserId: params.authContext.user.id,
      entityType: 'result_correction_request',
      entityId: request.id,
      organizationId,
      reason: 'actor_not_eligible_organizer_for_event',
      details: {
        editionId: version.editionId,
        requestedDecision: params.input.decision,
      },
    });
    return { ok: false, error: RESULT_CORRECTION_REVIEW_FORBIDDEN_ERROR, code: 'FORBIDDEN' };
  }

  if (request.status !== 'pending') {
    return { ok: false, error: CORRECTION_REQUEST_NOT_REVIEWABLE_ERROR, code: 'INVALID_STATE' };
  }

  const reviewedAt = new Date();
  const nextStatus = params.input.decision === 'approve' ? 'approved' : 'rejected';

  const [reviewedRequest] = await db
    .update(resultCorrectionRequests)
    .set({
      status: nextStatus,
      reviewedByUserId: params.authContext.user.id,
      reviewedAt,
      reviewDecisionNote: params.input.reviewDecisionNote ?? null,
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
    const approvalAudit = await createResultsCorrectionApprovalAudit({
      organizationId,
      actorUserId: params.authContext.user.id,
      entityId: reviewedRequest.id,
      editionId: version.editionId,
      status: reviewedRequest.status,
      sourceResultVersionId: reviewedRequest.resultVersionId,
      reviewedAtIso: reviewedRequest.reviewedAt?.toISOString() ?? null,
      reviewedByUserId: reviewedRequest.reviewedByUserId,
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
}

export async function publishApprovedCorrectionVersionWorkflow(params: {
  authContext: AuthenticatedContext;
  input: PublishApprovedCorrectionVersionInput;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
  deriveAndPersistDraftPlacements: DeriveAndPersistDraftPlacements;
}): Promise<ActionResult<ResultCorrectionPublicationResponse>> {
  const request = await db.query.resultCorrectionRequests.findFirst({
    where: and(
      eq(resultCorrectionRequests.id, params.input.requestId),
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

  const canWrite = await params.assertCanWriteResultsForEdition(
    params.authContext.user.id,
    sourceVersion.editionId,
    params.authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  const editionOrganizationId = await resolveEditionOrganizationId(sourceVersion.editionId);

  const sourceEntries = await db.query.resultEntries.findMany({
    where: and(eq(resultEntries.resultVersionId, sourceVersion.id), isNull(resultEntries.deletedAt)),
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
          createdByUserId: params.authContext.user.id,
          sourceReference: `correction-request:${request.id}`,
          provenanceJson: {
            correctionPublication: {
              requestId: request.id,
              sourceResultVersionId: sourceVersion.id,
              publishedByUserId: params.authContext.user.id,
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

      await params.deriveAndPersistDraftPlacements(draftCorrectionVersion.id, tx);

      const correctionVersionProvenance = {
        ...(draftCorrectionVersion.provenanceJson ?? {}),
        lifecycle: {
          from: 'draft',
          to: 'corrected',
          finalizedByUserId: params.authContext.user.id,
          finalizedAt: publicationTimestamp.toISOString(),
          transitionReason: 'correction_publication',
        },
      };

      const [correctedVersion] = await tx
        .update(resultVersions)
        .set({
          status: 'corrected',
          finalizedByUserId: params.authContext.user.id,
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
          publishedByUserId: params.authContext.user.id,
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

      const correctionPublishAudit = await createResultsCorrectionPublishAudit(
        {
          organizationId: editionOrganizationId,
          actorUserId: params.authContext.user.id,
          entityId: updatedRequest.id,
          editionId: sourceVersion.editionId,
          previousStatus: request.status,
          nextStatus: updatedRequest.status,
          sourceResultVersionId: sourceVersion.id,
          correctedResultVersionId: correctedVersion.id,
          publishedByUserId: params.authContext.user.id,
          publishedAtIso: publicationTimestamp.toISOString(),
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

    await revalidateResultsPublicationArtifacts({
      editionId: sourceVersion.editionId,
      organizationId: edition?.series?.organizationId,
    });

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
}
