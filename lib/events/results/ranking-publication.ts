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
import {
  publishRankingRuleset,
  resolveRankingRulesetForTimestamp,
} from '@/lib/events/results/rulesets';
import type { RankingRulesetRecord, RankingSnapshotRecord } from '@/lib/events/results/types';

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

  const promotedAt = new Date();

  // Demote the prior current snapshot and promote this one in a single transaction so a
  // crash can never leave zero or two current snapshots for a scope (RES-19). The partial
  // unique index on (scope, org) WHERE is_current backs this at the DB level.
  const promoted = await db.transaction(async (tx) => {
    await tx
      .update(rankingSnapshots)
      .set({ isCurrent: false })
      .where(
        and(
          eq(rankingSnapshots.scope, snapshot.scope),
          snapshot.organizationId
            ? eq(rankingSnapshots.organizationId, snapshot.organizationId)
            : isNull(rankingSnapshots.organizationId),
          eq(rankingSnapshots.isCurrent, true),
          isNull(rankingSnapshots.deletedAt),
        ),
      );

    const promotedRows = await tx
      .update(rankingSnapshots)
      .set({
        isCurrent: true,
        promotedAt,
      })
      .where(and(eq(rankingSnapshots.id, snapshot.id), isNull(rankingSnapshots.deletedAt)))
      .returning();

    return promotedRows[0];
  });

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

const BASELINE_RANKING_RULESET_VERSION_TAG = 'baseline-v1';
// Baseline national ranking policy (RES-3, §6.4): partition by discipline, rank finishers
// by time. Editable later by publishing a superseding ruleset.
const BASELINE_RANKING_RULES_DEFINITION: Record<string, unknown> = {
  version: 'rankings-v1',
  partitionBy: ['discipline'],
  eligibleStatuses: ['finish'],
};
// Fixed far-past activation start so the baseline ruleset always resolves as active.
const BASELINE_RANKING_ACTIVATION_START = new Date('2000-01-01T00:00:00.000Z');

// Resolve the active national ruleset for `at`, bootstrapping a baseline one the first time
// results are published so rankings have a driver instead of sitting permanently empty
// (§6.4). Safe under concurrency: a duplicate-tag race falls back to re-resolving.
export async function ensureActiveNationalRankingRuleset(at: Date): Promise<RankingRulesetRecord> {
  const existing = await resolveRankingRulesetForTimestamp(at);
  if (existing) return existing;

  try {
    return await publishRankingRuleset({
      versionTag: BASELINE_RANKING_RULESET_VERSION_TAG,
      activationStartsAt: BASELINE_RANKING_ACTIVATION_START,
      rulesDefinitionJson: BASELINE_RANKING_RULES_DEFINITION,
      status: 'active',
    });
  } catch {
    const afterRace = await resolveRankingRulesetForTimestamp(at);
    if (afterRace) return afterRace;
    throw new Error('Unable to resolve or bootstrap an active ranking ruleset');
  }
}

// Fired (non-blocking) after a result version is finalized or a correction is published, so
// the public national leaderboard reflects the newly official data (§6.4).
export async function recomputeNationalRankingsOnPublish(params: {
  triggerResultVersionId?: string | null;
  at?: Date;
}): Promise<void> {
  const at = params.at ?? new Date();
  const ruleset = await ensureActiveNationalRankingRuleset(at);
  await recomputeAndPublishNationalRankingSnapshot({
    rulesetId: ruleset.id,
    triggerResultVersionId: params.triggerResultVersionId ?? null,
  });
}
