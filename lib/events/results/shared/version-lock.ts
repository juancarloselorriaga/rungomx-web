import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { resultVersions } from '@/db/schema';
import type { ResultVersionStatus } from '@/lib/events/results/types';

// The transaction client passed to `db.transaction(async (tx) => ...)`.
export type ResultTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type LockedResultVersion = {
  id: string;
  editionId: string;
  status: ResultVersionStatus;
  versionNumber: number;
};

/**
 * Acquire a row-level lock on a result version inside a transaction (`SELECT ... FOR
 * UPDATE`) and return its current row, or `null` if it is missing or soft-deleted.
 *
 * Every mutator that depends on a version still being an editable `draft` (import, entry
 * upsert, identity link, finalize, discard) must lock+re-check under this lock inside its own
 * transaction. That serializes those mutators against each other and against finalization,
 * closing the time-of-check/time-of-use races where a draft could flip to `official` between
 * an out-of-transaction status read and the write.
 */
export async function lockResultVersion(
  tx: ResultTransaction,
  resultVersionId: string,
): Promise<LockedResultVersion | null> {
  const [row] = await tx
    .select({
      id: resultVersions.id,
      editionId: resultVersions.editionId,
      status: resultVersions.status,
      versionNumber: resultVersions.versionNumber,
    })
    .from(resultVersions)
    .where(and(eq(resultVersions.id, resultVersionId), isNull(resultVersions.deletedAt)))
    .for('update');

  return row ?? null;
}
