import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  rankingRulesets,
  rankingSnapshotRows,
  rankingSnapshots,
  resultEntries,
  resultVersions,
} from '@/db/schema';
import {
  DEFAULT_AGE_GROUP_BRACKETS,
  deriveResultAgeGroupKey,
} from '@/lib/events/results/derivation/age-group';
import { rankingsNationalTag, rankingsOrganizerTag, rankingsRulesetCurrentTag } from '@/lib/events/results/cache-tags';
import {
  RESULT_DISCIPLINES,
  RESULT_ENTRY_STATUSES,
  type RankingSnapshotRecord,
  type RankingSnapshotRowRecord,
  type RankingSnapshotScope,
  type RankingSourceExclusionReason,
  type ResultDiscipline,
  type ResultEntryStatus,
  type ResultVersionStatus,
} from '@/lib/events/results/types';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';

const RANKING_SOURCE_ELIGIBLE_STATUSES = new Set<ResultVersionStatus>([
  'official',
  'corrected',
]);
const DISCIPLINE_VALUE_SET = new Set<string>(RESULT_DISCIPLINES);
const RESULT_ENTRY_STATUS_SET = new Set<string>(RESULT_ENTRY_STATUSES);

// Normalized ranking rules resolved from `rankingRulesets.rulesDefinitionJson`. The stored
// JSON is free-form; this shape is what the computation actually consumes (RES-3). v1
// partitions by discipline (so a 5K time never outranks a marathon across disciplines) and
// ranks by finish time within each partition. `partitionBy`/`eligibleStatuses` are read from
// the ruleset when present, with safe defaults otherwise.
export type ResolvedRankingRules = {
  partitionBy: ('discipline' | 'gender')[];
  eligibleStatuses: ResultEntryStatus[];
};

const DEFAULT_RANKING_RULES: ResolvedRankingRules = {
  partitionBy: ['discipline'],
  eligibleStatuses: ['finish'],
};

export function resolveRankingRules(rulesDefinitionJson: unknown): ResolvedRankingRules {
  if (typeof rulesDefinitionJson !== 'object' || rulesDefinitionJson === null) {
    return DEFAULT_RANKING_RULES;
  }
  const raw = rulesDefinitionJson as Record<string, unknown>;

  const partitionByRaw = Array.isArray(raw.partitionBy) ? raw.partitionBy : null;
  const partitionBy = partitionByRaw
    ? partitionByRaw.filter(
        (value): value is 'discipline' | 'gender' => value === 'discipline' || value === 'gender',
      )
    : DEFAULT_RANKING_RULES.partitionBy;

  const eligibleRaw = Array.isArray(raw.eligibleStatuses) ? raw.eligibleStatuses : null;
  const eligibleStatuses = eligibleRaw
    ? eligibleRaw.filter((value): value is ResultEntryStatus =>
        typeof value === 'string' && RESULT_ENTRY_STATUS_SET.has(value),
      )
    : DEFAULT_RANKING_RULES.eligibleStatuses;

  return {
    partitionBy: partitionBy.length > 0 ? partitionBy : DEFAULT_RANKING_RULES.partitionBy,
    eligibleStatuses:
      eligibleStatuses.length > 0 ? eligibleStatuses : DEFAULT_RANKING_RULES.eligibleStatuses,
  };
}

export type RankingSnapshotSourceCandidate = {
  editionId: string;
  resultVersionId: string;
  status: ResultVersionStatus;
  versionNumber: number;
  createdAt: Date;
};

export type RankingSnapshotExcludedSource = {
  editionId: string;
  resultVersionId: string;
  status: ResultVersionStatus;
  reason: RankingSourceExclusionReason;
};

export type RankingSnapshotSelection = {
  included: RankingSnapshotSourceCandidate[];
  excluded: RankingSnapshotExcludedSource[];
};

export type ComputeRankingSnapshotInput = {
  rulesetId: string;
  sourceCandidates: RankingSnapshotSourceCandidate[];
  scope?: RankingSnapshotScope;
  organizationId?: string | null;
  triggerResultVersionId?: string | null;
};

