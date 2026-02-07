const mockRankingSnapshotsFindMany = jest.fn();
const mockRankingSnapshotRowsFindMany = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      rankingSnapshots: {
        findMany: (...args: unknown[]) => mockRankingSnapshotsFindMany(...args),
      },
      rankingSnapshotRows: {
        findMany: (...args: unknown[]) => mockRankingSnapshotRowsFindMany(...args),
      },
    },
  },
}));

import {
  getPublicNationalRankingLeaderboard,
  getPublicRankingLeaderboard,
} from '@/lib/events/results/rankings';

function buildNationalSnapshot(params: {
  id: string;
  isCurrent: boolean;
  rulesetVersionTag: string;
  generatedAt: string;
  promotedAt: string;
  explainabilityReference?: string | null;
}) {
  return {
    id: params.id,
    rulesetId: `${params.id}-ruleset`,
    scope: 'national' as const,
    organizationId: null,
    sourceVersionIdsJson: [`${params.id}-version`],
    exclusionLogJson: [],
    triggerResultVersionId: null,
    isCurrent: params.isCurrent,
    promotedAt: new Date(params.promotedAt),
    rowCount: 3,
    generatedAt: new Date(params.generatedAt),
    createdAt: new Date(params.generatedAt),
    updatedAt: new Date(params.generatedAt),
    deletedAt: null,
    ruleset: {
      versionTag: params.rulesetVersionTag,
      explainabilityReference: params.explainabilityReference ?? null,
    },
    organization: null,
  };
}

