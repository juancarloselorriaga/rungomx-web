import {
  and,
  desc,
  eq,
  gt,
  isNull,
  lte,
  or,
} from 'drizzle-orm';

import { db } from '@/db';
import { rankingRulesets } from '@/db/schema';
import type {
  RankingRulesetRecord,
  RankingRulesetRow,
  RankingRulesetStatus,
} from '@/lib/events/results/types';

export type PublishRankingRulesetInput = {
  versionTag: string;
  activationStartsAt: Date;
  activationEndsAt?: Date | null;
  rulesDefinitionJson: Record<string, unknown>;
  explainabilityReference?: string | null;
  publishedByUserId?: string | null;
  publishedAt?: Date;
  status?: RankingRulesetStatus;
};

type RankingRulesetWindowCandidate = Pick<
  RankingRulesetRecord,
  'id' | 'versionTag' | 'activationStartsAt' | 'activationEndsAt' | 'createdAt'
>;

function toRankingRulesetRecord(row: RankingRulesetRow): RankingRulesetRecord {
  return {
    id: row.id,
    versionTag: row.versionTag,
    status: row.status,
    rulesDefinitionJson: row.rulesDefinitionJson,
    explainabilityReference: row.explainabilityReference,
    activationStartsAt: row.activationStartsAt,
    activationEndsAt: row.activationEndsAt,
    publishedByUserId: row.publishedByUserId,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeVersionTag(input: string): string {
  return input.trim().toLowerCase();
}

function windowsOverlap(
  leftStart: Date,
  leftEnd: Date | null,
  rightStart: Date,
  rightEnd: Date | null,
): boolean {
  const leftEndMillis = leftEnd?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightEndMillis = rightEnd?.getTime() ?? Number.POSITIVE_INFINITY;

  return leftStart.getTime() < rightEndMillis && rightStart.getTime() < leftEndMillis;
}

export function resolveRankingRulesetForTimestampFromCandidates(
  candidates: readonly RankingRulesetWindowCandidate[],
  at: Date,
): RankingRulesetWindowCandidate | null {
  const atMillis = at.getTime();
  const matching = candidates.filter((candidate) => {
    const startsAtMillis = candidate.activationStartsAt.getTime();
    const endsAtMillis = candidate.activationEndsAt?.getTime() ?? Number.POSITIVE_INFINITY;

    return startsAtMillis <= atMillis && atMillis < endsAtMillis;
  });

  if (!matching.length) return null;

  const ordered = [...matching].sort((left, right) => {
    const startsAtDelta =
      right.activationStartsAt.getTime() - left.activationStartsAt.getTime();
    if (startsAtDelta !== 0) return startsAtDelta;

    const createdAtDelta = right.createdAt.getTime() - left.createdAt.getTime();
    if (createdAtDelta !== 0) return createdAtDelta;

    return left.versionTag.localeCompare(right.versionTag);
  });

  return ordered[0] ?? null;
}

export async function publishRankingRuleset(
  input: PublishRankingRulesetInput,
): Promise<RankingRulesetRecord> {
  const normalizedVersionTag = normalizeVersionTag(input.versionTag);
  if (!normalizedVersionTag) {
    throw new Error('Ranking ruleset version tag is required');
  }

  const activationEndsAt = input.activationEndsAt ?? null;
  if (activationEndsAt && activationEndsAt.getTime() <= input.activationStartsAt.getTime()) {
    throw new Error('Ranking ruleset activation window is invalid');
  }

  const duplicate = await db.query.rankingRulesets.findFirst({
    where: and(
      eq(rankingRulesets.versionTag, normalizedVersionTag),
      isNull(rankingRulesets.deletedAt),
    ),
    columns: {
      id: true,
    },
  });

  if (duplicate) {
    throw new Error('Ranking ruleset version already exists');
  }

  const activeCandidates = await db.query.rankingRulesets.findMany({
    where: and(
      eq(rankingRulesets.status, 'active'),
      isNull(rankingRulesets.deletedAt),
    ),
    columns: {
      activationStartsAt: true,
      activationEndsAt: true,
      versionTag: true,
      id: true,
      createdAt: true,
    },
    orderBy: [desc(rankingRulesets.activationStartsAt), desc(rankingRulesets.createdAt)],
    limit: 200,
  });

  const hasOverlap = activeCandidates.some((candidate) =>
    windowsOverlap(
      candidate.activationStartsAt,
      candidate.activationEndsAt,
      input.activationStartsAt,
      activationEndsAt,
    ),
  );

  if (hasOverlap) {
    throw new Error('Ranking ruleset activation window overlaps with an active ruleset');
  }

  const now = input.publishedAt ?? new Date();
  const targetStatus: RankingRulesetStatus = input.status ?? 'active';

  const inserted = await db
    .insert(rankingRulesets)
    .values({
      versionTag: normalizedVersionTag,
      status: targetStatus,
      rulesDefinitionJson: input.rulesDefinitionJson,
      explainabilityReference: input.explainabilityReference ?? null,
      activationStartsAt: input.activationStartsAt,
      activationEndsAt,
      publishedByUserId: input.publishedByUserId ?? null,
      publishedAt: targetStatus === 'active' ? now : null,
    })
    .returning();

  const row = inserted[0];
  if (!row) {
    throw new Error('Failed to persist ranking ruleset');
  }

  return toRankingRulesetRecord(row);
}

export async function resolveRankingRulesetForTimestamp(
  at: Date,
): Promise<RankingRulesetRecord | null> {
  const candidates = await db.query.rankingRulesets.findMany({
    where: and(
      eq(rankingRulesets.status, 'active'),
      isNull(rankingRulesets.deletedAt),
      lte(rankingRulesets.activationStartsAt, at),
      or(isNull(rankingRulesets.activationEndsAt), gt(rankingRulesets.activationEndsAt, at)),
    ),
    orderBy: [desc(rankingRulesets.activationStartsAt), desc(rankingRulesets.createdAt)],
    limit: 50,
  });

  const resolved = resolveRankingRulesetForTimestampFromCandidates(
    candidates.map(toRankingRulesetRecord),
    at,
  );

  if (!resolved) return null;

  return (
    candidates
      .map(toRankingRulesetRecord)
      .find((candidate) => candidate.id === resolved.id) ?? null
  );
}
