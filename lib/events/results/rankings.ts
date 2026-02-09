import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  rankingSnapshotRows,
  rankingSnapshots,
  resultEntries,
  resultVersions,
} from '@/db/schema';
import {
  DEFAULT_AGE_GROUP_BRACKETS,
  deriveResultAgeGroupKey,
} from '@/lib/events/results/derivation/age-group';
import {
  RESULT_DISCIPLINES,
  type RankingSnapshotRecord,
  type RankingSnapshotRowRecord,
  type RankingSnapshotScope,
  type RankingSourceExclusionReason,
  type ResultDiscipline,
  type ResultVersionStatus,
} from '@/lib/events/results/types';

const RANKING_SOURCE_ELIGIBLE_STATUSES = new Set<ResultVersionStatus>([
  'official',
  'corrected',
]);
const DISCIPLINE_VALUE_SET = new Set<string>(RESULT_DISCIPLINES);

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

function buildRankingSnapshotRowsFromEntries(
  entries: readonly RankingComputationEntry[],
): ComputedRankingSnapshotRow[] {
  const ordered = [...entries].sort((left, right) => {
    const finishLeft = left.finishTimeMillis ?? Number.MAX_SAFE_INTEGER;
    const finishRight = right.finishTimeMillis ?? Number.MAX_SAFE_INTEGER;
    if (finishLeft !== finishRight) return finishLeft - finishRight;

    const nameDelta = left.runnerFullName.localeCompare(right.runnerFullName);
    if (nameDelta !== 0) return nameDelta;

    const bibDelta = (left.bibNumber ?? '').localeCompare(right.bibNumber ?? '');
    if (bibDelta !== 0) return bibDelta;

    return left.id.localeCompare(right.id);
  });

  return ordered.map((entry, index) => ({
    resultEntryId: entry.id,
    resultVersionId: entry.resultVersionId,
    rank: index + 1,
    runnerFullName: entry.runnerFullName,
    bibNumber: entry.bibNumber,
    discipline: entry.discipline,
    gender: entry.gender,
    age: entry.age,
    finishTimeMillis: entry.finishTimeMillis,
  }));
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

  const { included, excluded } = selectOfficialRankingSnapshotSources(input.sourceCandidates);
  const sourceVersionIds = included.map((candidate) => candidate.resultVersionId);

  const sourceEntries = sourceVersionIds.length
    ? await db
        .select({
          id: resultEntries.id,
          resultVersionId: resultEntries.resultVersionId,
          runnerFullName: resultEntries.runnerFullName,
          bibNumber: resultEntries.bibNumber,
          discipline: resultEntries.discipline,
          gender: resultEntries.gender,
          age: resultEntries.age,
          finishTimeMillis: resultEntries.finishTimeMillis,
        })
        .from(resultEntries)
        .where(
          and(
            inArray(resultEntries.resultVersionId, sourceVersionIds),
            eq(resultEntries.status, 'finish'),
            isNull(resultEntries.deletedAt),
          ),
        )
    : [];

  const computedRows = buildRankingSnapshotRowsFromEntries(sourceEntries);

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

export async function getPublicRankingLeaderboard(
  filters: PublicRankingLeaderboardFilters = {},
): Promise<PublicRankingLeaderboard> {
  const disciplineFilter = normalizeDiscipline(filters.discipline);
  const genderFilter = normalizeFilterValue(filters.gender);
  const ageGroupFilter = normalizeFilterValue(filters.ageGroup);
  const scope = normalizeScope(filters.scope);
  const organizationId = normalizeFilterValue(filters.organizationId);
  const snapshotId = normalizeFilterValue(filters.snapshotId);
  const limit = normalizeLimit(filters.limit, 300);
  let availableOrganizers: PublicRankingOrganizerOption[] = [];

  try {
    availableOrganizers = await listPublicRankingOrganizerOptions();

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

    const availableSnapshots: PublicRankingSnapshotOption[] = snapshotHistory
      .filter((snapshot) => snapshot.ruleset)
      .map((snapshot) => ({
        snapshotId: snapshot.id,
        rulesetVersionTag: snapshot.ruleset!.versionTag,
        promotedAt: snapshot.promotedAt,
        generatedAt: snapshot.generatedAt,
        isCurrent: snapshot.isCurrent,
      }));

    const selectedSnapshot =
      (snapshotId ? snapshotHistory.find((snapshot) => snapshot.id === snapshotId) : null) ??
      snapshotHistory.find((snapshot) => snapshot.isCurrent) ??
      snapshotHistory[0];

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

    const rows = await db.query.rankingSnapshotRows.findMany({
      where: and(
        eq(rankingSnapshotRows.snapshotId, selectedSnapshot.id),
        isNull(rankingSnapshotRows.deletedAt),
      ),
      columns: {
        rank: true,
        runnerFullName: true,
        bibNumber: true,
        discipline: true,
        gender: true,
        age: true,
        finishTimeMillis: true,
      },
      orderBy: [asc(rankingSnapshotRows.rank)],
      limit,
    });

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

    const availableDisciplines = Array.from(
      new Set(normalizedRows.map((row) => row.discipline)),
    ).sort((left, right) => left.localeCompare(right));
    const availableGenders = Array.from(
      new Set(
        normalizedRows
          .map((row) => normalizeFilterValue(row.gender))
          .filter((value): value is string => value !== null),
      ),
    ).sort((left, right) => left.localeCompare(right));
    const availableAgeGroups = Array.from(
      new Set(
        normalizedRows
          .map((row) => normalizeFilterValue(row.ageGroup))
          .filter((value): value is string => value !== null),
      ),
    ).sort((left, right) => left.localeCompare(right));

    const filteredRows = normalizedRows.filter((row) => {
      const normalizedGender = normalizeFilterValue(row.gender);
      const normalizedAgeGroup = normalizeFilterValue(row.ageGroup);
      if (disciplineFilter && row.discipline !== disciplineFilter) return false;
      if (genderFilter && normalizedGender !== genderFilter) return false;
      if (ageGroupFilter && normalizedAgeGroup !== ageGroupFilter) return false;
      return true;
    });

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
      rows: filteredRows,
    };
  } catch (error) {
    console.error('[getPublicRankingLeaderboard] Failed to load public rankings', {
      scope,
      organizationId,
      snapshotId,
      error,
    });
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
}

export async function getPublicNationalRankingLeaderboard(
  filters: PublicNationalRankingFilters = {},
): Promise<PublicNationalRankingLeaderboard> {
  return getPublicRankingLeaderboard({
    ...filters,
    scope: 'national',
  });
}
