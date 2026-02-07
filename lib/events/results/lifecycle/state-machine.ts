import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { resultVersions } from '@/db/schema';
import type {
  ResultVersionRecord,
  ResultVersionStatus,
} from '@/lib/events/results/types';
import type { ActionResult } from '@/lib/events/shared/action-helpers';

export const ACTIVE_OFFICIAL_POINTER_STATUSES: ResultVersionStatus[] = [
  'official',
  'corrected',
];

const ALLOWED_TRANSITIONS: Record<ResultVersionStatus, readonly ResultVersionStatus[]> = {
  draft: ['official', 'corrected'],
  official: [],
  corrected: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toResultVersionRecord(
  row: typeof resultVersions.$inferSelect,
): ResultVersionRecord {
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

function canTransitionResultVersionLifecycle(
  fromStatus: ResultVersionStatus,
  toStatus: ResultVersionStatus,
): boolean {
  return ALLOWED_TRANSITIONS[fromStatus].includes(toStatus);
}

export function getAllowedResultVersionLifecycleTransitions(
  status: ResultVersionStatus,
): readonly ResultVersionStatus[] {
  return ALLOWED_TRANSITIONS[status];
}

export async function transitionResultVersionLifecycle(params: {
  resultVersionId: string;
  toStatus: Extract<ResultVersionStatus, 'official' | 'corrected'>;
  finalizedByUserId: string;
  finalizedAt?: Date;
  transitionReason?: string;
  provenancePatch?: Record<string, unknown>;
}): Promise<ActionResult<ResultVersionRecord>> {
  const version = await db.query.resultVersions.findFirst({
    where: and(
      eq(resultVersions.id, params.resultVersionId),
      isNull(resultVersions.deletedAt),
    ),
  });

  if (!version) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      error: 'Result version not found',
    };
  }

  if (!canTransitionResultVersionLifecycle(version.status, params.toStatus)) {
    return {
      ok: false,
      code: 'INVALID_TRANSITION',
      error: `Invalid lifecycle transition: ${version.status} -> ${params.toStatus}`,
    };
  }

  const now = params.finalizedAt ?? new Date();
  const provenancePatch = isRecord(params.provenancePatch)
    ? params.provenancePatch
    : {};
  const nextProvenance = {
    ...(version.provenanceJson ?? {}),
    ...provenancePatch,
    lifecycle: {
      from: version.status,
      to: params.toStatus,
      finalizedByUserId: params.finalizedByUserId,
      finalizedAt: now.toISOString(),
      transitionReason: params.transitionReason ?? null,
    },
  };

  const [updated] = await db
    .update(resultVersions)
    .set({
      status: params.toStatus,
      finalizedByUserId: params.finalizedByUserId,
      finalizedAt: now,
      provenanceJson: nextProvenance,
    })
    .where(eq(resultVersions.id, version.id))
    .returning();

  return {
    ok: true,
    data: toResultVersionRecord(updated),
  };
}

export async function getActiveOfficialResultVersionForEdition(
  editionId: string,
): Promise<ResultVersionRecord | null> {
  const [version] = await db.query.resultVersions.findMany({
    where: and(
      eq(resultVersions.editionId, editionId),
      isNull(resultVersions.deletedAt),
      inArray(resultVersions.status, ACTIVE_OFFICIAL_POINTER_STATUSES),
    ),
    orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
    limit: 1,
  });

  if (!version) return null;
  return toResultVersionRecord(version);
}

export async function listResultVersionHistoryForEdition(
  editionId: string,
  limit = 100,
): Promise<ResultVersionRecord[]> {
  const rows = await db.query.resultVersions.findMany({
    where: and(
      eq(resultVersions.editionId, editionId),
      isNull(resultVersions.deletedAt),
    ),
    orderBy: [desc(resultVersions.versionNumber), desc(resultVersions.createdAt)],
    limit: Math.max(limit, 1),
  });

  return rows.map(toResultVersionRecord);
}
