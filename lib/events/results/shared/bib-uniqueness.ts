import { and, eq, inArray, isNull, ne } from 'drizzle-orm';

import { resultEntries } from '@/db/schema';
import type { ResultTransaction } from '@/lib/events/results/shared/version-lock';

/**
 * Find the first bib number that would duplicate an existing *distance-less* entry in a
 * result version.
 *
 * Bib uniqueness for entries that HAVE a distance is enforced at the database level by the
 * partial unique index `result_entries_version_distance_bib_unique_idx`. That index
 * deliberately excludes null-distance rows: `distanceId` is `on delete set null`, so
 * including them would turn a legitimate cross-distance bib reuse into a duplicate-key
 * failure the moment a distance is hard-deleted. This helper closes the residual gap — within
 * a single version, no two distance-less entries may share a bib — for the mutation paths
 * where a batch-only check would otherwise let a duplicate slip across separate imports or
 * manual upserts.
 *
 * Callers MUST already hold the version's `FOR UPDATE` lock (see `lockResultVersion`) so the
 * check-then-write is serialized against every other mutator of the same version. Returns the
 * first offending bib, or `null` when none of `bibNumbers` collide.
 */
export async function findConflictingNullDistanceBib(
  tx: ResultTransaction,
  params: {
    resultVersionId: string;
    bibNumbers: readonly string[];
    /** Ignore this entry when checking (the row being updated in place). */
    excludeEntryId?: string;
  },
): Promise<string | null> {
  const candidates = [
    ...new Set(params.bibNumbers.map((bib) => bib.trim()).filter((bib) => bib.length > 0)),
  ];
  if (candidates.length === 0) return null;

  const existing = await tx.query.resultEntries.findMany({
    where: and(
      eq(resultEntries.resultVersionId, params.resultVersionId),
      isNull(resultEntries.distanceId),
      isNull(resultEntries.deletedAt),
      inArray(resultEntries.bibNumber, candidates),
      params.excludeEntryId ? ne(resultEntries.id, params.excludeEntryId) : undefined,
    ),
    columns: { bibNumber: true },
  });

  const taken = new Set(existing.map((row) => row.bibNumber));
  return candidates.find((bib) => taken.has(bib)) ?? null;
}