export type ComputeRankingSnapshotResult = {
  snapshot: RankingSnapshotRecord;
  rows: RankingSnapshotRowRecord[];
  includedSources: RankingSnapshotSourceCandidate[];
  excludedSources: RankingSnapshotExcludedSource[];
};

export type PublicRankingScope = 'national' | 'organizer';

export type PublicRankingOrganizerOption = {
  organizationId: string;
  organizationName: string;
};

export type PublicRankingSnapshotOption = {
  snapshotId: string;
  rulesetVersionTag: string;
  promotedAt: Date | null;
  generatedAt: Date;
  isCurrent: boolean;
};

export type PublicRankingLeaderboardFilters = {
  discipline?: string | null;
  gender?: string | null;
  ageGroup?: string | null;
  scope?: string | null;
  organizationId?: string | null;
  snapshotId?: string | null;
  limit?: number;
};

export type PublicRankingRow = {
  rank: number;
  runnerFullName: string;
  bibNumber: string | null;
  discipline: ResultDiscipline;
  gender: string | null;
  age: number | null;
  ageGroup: string | null;
  finishTimeMillis: number | null;
};

export type PublicRankingLeaderboard = {
  state: 'empty' | 'ready';
  snapshot: {
    id: string;
    rulesetVersionTag: string;
    rulesetReference: string | null;
    generatedAt: Date;
    promotedAt: Date | null;
    rowCount: number;
    isCurrent: boolean;
    scope: PublicRankingScope;
    organizationId: string | null;
    organizationName: string | null;
  } | null;
  filters: {
    discipline: string | null;
    gender: string | null;
    ageGroup: string | null;
    scope: PublicRankingScope;
    organizationId: string | null;
    snapshotId: string | null;
    availableDisciplines: string[];
    availableGenders: string[];
    availableAgeGroups: string[];
    availableOrganizers: PublicRankingOrganizerOption[];
    availableSnapshots: PublicRankingSnapshotOption[];
  };
  rows: PublicRankingRow[];
};

export type PublicNationalRankingFilters = Omit<
  PublicRankingLeaderboardFilters,
  'scope' | 'organizationId'
>;
export type PublicNationalRankingRow = PublicRankingRow;
export type PublicNationalRankingLeaderboard = PublicRankingLeaderboard;

type RankingComputationEntry = {
  id: string;
  resultVersionId: string;
  runnerFullName: string;
  bibNumber: string | null;
  discipline: ResultDiscipline;
  gender: string | null;
  age: number | null;
  status: ResultEntryStatus;
  finishTimeMillis: number | null;
};

type ComputedRankingSnapshotRow = {
  resultEntryId: string;
  resultVersionId: string;
  rank: number;
  runnerFullName: string;
  bibNumber: string | null;
  discipline: ResultDiscipline;
  gender: string | null;
  age: number | null;
  finishTimeMillis: number | null;
};

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

