import { and, eq, isNull } from 'drizzle-orm';

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { db } from '@/db';
import { eventEditions, resultIngestionSessions, resultVersions } from '@/db/schema';
import {
  AUDIT_LOG_FAILURE_PREFIX,
  RESULT_INGESTION_SESSIONS_VERSION_UNIQUE_IDX,
  isUniqueConstraintViolation,
} from '@/lib/events/results/shared/errors';
import { createResultsIngestionInitializeAudit, throwIfAuditLogFailed } from '@/lib/events/results/shared/audit';
import { toResultVersionRecord } from '@/lib/events/results/shared/mappers';
import type {
  CreateResultDraftVersionInput,
  InitializeResultIngestionSessionInput,
} from '@/lib/events/results/schemas';
import type {
  ResultIngestionSessionInitResponse,
  ResultIngestionSessionRecord,
  ResultVersionRecord,
} from '@/lib/events/results/types';
import type { ActionResult } from '@/lib/events/shared';

type AssertCanWriteResultsForEdition = (
  userId: string,
  editionId: string,
  canManageEvents: boolean,
) => Promise<boolean>;

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

export async function createResultDraftVersionWorkflow(params: {
  authContext: AuthenticatedContext;
  input: CreateResultDraftVersionInput;
  retryLimit: number;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
}): Promise<ActionResult<ResultVersionRecord>> {
  const { editionId, source, parentResultVersionId, sourceReference, sourceFileChecksum } =
    params.input;

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
  });

  if (!edition) {
    return { ok: false, error: 'Event edition not found', code: 'NOT_FOUND' };
  }

  const canWrite = await params.assertCanWriteResultsForEdition(
    params.authContext.user.id,
    editionId,
    params.authContext.permissions.canManageEvents,
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

  for (let attempt = 0; attempt < params.retryLimit; attempt += 1) {
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
          createdByUserId: params.authContext.user.id,
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
      if (isVersionConflict && attempt < params.retryLimit - 1) {
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
}

export async function initializeResultIngestionSessionWorkflow(params: {
  authContext: AuthenticatedContext;
  input: InitializeResultIngestionSessionInput;
  retryLimit: number;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
}): Promise<ActionResult<ResultIngestionSessionInitResponse>> {
  const { editionId, sourceLane, sourceReference, sourceFileChecksum } = params.input;

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

  const canWrite = await params.assertCanWriteResultsForEdition(
    params.authContext.user.id,
    editionId,
    params.authContext.permissions.canManageEvents,
  );
  if (!canWrite) {
    return { ok: false, error: 'Permission denied', code: 'FORBIDDEN' };
  }

  for (let attempt = 0; attempt < params.retryLimit; attempt += 1) {
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
            createdByUserId: params.authContext.user.id,
            sourceReference: sourceReference ?? null,
            sourceFileChecksum: sourceFileChecksum ?? null,
            provenanceJson: {
              sourceLane,
              startedByUserId: params.authContext.user.id,
            },
          })
          .returning();

        const [nextSession] = await tx
          .insert(resultIngestionSessions)
          .values({
            editionId,
            resultVersionId: nextVersion.id,
            sourceLane,
            startedByUserId: params.authContext.user.id,
            sourceReference: sourceReference ?? null,
            sourceFileChecksum: sourceFileChecksum ?? null,
            provenanceJson: {
              sourceLane,
              startedByUserId: params.authContext.user.id,
            },
          })
          .returning();

        const auditResult = await createResultsIngestionInitializeAudit(
          {
            organizationId: edition.series?.organizationId ?? null,
            actorUserId: params.authContext.user.id,
            entityId: nextSession.id,
            editionId,
            resultVersionId: nextVersion.id,
            sourceLane,
            sourceReference: nextSession.sourceReference,
            sourceFileChecksum: nextSession.sourceFileChecksum,
            startedAtIso: nextSession.startedAt.toISOString(),
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
      if (isVersionConflict && attempt < params.retryLimit - 1) {
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
}
