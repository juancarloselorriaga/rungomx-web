import { and, desc, eq, isNull } from 'drizzle-orm';

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { db } from '@/db';
import {
  eventDistances,
  eventEditions,
  resultEntries,
  resultIngestionSessions,
  resultVersions,
} from '@/db/schema';
import { RESULT_DISCIPLINES } from '@/lib/events/results/types';
import {
  createResultsIngestionInitializeAudit,
  throwIfAuditLogFailed,
} from '@/lib/events/results/shared/audit';
import { deriveResultPlacements } from '@/lib/events/results/derivation/placement';
import {
  AUDIT_LOG_FAILURE_PREFIX,
  IMPORT_BLOCKED_ERROR,
  isUniqueConstraintViolation,
} from '@/lib/events/results/shared/errors';
import { toResultVersionRecord } from '@/lib/events/results/shared/mappers';
import type { ImportResultDraftRowsInput } from '@/lib/events/results/schemas';
import type { ResultDiscipline, ResultVersionRecord } from '@/lib/events/results/types';
import type { ActionResult } from '@/lib/events/shared';

type AssertCanWriteResultsForEdition = (
  userId: string,
  editionId: string,
  canManageEvents: boolean,
) => Promise<boolean>;

const RESULT_VERSION_CREATE_RETRY_LIMIT = 3;

export type ResultImportRowIssue = {
  rowNumber: number;
  field: 'finishTimeMillis' | 'bibNumber';
  code: 'finish_time_required' | 'duplicate_bib';
};

export type ResultImportResponse = {
  resultVersion: ResultVersionRecord;
  importedRowCount: number;
};

const DISCIPLINE_SET = new Set<string>(RESULT_DISCIPLINES);

function resolveDiscipline(sportType: string | null | undefined): ResultDiscipline {
  // Series sport types and result disciplines share the same vocabulary; fall back to a
  // safe default only if a series predates the shared enum.
  return sportType && DISCIPLINE_SET.has(sportType)
    ? (sportType as ResultDiscipline)
    : 'trail_running';
}

// Authoritative server-side validation of the parsed rows. The client preview mirrors
// these rules, but the import action must never trust them (RES-16).
function collectBlockingIssues(
  rows: ImportResultDraftRowsInput['rows'],
): ResultImportRowIssue[] {
  const issues: ResultImportRowIssue[] = [];
  const seenBibs = new Set<string>();

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const status = row.status ?? 'finish';
    const finishTimeMillis = row.finishTimeMillis ?? null;

    if (status === 'finish' && (finishTimeMillis === null || finishTimeMillis <= 0)) {
      issues.push({ rowNumber, field: 'finishTimeMillis', code: 'finish_time_required' });
    }

    const bib = row.bibNumber?.trim();
    if (bib) {
      if (seenBibs.has(bib)) {
        issues.push({ rowNumber, field: 'bibNumber', code: 'duplicate_bib' });
      } else {
        seenBibs.add(bib);
      }
    }
  });

  return issues;
}

