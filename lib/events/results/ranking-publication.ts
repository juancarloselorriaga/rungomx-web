import { and, eq, isNull } from 'drizzle-orm';
import { revalidateTag } from 'next/cache';

import { db } from '@/db';
import { rankingSnapshots } from '@/db/schema';
import {
  rankingsNationalTag,
  rankingsOrganizerTag,
  rankingsRulesetCurrentTag,
} from '@/lib/events/results/cache-tags';
import {
  computeNationalRankingSnapshot,
  type ComputeRankingSnapshotResult,
} from '@/lib/events/results/rankings';
import type { RankingSnapshotRecord } from '@/lib/events/results/types';

function toRankingSnapshotRecord(
  row: typeof rankingSnapshots.$inferSelect,
): RankingSnapshotRecord {
  return {
    id: row.id,
    rulesetId: row.rulesetId,
    scope: row.scope,
    organizationId: row.organizationId,
    sourceVersionIdsJson: row.sourceVersionIdsJson,
    exclusionLogJson: row.exclusionLogJson,
    triggerResultVersionId: row.triggerResultVersionId,
    isCurrent: row.isCurrent,
    promotedAt: row.promotedAt,
    rowCount: row.rowCount,
    generatedAt: row.generatedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function publishRankingSnapshot(
  snapshotId: string,
): Promise<RankingSnapshotRecord> {
  const snapshot = await db.query.rankingSnapshots.findFirst({
    where: and(eq(rankingSnapshots.id, snapshotId), isNull(rankingSnapshots.deletedAt)),
  });

  if (!snapshot) {
    throw new Error('Ranking snapshot not found');
  }

  await db
    .update(rankingSnapshots)
    .set({ isCurrent: false })
    .where(
      and(
        eq(rankingSnapshots.scope, snapshot.scope),
        snapshot.organizationId
          ? eq(rankingSnapshots.organizationId, snapshot.organizationId)
          : isNull(rankingSnapshots.organizationId),
        isNull(rankingSnapshots.deletedAt),
      ),
    );

  const promotedAt = new Date();
  const promotedRows = await db
    .update(rankingSnapshots)
    .set({
      isCurrent: true,
      promotedAt,
    })
    .where(and(eq(rankingSnapshots.id, snapshot.id), isNull(rankingSnapshots.deletedAt)))
    .returning();

  const promoted = promotedRows[0];
  if (!promoted) {
    throw new Error('Failed to promote ranking snapshot');
  }

  revalidateTag(rankingsRulesetCurrentTag(), { expire: 0 });
  if (promoted.scope === 'organizer' && promoted.organizationId) {
    revalidateTag(rankingsOrganizerTag(promoted.organizationId), { expire: 0 });
  } else {
    revalidateTag(rankingsNationalTag(), { expire: 0 });
  }

  return toRankingSnapshotRecord(promoted);
}

export type RecomputeAndPublishRankingResult = ComputeRankingSnapshotResult & {
  publishedSnapshot: RankingSnapshotRecord;
};

export async function recomputeAndPublishNationalRankingSnapshot(params: {
  rulesetId: string;
  triggerResultVersionId?: string | null;
}): Promise<RecomputeAndPublishRankingResult> {
  const computed = await computeNationalRankingSnapshot({
    rulesetId: params.rulesetId,
    triggerResultVersionId: params.triggerResultVersionId ?? null,
  });

  const publishedSnapshot = await publishRankingSnapshot(computed.snapshot.id);

  return {
    ...computed,
    publishedSnapshot,
  };
}