describe('public national rankings leaderboard query', () => {
  beforeEach(() => {
    mockRankingSnapshotsFindMany.mockReset();
    mockRankingSnapshotRowsFindMany.mockReset();
  });

  it('returns empty state when no promoted national snapshot exists', async () => {
    mockRankingSnapshotsFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await getPublicNationalRankingLeaderboard();

    expect(result.state).toBe('empty');
    expect(result.snapshot).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.filters.availableSnapshots).toEqual([]);
  });

  it('applies URL filters for discipline, gender, and age group on current national rows', async () => {
    const currentSnapshot = buildNationalSnapshot({
      id: 'snapshot-current',
      isCurrent: true,
      rulesetVersionTag: 'v1.3.0',
      generatedAt: '2026-08-12T09:00:00.000Z',
      promotedAt: '2026-08-12T10:00:00.000Z',
      explainabilityReference: 'https://example.com/rulesets/v1-3-0',
    });

    const historicalSnapshot = buildNationalSnapshot({
      id: 'snapshot-historical',
      isCurrent: false,
      rulesetVersionTag: 'v1.2.0',
      generatedAt: '2026-07-12T09:00:00.000Z',
      promotedAt: '2026-07-12T10:00:00.000Z',
      explainabilityReference: 'https://example.com/rulesets/v1-2-0',
    });

    mockRankingSnapshotsFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([currentSnapshot, historicalSnapshot]);

    mockRankingSnapshotRowsFindMany.mockResolvedValueOnce([
      {
        rank: 1,
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
        discipline: 'trail_running',
        gender: 'female',
        age: 31,
        finishTimeMillis: 3_600_000,
      },
      {
        rank: 2,
        runnerFullName: 'Ben Runner',
        bibNumber: '77',
        discipline: 'cycling',
        gender: 'male',
        age: 41,
        finishTimeMillis: 3_700_000,
      },
      {
        rank: 3,
        runnerFullName: 'Cora Runner',
        bibNumber: '88',
        discipline: 'trail_running',
        gender: 'female',
        age: 42,
        finishTimeMillis: 3_800_000,
      },
    ]);

    const result = await getPublicNationalRankingLeaderboard({
      discipline: 'trail_running',
      gender: 'female',
      ageGroup: '25-34',
    });

    expect(result.state).toBe('ready');
    expect(result.snapshot?.id).toBe('snapshot-current');
    expect(result.snapshot?.rulesetVersionTag).toBe('v1.3.0');
    expect(result.snapshot?.rulesetReference).toBe('https://example.com/rulesets/v1-3-0');
    expect(result.rows).toEqual([
      expect.objectContaining({
        runnerFullName: 'Ana Runner',
        discipline: 'trail_running',
        gender: 'female',
        ageGroup: '25-34',
      }),
    ]);
    expect(result.filters).toMatchObject({
      discipline: 'trail_running',
      gender: 'female',
      ageGroup: '25-34',
      snapshotId: 'snapshot-current',
    });
    expect(result.filters.availableSnapshots).toHaveLength(2);
    expect(result.filters.availableDisciplines).toEqual(['cycling', 'trail_running']);
    expect(result.filters.availableGenders).toEqual(['female', 'male']);
    expect(result.filters.availableAgeGroups).toEqual(['25-34', '35-44']);
  });

  it('selects historical snapshot rows when snapshotId is provided', async () => {
    const currentSnapshot = buildNationalSnapshot({
      id: 'snapshot-current',
      isCurrent: true,
      rulesetVersionTag: 'v1.3.0',
      generatedAt: '2026-08-12T09:00:00.000Z',
      promotedAt: '2026-08-12T10:00:00.000Z',
    });

    const historicalSnapshot = buildNationalSnapshot({
      id: 'snapshot-historical',
      isCurrent: false,
      rulesetVersionTag: 'v1.2.0',
      generatedAt: '2026-07-12T09:00:00.000Z',
      promotedAt: '2026-07-12T10:00:00.000Z',
      explainabilityReference: 'https://example.com/rulesets/v1-2-0',
    });

    mockRankingSnapshotsFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([currentSnapshot, historicalSnapshot]);

    mockRankingSnapshotRowsFindMany.mockResolvedValueOnce([
      {
        rank: 1,
        runnerFullName: 'Historical Runner',
        bibNumber: '55',
        discipline: 'cycling',
        gender: 'male',
        age: 38,
        finishTimeMillis: 3_450_000,
      },
    ]);

    const result = await getPublicRankingLeaderboard({
      scope: 'national',
      snapshotId: 'snapshot-historical',
    });

    expect(result.state).toBe('ready');
    expect(result.snapshot?.id).toBe('snapshot-historical');
    expect(result.snapshot?.isCurrent).toBe(false);
    expect(result.snapshot?.rulesetVersionTag).toBe('v1.2.0');
    expect(result.snapshot?.rulesetReference).toBe('https://example.com/rulesets/v1-2-0');
    expect(result.filters.snapshotId).toBe('snapshot-historical');
    expect(result.rows).toEqual([
      expect.objectContaining({
        runnerFullName: 'Historical Runner',
        discipline: 'cycling',
      }),
    ]);
  });

  it('falls back safely to current snapshot when snapshotId is invalid', async () => {
    const currentSnapshot = buildNationalSnapshot({
      id: 'snapshot-current',
      isCurrent: true,
      rulesetVersionTag: 'v1.3.0',
      generatedAt: '2026-08-12T09:00:00.000Z',
      promotedAt: '2026-08-12T10:00:00.000Z',
    });

    const historicalSnapshot = buildNationalSnapshot({
      id: 'snapshot-historical',
      isCurrent: false,
      rulesetVersionTag: 'v1.2.0',
      generatedAt: '2026-07-12T09:00:00.000Z',
      promotedAt: '2026-07-12T10:00:00.000Z',
    });

    mockRankingSnapshotsFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([currentSnapshot, historicalSnapshot]);

    mockRankingSnapshotRowsFindMany.mockResolvedValueOnce([
      {
        rank: 1,
        runnerFullName: 'Fallback Runner',
        bibNumber: '99',
        discipline: 'trail_running',
        gender: 'female',
        age: 29,
        finishTimeMillis: 3_400_000,
      },
    ]);

    const result = await getPublicRankingLeaderboard({
      scope: 'national',
      snapshotId: 'snapshot-does-not-exist',
    });

    expect(result.state).toBe('ready');
    expect(result.snapshot?.id).toBe('snapshot-current');
    expect(result.filters.snapshotId).toBe('snapshot-current');
  });

  it('isolates organizer scope to the selected organizer snapshot', async () => {
    mockRankingSnapshotsFindMany
      .mockResolvedValueOnce([
        {
          organization: { id: 'org-1', name: 'Ultra Valle Org' },
        },
        {
          organization: { id: 'org-2', name: 'Sierra Run Org' },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'snapshot-org-1',
          rulesetId: 'ruleset-org-1',
          scope: 'organizer',
          organizationId: 'org-1',
          sourceVersionIdsJson: ['version-2'],
          exclusionLogJson: [],
          triggerResultVersionId: null,
          isCurrent: true,
          promotedAt: new Date('2026-08-12T10:00:00.000Z'),
          rowCount: 1,
          generatedAt: new Date('2026-08-12T09:00:00.000Z'),
          createdAt: new Date('2026-08-12T09:00:00.000Z'),
          updatedAt: new Date('2026-08-12T09:00:00.000Z'),
          deletedAt: null,
          ruleset: {
            versionTag: 'v1.4.0',
            explainabilityReference: 'https://example.com/rulesets/v1-4-0',
          },
          organization: { id: 'org-1', name: 'Ultra Valle Org' },
        },
      ]);

    mockRankingSnapshotRowsFindMany.mockResolvedValueOnce([
      {
        rank: 1,
        runnerFullName: 'Ana Runner',
        bibNumber: '101',
        discipline: 'trail_running',
        gender: 'female',
        age: 31,
        finishTimeMillis: 3_600_000,
      },
    ]);

    const result = await getPublicRankingLeaderboard({
      scope: 'organizer',
      organizationId: 'org-1',
    });

    expect(result.state).toBe('ready');
    expect(result.snapshot?.scope).toBe('organizer');
    expect(result.snapshot?.organizationId).toBe('org-1');
    expect(result.snapshot?.organizationName).toBe('Ultra Valle Org');
    expect(result.filters.scope).toBe('organizer');
    expect(result.filters.organizationId).toBe('org-1');
    expect(result.filters.snapshotId).toBe('snapshot-org-1');
    expect(result.filters.availableSnapshots).toEqual([
      {
        snapshotId: 'snapshot-org-1',
        rulesetVersionTag: 'v1.4.0',
        promotedAt: new Date('2026-08-12T10:00:00.000Z'),
        generatedAt: new Date('2026-08-12T09:00:00.000Z'),
        isCurrent: true,
      },
    ]);
    expect(result.filters.availableOrganizers).toEqual([
      { organizationId: 'org-2', organizationName: 'Sierra Run Org' },
      { organizationId: 'org-1', organizationName: 'Ultra Valle Org' },
    ]);
  });
});