export async function importResultDraftRowsWorkflow(params: {
  authContext: AuthenticatedContext;
  input: ImportResultDraftRowsInput;
  assertCanWriteResultsForEdition: AssertCanWriteResultsForEdition;
}): Promise<ActionResult<ResultImportResponse>> {
  const { editionId, sourceLane, distanceId, sourceReference, sourceFileChecksum, rows } =
    params.input;

  const edition = await db.query.eventEditions.findFirst({
    where: and(eq(eventEditions.id, editionId), isNull(eventEditions.deletedAt)),
    columns: { id: true },
    with: {
      series: {
        columns: { organizationId: true, sportType: true },
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

  if (distanceId) {
    const distance = await db.query.eventDistances.findFirst({
      where: and(
        eq(eventDistances.id, distanceId),
        eq(eventDistances.editionId, editionId),
        isNull(eventDistances.deletedAt),
      ),
      columns: { id: true },
    });
    if (!distance) {
      return {
        ok: false,
        error: 'Distance must belong to the same edition as the import',
        code: 'VALIDATION_ERROR',
      };
    }
  }

  const blockingIssues = collectBlockingIssues(rows);
  if (blockingIssues.length > 0) {
    return {
      ok: false,
      error: IMPORT_BLOCKED_ERROR,
      code: 'VALIDATION_ERROR',
    };
  }

  const discipline = resolveDiscipline(edition.series?.sportType);
  const organizationId = edition.series?.organizationId ?? null;

  // An edition has at most ONE active official version, so all distances must accumulate in
  // ONE draft. Append to the existing draft when present; only create a new version (with an
  // ingestion session) when none exists yet. This keeps multi-distance editions on a single
  // version so the public page and rankings surface every distance.
  const importIntoVersion = async (versionId: string, isNewVersion: boolean, session?: {
    id: string;
    sourceReference: string | null;
    sourceFileChecksum: string | null;
    startedAt: Date;
  }) => {
    return db.transaction(async (tx) => {
      await tx.insert(resultEntries).values(
        rows.map((row) => ({
          resultVersionId: versionId,
          distanceId: distanceId ?? null,
          discipline,
          runnerFullName: row.runnerFullName,
          bibNumber: row.bibNumber ?? null,
          gender: row.gender ?? null,
          age: row.age ?? null,
          status: row.status ?? 'finish',
          finishTimeMillis: row.finishTimeMillis ?? null,
          overallPlace: null,
          genderPlace: null,
          ageGroupPlace: null,
          identitySnapshot: {},
          rawSourceData: { sourceLane },
        })),
      );

      // Re-derive placements over the WHOLE version (all distances) once (RES-2/RES-14).
      const versionRows = await tx.query.resultEntries.findMany({
        where: and(eq(resultEntries.resultVersionId, versionId), isNull(resultEntries.deletedAt)),
        columns: {
          id: true, distanceId: true, runnerFullName: true, bibNumber: true, status: true,
          finishTimeMillis: true, gender: true, age: true, identitySnapshot: true, rawSourceData: true,
        },
      });
      const derived = deriveResultPlacements(versionRows.map((row) => ({ ...row })));
      for (const row of versionRows) {
        const placement = derived.byEntryId[row.id];
        if (!placement) continue;
        await tx
          .update(resultEntries)
          .set({
            overallPlace: placement.overallPlace,
            genderPlace: placement.genderPlace,
            ageGroupPlace: placement.ageGroupPlace,
          })
          .where(eq(resultEntries.id, row.id));
      }

      if (isNewVersion && session) {
        const audit = await createResultsIngestionInitializeAudit(
          {
            organizationId,
            actorUserId: params.authContext.user.id,
            entityId: session.id,
            editionId,
            resultVersionId: versionId,
            sourceLane,
            sourceReference: session.sourceReference,
            sourceFileChecksum: session.sourceFileChecksum,
            startedAtIso: session.startedAt.toISOString(),
          },
          tx,
        );
        throwIfAuditLogFailed(audit, 'results.ingestion.initialize');
      }
    });
  };

  const handleImportError = (error: unknown): ActionResult<ResultImportResponse> | null => {
    if (error instanceof Error && error.message.startsWith(AUDIT_LOG_FAILURE_PREFIX)) {
      return { ok: false, error: 'Failed to create audit log for results import', code: 'SERVER_ERROR' };
    }
    if (
      isUniqueConstraintViolation(error, [
        'result_entries_version_distance_bib_unique_idx',
        'result_entries_version_nodistance_bib_unique_idx',
      ])
    ) {
      return { ok: false, error: IMPORT_BLOCKED_ERROR, code: 'CONFLICT' };
    }
    return null;
  };

  const existingDraft = await db.query.resultVersions.findFirst({
    where: and(
      eq(resultVersions.editionId, editionId),
      eq(resultVersions.status, 'draft'),
      isNull(resultVersions.deletedAt),
    ),
    orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
    columns: { id: true },
  });

  if (existingDraft) {
    try {
      await importIntoVersion(existingDraft.id, false);
      const version = await db.query.resultVersions.findFirst({
        where: eq(resultVersions.id, existingDraft.id),
      });
      return {
        ok: true,
        data: { resultVersion: toResultVersionRecord(version!), importedRowCount: rows.length },
      };
    } catch (error) {
      const mapped = handleImportError(error);
      if (mapped) return mapped;
      throw error;
    }
  }

  // No draft yet: create a new version + ingestion session, retrying on version-number races.
  for (let attempt = 0; attempt < RESULT_VERSION_CREATE_RETRY_LIMIT; attempt += 1) {
    const latestVersion = await db.query.resultVersions.findFirst({
      where: and(eq(resultVersions.editionId, editionId), isNull(resultVersions.deletedAt)),
      orderBy: [desc(resultVersions.versionNumber)],
      columns: { versionNumber: true },
    });

    let versionId: string;
    let session: { id: string; sourceReference: string | null; sourceFileChecksum: string | null; startedAt: Date };
    try {
      const created = await db.transaction(async (tx) => {
        const [version] = await tx
          .insert(resultVersions)
          .values({
            editionId,
            status: 'draft',
            source: sourceLane,
            versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
            createdByUserId: params.authContext.user.id,
            sourceReference: sourceReference ?? null,
            sourceFileChecksum: sourceFileChecksum ?? null,
            provenanceJson: {
              sourceLane,
              importedByUserId: params.authContext.user.id,
              importedRowCount: rows.length,
            },
          })
          .returning();
        const [newSession] = await tx
          .insert(resultIngestionSessions)
          .values({
            editionId,
            resultVersionId: version.id,
            sourceLane,
            startedByUserId: params.authContext.user.id,
            sourceReference: sourceReference ?? null,
            sourceFileChecksum: sourceFileChecksum ?? null,
            provenanceJson: { sourceLane, importedRowCount: rows.length },
          })
          .returning();
        return { version, session: newSession };
      });
      versionId = created.version.id;
      session = created.session;
    } catch (error) {
      const isVersionConflict = isUniqueConstraintViolation(error, [
        'result_versions_edition_version_idx',
      ]);
      if (isVersionConflict && attempt < RESULT_VERSION_CREATE_RETRY_LIMIT - 1) continue;
      if (isVersionConflict) {
        return { ok: false, error: 'Could not allocate a draft version number. Please retry.', code: 'CONFLICT' };
      }
      throw error;
    }

    try {
      await importIntoVersion(versionId, true, session);
      const version = await db.query.resultVersions.findFirst({
        where: eq(resultVersions.id, versionId),
      });
      return {
        ok: true,
        data: { resultVersion: toResultVersionRecord(version!), importedRowCount: rows.length },
      };
    } catch (error) {
      const mapped = handleImportError(error);
      if (mapped) return mapped;
      throw error;
    }
  }

  return {
    ok: false,
    error: 'Could not allocate a draft version number. Please retry.',
    code: 'CONFLICT',
  };
}
