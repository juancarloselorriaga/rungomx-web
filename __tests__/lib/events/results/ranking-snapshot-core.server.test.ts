type SelectChain = {
  from: jest.Mock;
  where: jest.Mock;
};

const mockResultVersionsFindMany = jest.fn();
const mockSelect = jest.fn();
const mockInsert = jest.fn();
const mockInsertCalls: Array<{ table: unknown; values: unknown }> = [];
const mockInsertReturningQueue: unknown[][] = [];

function createSelectChain(rows: unknown[]): SelectChain {
  const chain = {
    from: jest.fn(),
    where: jest.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockResolvedValue(rows);

  return chain;
}

jest.mock('@/db', () => ({
  db: {
    query: {
      resultVersions: {
        findMany: (...args: unknown[]) => mockResultVersionsFindMany(...args),
      },
    },
    select: (...args: unknown[]) => mockSelect(...args),
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

import { rankingSnapshotRows, rankingSnapshots } from '@/db/schema';
import {
  computeNationalRankingSnapshot,
  computeRankingSnapshot,
  selectOfficialRankingSnapshotSources,
} from '@/lib/events/results/rankings';

function makeSnapshotRow(overrides?: Partial<typeof rankingSnapshots.$inferSelect>) {
  return {
    id: 'snapshot-1',
    rulesetId: 'ruleset-1',
    scope: 'national' as const,
    organizationId: null,
    sourceVersionIdsJson: ['version-official'],
    exclusionLogJson: [],
    triggerResultVersionId: null,
    isCurrent: false,
    promotedAt: null,
    rowCount: 1,
    generatedAt: new Date('2026-08-10T10:00:00.000Z'),
    createdAt: new Date('2026-08-10T10:00:00.000Z'),
    updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

function makeSnapshotRankRow(overrides?: Partial<typeof rankingSnapshotRows.$inferSelect>) {
  return {
    id: 'row-1',
    snapshotId: 'snapshot-1',
    rank: 1,
    resultEntryId: 'entry-1',
    resultVersionId: 'version-official',
    runnerFullName: 'Ana Runner',
    bibNumber: '101',
    discipline: 'trail_running' as const,
    gender: 'female',
    age: 29,
    finishTimeMillis: 3_600_000,
    metadataJson: {},
    createdAt: new Date('2026-08-10T10:00:00.000Z'),
    updatedAt: new Date('2026-08-10T10:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

describe('ranking snapshot computation core', () => {
  beforeEach(() => {
    mockResultVersionsFindMany.mockReset();
    mockSelect.mockReset();
    mockInsert.mockReset();
    mockInsertCalls.length = 0;
    mockInsertReturningQueue.length = 0;

    mockInsert.mockImplementation((table: unknown) => ({
      values: (values: unknown) => ({
        returning: async () => {
          mockInsertCalls.push({ table, values });
          const next = mockInsertReturningQueue.shift();
          return Array.isArray(next) ? next : [];
        },
      }),
    }));
  });

  it('keeps only latest official/corrected source per edition and logs exclusions', () => {
    const selection = selectOfficialRankingSnapshotSources([
      {
        editionId: 'edition-1',
        resultVersionId: 'v3-draft',
        status: 'draft',
        versionNumber: 3,
        createdAt: new Date('2026-08-10T09:00:00.000Z'),
      },
      {
        editionId: 'edition-1',
        resultVersionId: 'v2-corrected',
        status: 'corrected',
        versionNumber: 2,
        createdAt: new Date('2026-08-09T09:00:00.000Z'),
      },
      {
        editionId: 'edition-1',
        resultVersionId: 'v1-official',
        status: 'official',
        versionNumber: 1,
        createdAt: new Date('2026-08-08T09:00:00.000Z'),
      },
    ]);

    expect(selection.included).toEqual([
      expect.objectContaining({ resultVersionId: 'v2-corrected' }),
    ]);
    expect(selection.excluded).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ resultVersionId: 'v3-draft', reason: 'not_official' }),
        expect.objectContaining({ resultVersionId: 'v1-official', reason: 'superseded' }),
      ]),
    );
  });

  it('persists snapshot rows tied to ruleset version and exclusion logs', async () => {
    mockSelect.mockReturnValueOnce(
      createSelectChain([
        {
          id: 'entry-1',
          resultVersionId: 'version-official',
          runnerFullName: 'Ana Runner',
          bibNumber: '101',
          discipline: 'trail_running',
          gender: 'female',
          age: 29,
          finishTimeMillis: 3_600_000,
        },
      ]),
    );

    mockInsertReturningQueue.push(
      [
        makeSnapshotRow({
          id: 'snapshot-1',
          sourceVersionIdsJson: ['version-official'],
          exclusionLogJson: [
            {
              editionId: 'edition-1',
              resultVersionId: 'version-draft',
              status: 'draft',
              reason: 'not_official',
            },
          ],
          rowCount: 1,
        }),
      ],
      [makeSnapshotRankRow()],
    );

    const result = await computeRankingSnapshot({
      rulesetId: 'ruleset-1',
      sourceCandidates: [
        {
          editionId: 'edition-1',
          resultVersionId: 'version-official',
          status: 'official',
          versionNumber: 2,
          createdAt: new Date('2026-08-10T09:00:00.000Z'),
        },
        {
          editionId: 'edition-1',
          resultVersionId: 'version-draft',
          status: 'draft',
          versionNumber: 3,
          createdAt: new Date('2026-08-11T09:00:00.000Z'),
        },
      ],
    });

    expect(result.snapshot.rulesetId).toBe('ruleset-1');
    expect(result.snapshot.sourceVersionIdsJson).toEqual(['version-official']);
    expect(result.excludedSources).toEqual([
      {
        editionId: 'edition-1',
        resultVersionId: 'version-draft',
        status: 'draft',
        reason: 'not_official',
      },
    ]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      snapshotId: 'snapshot-1',
      resultVersionId: 'version-official',
      rank: 1,
    });

    expect(mockInsertCalls).toHaveLength(2);
    expect(mockInsertCalls[0]?.table).toBe(rankingSnapshots);
    expect(mockInsertCalls[1]?.table).toBe(rankingSnapshotRows);
  });

  it('builds national snapshot using current version candidates from the database', async () => {
    mockResultVersionsFindMany.mockResolvedValueOnce([
      {
        id: 'version-official',
        editionId: 'edition-1',
        status: 'official',
        versionNumber: 1,
        createdAt: new Date('2026-08-10T09:00:00.000Z'),
      },
    ]);

    mockSelect.mockReturnValueOnce(
      createSelectChain([
        {
          id: 'entry-1',
          resultVersionId: 'version-official',
          runnerFullName: 'Ana Runner',
          bibNumber: '101',
          discipline: 'trail_running',
          gender: 'female',
          age: 29,
          finishTimeMillis: 3_600_000,
        },
      ]),
    );

    mockInsertReturningQueue.push([makeSnapshotRow()], [makeSnapshotRankRow()]);

    const result = await computeNationalRankingSnapshot({ rulesetId: 'ruleset-1' });

    expect(mockResultVersionsFindMany).toHaveBeenCalledTimes(1);
    expect(result.includedSources).toEqual([
      expect.objectContaining({ resultVersionId: 'version-official' }),
    ]);
    expect(result.snapshot.rulesetId).toBe('ruleset-1');
  });
});