function toRankingSnapshotRowRecord(
  row: typeof rankingSnapshotRows.$inferSelect,
): RankingSnapshotRowRecord {
  return {
    id: row.id,
    snapshotId: row.snapshotId,
    rank: row.rank,
    resultEntryId: row.resultEntryId,
    resultVersionId: row.resultVersionId,
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    discipline: row.discipline,
    gender: row.gender,
    age: row.age,
    finishTimeMillis: row.finishTimeMillis,
    metadataJson: row.metadataJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toOrderedVersionCandidates(
  candidates: readonly RankingSnapshotSourceCandidate[],
): RankingSnapshotSourceCandidate[] {
  return [...candidates].sort((left, right) => {
    if (left.versionNumber !== right.versionNumber) {
      return right.versionNumber - left.versionNumber;
    }
    return right.createdAt.getTime() - left.createdAt.getTime();
  });
}

function normalizeFilterValue(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function normalizeDiscipline(value: string | null | undefined): string | null {
  const normalized = normalizeFilterValue(value);
  if (!normalized) return null;
  return DISCIPLINE_VALUE_SET.has(normalized) ? normalized : null;
}

function normalizeScope(value: string | null | undefined): PublicRankingScope {
  return normalizeFilterValue(value) === 'organizer' ? 'organizer' : 'national';
}

function normalizeLimit(limit: number | undefined, fallback = 300): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) return fallback;
  return Math.min(Math.max(Math.floor(limit), 1), 1000);
}

function emptyLeaderboardState(params: {
  scope: PublicRankingScope;
  discipline: string | null;
  gender: string | null;
  ageGroup: string | null;
  organizationId: string | null;
  snapshotId: string | null;
  availableOrganizers: PublicRankingOrganizerOption[];
  availableSnapshots: PublicRankingSnapshotOption[];
}): PublicRankingLeaderboard {
  return {
    state: 'empty',
    snapshot: null,
    filters: {
      discipline: params.discipline,
      gender: params.gender,
      ageGroup: params.ageGroup,
      scope: params.scope,
      organizationId: params.organizationId,
      snapshotId: params.snapshotId,
      availableDisciplines: [],
      availableGenders: [],
      availableAgeGroups: [],
      availableOrganizers: params.availableOrganizers,
      availableSnapshots: params.availableSnapshots,
    },
    rows: [],
  };
}

function toSnapshotScopePredicate(scope: PublicRankingScope, organizationId: string | null) {
  return scope === 'organizer'
    ? eq(rankingSnapshots.organizationId, organizationId!)
    : isNull(rankingSnapshots.organizationId);
}

export function selectOfficialRankingSnapshotSources(
  candidates: readonly RankingSnapshotSourceCandidate[],
): RankingSnapshotSelection {
  const byEdition = new Map<string, RankingSnapshotSourceCandidate[]>();

  for (const candidate of candidates) {
    const editionCandidates = byEdition.get(candidate.editionId) ?? [];
    editionCandidates.push(candidate);
    byEdition.set(candidate.editionId, editionCandidates);
  }

  const included: RankingSnapshotSourceCandidate[] = [];
  const excluded: RankingSnapshotExcludedSource[] = [];

  for (const [editionId, editionCandidates] of byEdition.entries()) {
    const ordered = toOrderedVersionCandidates(editionCandidates);
    const selected = ordered.find((candidate) =>
      RANKING_SOURCE_ELIGIBLE_STATUSES.has(candidate.status),
    );

    if (selected) included.push(selected);

    for (const candidate of ordered) {
      if (selected && candidate.resultVersionId === selected.resultVersionId) {
        continue;
      }

      const reason: RankingSourceExclusionReason = RANKING_SOURCE_ELIGIBLE_STATUSES.has(
        candidate.status,
      )
        ? 'superseded'
        : 'not_official';

      excluded.push({
        editionId,
        resultVersionId: candidate.resultVersionId,
        status: candidate.status,
        reason,
      });
    }
  }

  included.sort((left, right) => left.editionId.localeCompare(right.editionId));
  excluded.sort((left, right) => {
    const editionDelta = left.editionId.localeCompare(right.editionId);
    if (editionDelta !== 0) return editionDelta;
    return left.resultVersionId.localeCompare(right.resultVersionId);
  });

  return { included, excluded };
}

function normalizeRankingGender(value: string | null): string {
  if (!value) return 'unspecified';
  const normalized = value.trim().toLowerCase();
  if (['f', 'female', 'woman', 'mujer'].includes(normalized)) return 'female';
  if (['m', 'male', 'man', 'hombre'].includes(normalized)) return 'male';
  return normalized || 'unspecified';
}

function rankingPartitionKey(
  entry: RankingComputationEntry,
  partitionBy: ResolvedRankingRules['partitionBy'],
): string {
  return partitionBy
    .map((dimension) =>
      dimension === 'discipline' ? entry.discipline : normalizeRankingGender(entry.gender),
    )
    .join('::');
}

// Ranks are assigned WITHIN each partition (discipline by default) using competition
// ("1224") ranking so equal finish times share a rank (RES-3, RES-17). Rows are returned
// grouped by partition, each partition ordered by rank.
function buildRankingSnapshotRowsFromEntries(
  entries: readonly RankingComputationEntry[],
  rules: ResolvedRankingRules,
): ComputedRankingSnapshotRow[] {
  const eligibleStatuses = new Set(rules.eligibleStatuses);
  const buckets = new Map<string, RankingComputationEntry[]>();

  for (const entry of entries) {
    if (entry.finishTimeMillis === null || entry.finishTimeMillis <= 0) continue;
    if (!eligibleStatuses.has(entry.status)) continue;
    const key = rankingPartitionKey(entry, rules.partitionBy);
    const bucket = buckets.get(key) ?? [];
    bucket.push(entry);
    buckets.set(key, bucket);
  }

  const results: ComputedRankingSnapshotRow[] = [];
  const orderedKeys = [...buckets.keys()].sort((left, right) => left.localeCompare(right));

  for (const key of orderedKeys) {
    const bucket = buckets.get(key)!;
    const ordered = bucket.sort((left, right) => {
      const finishLeft = left.finishTimeMillis ?? Number.MAX_SAFE_INTEGER;
      const finishRight = right.finishTimeMillis ?? Number.MAX_SAFE_INTEGER;
      if (finishLeft !== finishRight) return finishLeft - finishRight;

      const nameDelta = left.runnerFullName.localeCompare(right.runnerFullName);
      if (nameDelta !== 0) return nameDelta;

      const bibDelta = (left.bibNumber ?? '').localeCompare(right.bibNumber ?? '');
      if (bibDelta !== 0) return bibDelta;

      return left.id.localeCompare(right.id);
    });

    let position = 0;
    let lastTime: number | null = null;
    let lastRank = 0;
    for (const entry of ordered) {
      position += 1;
      const finishTime = entry.finishTimeMillis ?? Number.MAX_SAFE_INTEGER;
      if (finishTime !== lastTime) {
        lastRank = position;
        lastTime = finishTime;
      }
      results.push({
        resultEntryId: entry.id,
        resultVersionId: entry.resultVersionId,
        rank: lastRank,
        runnerFullName: entry.runnerFullName,
        bibNumber: entry.bibNumber,
        discipline: entry.discipline,
        gender: entry.gender,
        age: entry.age,
        finishTimeMillis: entry.finishTimeMillis,
      });
    }
  }

  return results;
}

export async function listRankingSourceVersionCandidates(
  limit = 1000,
): Promise<RankingSnapshotSourceCandidate[]> {
  const rows = await db.query.resultVersions.findMany({
    where: isNull(resultVersions.deletedAt),
    columns: {
      id: true,
      editionId: true,
      status: true,
      versionNumber: true,
      createdAt: true,
    },
    orderBy: [
      asc(resultVersions.editionId),
      asc(resultVersions.versionNumber),
      asc(resultVersions.createdAt),
    ],
    limit,
  });

  return rows.map((row) => ({
    editionId: row.editionId,
    resultVersionId: row.id,
    status: row.status,
    versionNumber: row.versionNumber,
    createdAt: row.createdAt,
  }));
}

export async function computeRankingSnapshot(
  input: ComputeRankingSnapshotInput,
): Promise<ComputeRankingSnapshotResult> {
  const scope = input.scope ?? 'national';
  if (scope === 'organizer' && !input.organizationId) {
    throw new Error('Organizer scope requires organizationId');
  }

  // Load the ruleset that governs this snapshot so its definition actually drives the
  // computation (RES-3) instead of being a decorative foreign key.
  const ruleset = await db.query.rankingRulesets.findFirst({
    where: and(eq(rankingRulesets.id, input.rulesetId), isNull(rankingRulesets.deletedAt)),
    columns: { rulesDefinitionJson: true },
  });
  const rules = resolveRankingRules(ruleset?.rulesDefinitionJson);

  const { included, excluded } = selectOfficialRankingSnapshotSources(input.sourceCandidates);
  const sourceVersionIds = included.map((candidate) => candidate.resultVersionId);

  const sourceEntries: RankingComputationEntry[] = sourceVersionIds.length
    ? await db
        .select({
          id: resultEntries.id,
          resultVersionId: resultEntries.resultVersionId,
          runnerFullName: resultEntries.runnerFullName,
          bibNumber: resultEntries.bibNumber,
          discipline: resultEntries.discipline,
          gender: resultEntries.gender,
          age: resultEntries.age,
          status: resultEntries.status,
          finishTimeMillis: resultEntries.finishTimeMillis,
        })
        .from(resultEntries)
        .where(
          and(
            inArray(resultEntries.resultVersionId, sourceVersionIds),
            inArray(resultEntries.status, rules.eligibleStatuses),
            isNull(resultEntries.deletedAt),
          ),
        )
    : [];

  const computedRows = buildRankingSnapshotRowsFromEntries(sourceEntries, rules);

  const snapshotInsert = await db
    .insert(rankingSnapshots)
    .values({
      rulesetId: input.rulesetId,
      scope,
      organizationId: scope === 'organizer' ? (input.organizationId ?? null) : null,
      sourceVersionIdsJson: sourceVersionIds,
      exclusionLogJson: excluded.map((item) => ({
        editionId: item.editionId,
        resultVersionId: item.resultVersionId,
        status: item.status,
        reason: item.reason,
      })),
      triggerResultVersionId: input.triggerResultVersionId ?? null,
      rowCount: computedRows.length,
    })
    .returning();

  const snapshot = snapshotInsert[0];
  if (!snapshot) {
    throw new Error('Failed to persist ranking snapshot');
  }

  const insertedRows = computedRows.length
    ? await db
        .insert(rankingSnapshotRows)
        .values(
          computedRows.map((row) => ({
            snapshotId: snapshot.id,
            rank: row.rank,
            resultEntryId: row.resultEntryId,
            resultVersionId: row.resultVersionId,
            runnerFullName: row.runnerFullName,
            bibNumber: row.bibNumber,
            discipline: row.discipline,
            gender: row.gender,
            age: row.age,
            finishTimeMillis: row.finishTimeMillis,
            metadataJson: {},
          })),
        )
        .returning()
    : [];

  return {
    snapshot: toRankingSnapshotRecord(snapshot),
    rows: insertedRows.map(toRankingSnapshotRowRecord),
    includedSources: included,
    excludedSources: excluded,
  };
}

export async function computeNationalRankingSnapshot(params: {
  rulesetId: string;
  triggerResultVersionId?: string | null;
}): Promise<ComputeRankingSnapshotResult> {
  const candidates = await listRankingSourceVersionCandidates();
  return computeRankingSnapshot({
    rulesetId: params.rulesetId,
    scope: 'national',
    triggerResultVersionId: params.triggerResultVersionId ?? null,
    sourceCandidates: candidates,
  });
}

export async function listPublicRankingOrganizerOptions(): Promise<
  PublicRankingOrganizerOption[]
> {
  const rows = await db.query.rankingSnapshots.findMany({
    where: and(
      eq(rankingSnapshots.scope, 'organizer'),
      eq(rankingSnapshots.isCurrent, true),
      isNull(rankingSnapshots.deletedAt),
    ),
    with: {
      organization: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [asc(rankingSnapshots.organizationId)],
    limit: 200,
  });

  const dedup = new Map<string, PublicRankingOrganizerOption>();
  for (const row of rows) {
    if (!row.organization?.id || !row.organization?.name) continue;
    dedup.set(row.organization.id, {
      organizationId: row.organization.id,
      organizationName: row.organization.name,
    });
  }

  return [...dedup.values()].sort((left, right) =>
    left.organizationName.localeCompare(right.organizationName),
  );
}

function ageGroupKeyToAgeRange(ageGroupKey: string): { min: number; max: number | null } | null {
  const bracket = DEFAULT_AGE_GROUP_BRACKETS.find((entry) => entry.key === ageGroupKey);
  if (!bracket) return null;
  return { min: bracket.minAge, max: bracket.maxAge };
}

export async function getPublicRankingLeaderboard(
  filters: PublicRankingLeaderboardFilters = {},
): Promise<PublicRankingLeaderboard> {
  'use cache: remote';
  safeCacheLife({ expire: 60 });
  safeCacheTag(rankingsRulesetCurrentTag());

  const disciplineFilter = normalizeDiscipline(filters.discipline);
  const genderFilter = normalizeFilterValue(filters.gender);
  const ageGroupFilter = normalizeFilterValue(filters.ageGroup);
  const scope = normalizeScope(filters.scope);
  const organizationId = normalizeFilterValue(filters.organizationId);
  const snapshotId = normalizeFilterValue(filters.snapshotId);
  const limit = normalizeLimit(filters.limit, 300);

  safeCacheTag(
    scope === 'organizer' && organizationId
      ? rankingsOrganizerTag(organizationId)
      : rankingsNationalTag(),
  );

  // NOTE: DB errors are intentionally NOT swallowed into an empty state (RES-20). They
  // propagate to the route's error boundary so an incident is visible rather than
  // masquerading as "no rankings yet".
  const availableOrganizers = await listPublicRankingOrganizerOptions();

  if (scope === 'organizer' && !organizationId) {
    return emptyLeaderboardState({
      scope,
      discipline: disciplineFilter,
      gender: genderFilter,
      ageGroup: ageGroupFilter,
      organizationId,
      snapshotId,
      availableOrganizers,
      availableSnapshots: [],
    });
  }

  const snapshotHistory = await db.query.rankingSnapshots.findMany({
    where: and(
      eq(rankingSnapshots.scope, scope),
      toSnapshotScopePredicate(scope, organizationId),
      isNull(rankingSnapshots.deletedAt),
    ),
    with: {
      ruleset: {
        columns: {
          versionTag: true,
          explainabilityReference: true,
        },
      },
      organization: {
        columns: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [desc(rankingSnapshots.promotedAt), desc(rankingSnapshots.generatedAt)],
    limit: 50,
  });

  // Only ever expose promoted snapshots publicly — never a never-promoted compute artifact
  // (RES-19). `promotedAt` is set only on promotion.
  const promotedSnapshots = snapshotHistory.filter(
    (snapshot) => snapshot.promotedAt !== null && snapshot.ruleset,
  );

  const availableSnapshots: PublicRankingSnapshotOption[] = promotedSnapshots.map((snapshot) => ({
    snapshotId: snapshot.id,
    rulesetVersionTag: snapshot.ruleset!.versionTag,
    promotedAt: snapshot.promotedAt,
    generatedAt: snapshot.generatedAt,
    isCurrent: snapshot.isCurrent,
  }));

  const selectedSnapshot =
    (snapshotId ? promotedSnapshots.find((snapshot) => snapshot.id === snapshotId) : null) ??
    promotedSnapshots.find((snapshot) => snapshot.isCurrent) ??
    promotedSnapshots[0];

  if (!selectedSnapshot || !selectedSnapshot.ruleset) {
    return emptyLeaderboardState({
      scope,
      discipline: disciplineFilter,
      gender: genderFilter,
      ageGroup: ageGroupFilter,
      organizationId,
      snapshotId: null,
      availableOrganizers,
      availableSnapshots,
    });
  }

  const selectedSnapshotId = selectedSnapshot.id;

  // Facets are derived from the WHOLE snapshot (distinct values), independent of the active
  // filter, so the filter dropdowns stay complete.
  const facetRows = await db
    .selectDistinct({
      discipline: rankingSnapshotRows.discipline,
      gender: rankingSnapshotRows.gender,
      age: rankingSnapshotRows.age,
    })
    .from(rankingSnapshotRows)
    .where(
      and(
        eq(rankingSnapshotRows.snapshotId, selectedSnapshotId),
        isNull(rankingSnapshotRows.deletedAt),
      ),
    );

  const availableDisciplines = Array.from(
    new Set(facetRows.map((row) => row.discipline)),
  ).sort((left, right) => left.localeCompare(right));
  const availableGenders = Array.from(
    new Set(
      facetRows
        .map((row) => normalizeFilterValue(row.gender))
        .filter((value): value is string => value !== null),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const availableAgeGroups = Array.from(
    new Set(
      facetRows
        .map((row) =>
          normalizeFilterValue(
            deriveResultAgeGroupKey({ age: row.age, brackets: DEFAULT_AGE_GROUP_BRACKETS }),
          ),
        )
        .filter((value): value is string => value !== null),
    ),
  ).sort((left, right) => left.localeCompare(right));

  // RES-4: apply filters IN SQL before the limit, so a filtered leaderboard is never
  // silently truncated to whoever happened to fall inside the global top-N.
  const rowPredicates = [
    eq(rankingSnapshotRows.snapshotId, selectedSnapshotId),
    isNull(rankingSnapshotRows.deletedAt),
  ];
  if (disciplineFilter) {
    rowPredicates.push(eq(rankingSnapshotRows.discipline, disciplineFilter as ResultDiscipline));
  }
  if (genderFilter) {
    rowPredicates.push(sql`lower(trim(${rankingSnapshotRows.gender})) = ${genderFilter}`);
  }
  if (ageGroupFilter) {
    const range = ageGroupKeyToAgeRange(ageGroupFilter);
    if (!range) {
      // Unknown age-group key can't match any bracket-derived group.
      rowPredicates.push(sql`false`);
    } else {
      rowPredicates.push(gte(rankingSnapshotRows.age, range.min));
      if (range.max !== null) {
        rowPredicates.push(lte(rankingSnapshotRows.age, range.max));
      }
    }
  }

  const rows = await db
    .select({
      rank: rankingSnapshotRows.rank,
      runnerFullName: rankingSnapshotRows.runnerFullName,
      bibNumber: rankingSnapshotRows.bibNumber,
      discipline: rankingSnapshotRows.discipline,
      gender: rankingSnapshotRows.gender,
      age: rankingSnapshotRows.age,
      finishTimeMillis: rankingSnapshotRows.finishTimeMillis,
    })
    .from(rankingSnapshotRows)
    .where(and(...rowPredicates))
    .orderBy(asc(rankingSnapshotRows.discipline), asc(rankingSnapshotRows.rank))
    .limit(limit);

  const normalizedRows: PublicRankingRow[] = rows.map((row) => ({
    rank: row.rank,
    runnerFullName: row.runnerFullName,
    bibNumber: row.bibNumber,
    discipline: row.discipline,
    gender: row.gender,
    age: row.age,
    ageGroup: deriveResultAgeGroupKey({
      age: row.age,
      brackets: DEFAULT_AGE_GROUP_BRACKETS,
    }),
    finishTimeMillis: row.finishTimeMillis,
  }));

  return {
    state: 'ready',
    snapshot: {
      id: selectedSnapshot.id,
      rulesetVersionTag: selectedSnapshot.ruleset.versionTag,
      rulesetReference: selectedSnapshot.ruleset.explainabilityReference,
      generatedAt: selectedSnapshot.generatedAt,
      promotedAt: selectedSnapshot.promotedAt,
      rowCount: selectedSnapshot.rowCount,
      isCurrent: selectedSnapshot.isCurrent,
      scope,
      organizationId: selectedSnapshot.organization?.id ?? null,
      organizationName: selectedSnapshot.organization?.name ?? null,
    },
    filters: {
      discipline: disciplineFilter,
      gender: genderFilter,
      ageGroup: ageGroupFilter,
      scope,
      organizationId,
      snapshotId: selectedSnapshotId,
      availableDisciplines,
      availableGenders,
      availableAgeGroups,
      availableOrganizers,
      availableSnapshots,
    },
    rows: normalizedRows,
  };
}

export async function getPublicNationalRankingLeaderboard(
  filters: PublicNationalRankingFilters = {},
): Promise<PublicNationalRankingLeaderboard> {
  return getPublicRankingLeaderboard({
    ...filters,
    scope: 'national',
  });
}
