const mockComputeNationalRankingSnapshot = jest.fn();
const mockRankingSnapshotsFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockRevalidateTag = jest.fn();
const mockUpdateSetCalls: unknown[] = [];
const mockUpdateReturningQueue: unknown[][] = [];

jest.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

jest.mock('@/lib/events/results/rankings', () => ({
  computeNationalRankingSnapshot: (...args: unknown[]) =>
    mockComputeNationalRankingSnapshot(...args),
}));

jest.mock('@/db', () => ({
  db: {
    query: {
      rankingSnapshots: {
        findFirst: (...args: unknown[]) => mockRankingSnapshotsFindFirst(...args),
      },
    },
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

import { rankingSnapshots } from '@/db/schema';
import {
  publishRankingSnapshot,
  recomputeAndPublishNationalRankingSnapshot,
} from '@/lib/events/results/ranking-publication';

function makeSnapshot(overrides?: Partial<typeof rankingSnapshots.$inferSelect>) {
  return {
    id: 'snapshot-1',
    rulesetId: 'ruleset-1',
    scope: 'national' as const,
    organizationId: null,
    sourceVersionIdsJson: ['version-1'],
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

describe('ranking snapshot publication orchestration', () => {
  beforeEach(() => {
    mockComputeNationalRankingSnapshot.mockReset();
    mockRankingSnapshotsFindFirst.mockReset();
    mockUpdate.mockReset();
    mockRevalidateTag.mockReset();
    mockUpdateSetCalls.length = 0;
    mockUpdateReturningQueue.length = 0;

    mockUpdate.mockImplementation(() => ({
      set: (values: unknown) => {
        mockUpdateSetCalls.push(values);

        return {
          where: () => ({
            returning: async () => {
              const next = mockUpdateReturningQueue.shift();
              return Array.isArray(next) ? next : [];
            },
          }),
        };
      },
    }));
  });

  it('promotes a newly published national snapshot and invalidates ranking cache tags', async () => {
    mockRankingSnapshotsFindFirst.mockResolvedValueOnce(makeSnapshot());
    mockUpdateReturningQueue.push([
      makeSnapshot({
        isCurrent: true,
        promotedAt: new Date('2026-08-10T11:00:00.000Z'),
      }),
    ]);

    const published = await publishRankingSnapshot('snapshot-1');

    expect(published.isCurrent).toBe(true);
    expect(published.promotedAt).toEqual(new Date('2026-08-10T11:00:00.000Z'));
    expect(mockUpdateSetCalls[0]).toEqual({ isCurrent: false });
    expect(mockUpdateSetCalls[1]).toEqual(
      expect.objectContaining({ isCurrent: true, promotedAt: expect.any(Date) }),
    );
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:ruleset:current', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:national', { expire: 0 });
  });

  it('invalidates organizer-scoped tag when organizer snapshot is promoted', async () => {
    mockRankingSnapshotsFindFirst.mockResolvedValueOnce(
      makeSnapshot({ scope: 'organizer', organizationId: 'org-1' }),
    );
    mockUpdateReturningQueue.push([
      makeSnapshot({
        scope: 'organizer',
        organizationId: 'org-1',
        isCurrent: true,
        promotedAt: new Date('2026-08-10T12:00:00.000Z'),
      }),
    ]);

    await publishRankingSnapshot('snapshot-1');

    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:ruleset:current', { expire: 0 });
    expect(mockRevalidateTag).toHaveBeenCalledWith('rankings:organizer:org-1', { expire: 0 });
  });

  it('recomputes then publishes snapshot while keeping historical snapshots available', async () => {
    mockComputeNationalRankingSnapshot.mockResolvedValueOnce({
      snapshot: makeSnapshot({ id: 'snapshot-new', isCurrent: false }),
      rows: [
        {
          id: 'row-1',
          snapshotId: 'snapshot-new',
          rank: 1,
          resultEntryId: 'entry-1',
          resultVersionId: 'version-1',
          runnerFullName: 'Ana Runner',
          bibNumber: '101',
          discipline: 'trail_running',
          gender: 'female',
          age: 29,
          finishTimeMillis: 3_600_000,
          metadataJson: {},
          createdAt: new Date('2026-08-10T10:00:00.000Z'),
          updatedAt: new Date('2026-08-10T10:00:00.000Z'),
        },
      ],
      includedSources: [
        {
          editionId: 'edition-1',
          resultVersionId: 'version-1',
          status: 'official',
          versionNumber: 2,
          createdAt: new Date('2026-08-10T09:00:00.000Z'),
        },
      ],
      excludedSources: [
        {
          editionId: 'edition-1',
          resultVersionId: 'version-draft',
          status: 'draft',
          reason: 'not_official',
        },
      ],
    });

    mockRankingSnapshotsFindFirst.mockResolvedValueOnce(makeSnapshot({ id: 'snapshot-new' }));
    mockUpdateReturningQueue.push([makeSnapshot({ id: 'snapshot-new', isCurrent: true })]);

    const result = await recomputeAndPublishNationalRankingSnapshot({
      rulesetId: 'ruleset-1',
      triggerResultVersionId: 'version-1',
    });

    expect(mockComputeNationalRankingSnapshot).toHaveBeenCalledWith({
      rulesetId: 'ruleset-1',
      triggerResultVersionId: 'version-1',
    });
    expect(result.snapshot.id).toBe('snapshot-new');
    expect(result.publishedSnapshot.isCurrent).toBe(true);
    expect(result.excludedSources).toEqual([
      {
        editionId: 'edition-1',
        resultVersionId: 'version-draft',
        status: 'draft',
        reason: 'not_official',
      },
    ]);
  });
});
