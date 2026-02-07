type MutationReturningResult = unknown[] | { throw: unknown };

const EDITION_ID = '11111111-1111-4111-8111-111111111111';
const RESULT_VERSION_ID = '33333333-3333-4333-8333-333333333333';
const ORGANIZER_ID = '55555555-5555-4555-8555-555555555555';

const mockResultVersionsFindFirst = jest.fn();
const mockResultVersionsFindMany = jest.fn();
const mockUpdateSetCalls: Record<string, unknown>[] = [];
const mockUpdateReturningQueue: MutationReturningResult[] = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      resultVersions: {
        findFirst: (...args: unknown[]) => mockResultVersionsFindFirst(...args),
        findMany: (...args: unknown[]) => mockResultVersionsFindMany(...args),
      },
    },
    update: () => ({
      set: (values: Record<string, unknown>) => {
        mockUpdateSetCalls.push(values);
        return {
          where: () => ({
            returning: async () => {
              const nextResult = mockUpdateReturningQueue.shift();
              if (nextResult && typeof nextResult === 'object' && 'throw' in nextResult) {
                throw nextResult.throw;
              }
              return nextResult ?? [];
            },
          }),
        };
      },
    }),
  },
}));

import * as schema from '@/db/schema';
import {
  ACTIVE_OFFICIAL_POINTER_STATUSES,
  getActiveOfficialResultVersionForEdition,
  getAllowedResultVersionLifecycleTransitions,
  listResultVersionHistoryForEdition,
  transitionResultVersionLifecycle,
} from '@/lib/events/results/lifecycle/state-machine';

function makeResultVersionRow(
  overrides: Partial<typeof schema.resultVersions.$inferSelect> = {},
) {
  const now = new Date('2026-02-07T13:00:00.000Z');
  return {
    id: RESULT_VERSION_ID,
    editionId: EDITION_ID,
    status: 'draft',
    source: 'manual_offline',
    versionNumber: 1,
    parentVersionId: null,
    createdByUserId: ORGANIZER_ID,
    finalizedByUserId: null,
    finalizedAt: null,
    sourceFileChecksum: null,
    sourceReference: null,
    provenanceJson: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  mockResultVersionsFindFirst.mockReset();
  mockResultVersionsFindMany.mockReset();
  mockUpdateSetCalls.length = 0;
  mockUpdateReturningQueue.length = 0;
});

describe('results lifecycle state machine', () => {
  it('defines active pointer statuses as official and corrected', () => {
    expect(ACTIVE_OFFICIAL_POINTER_STATUSES).toEqual(['official', 'corrected']);
  });

  it('exposes allowed transitions per lifecycle state', () => {
    expect(getAllowedResultVersionLifecycleTransitions('draft')).toEqual([
      'official',
      'corrected',
    ]);
    expect(getAllowedResultVersionLifecycleTransitions('official')).toEqual([]);
    expect(getAllowedResultVersionLifecycleTransitions('corrected')).toEqual([]);
  });

  it('rejects invalid transitions with explicit error', async () => {
    mockResultVersionsFindFirst.mockResolvedValue(
      makeResultVersionRow({ status: 'official' }),
    );

    const result = await transitionResultVersionLifecycle({
      resultVersionId: RESULT_VERSION_ID,
      toStatus: 'corrected',
      finalizedByUserId: ORGANIZER_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected transition to fail');
    expect(result.code).toBe('INVALID_TRANSITION');
    expect(result.error).toContain('official -> corrected');
    expect(mockUpdateSetCalls).toHaveLength(0);
  });

  it('transitions draft to official and records lifecycle provenance', async () => {
    const draftVersion = makeResultVersionRow({ status: 'draft', versionNumber: 3 });
    const finalizedAt = new Date('2026-02-07T14:00:00.000Z');
    const updatedVersion = makeResultVersionRow({
      id: draftVersion.id,
      editionId: draftVersion.editionId,
      source: 'manual_offline',
      versionNumber: draftVersion.versionNumber,
      parentVersionId: draftVersion.parentVersionId,
      createdByUserId: draftVersion.createdByUserId,
      status: 'official',
      finalizedByUserId: ORGANIZER_ID,
      finalizedAt,
      provenanceJson: {
        lifecycle: {
          from: 'draft',
          to: 'official',
          finalizedByUserId: ORGANIZER_ID,
          finalizedAt: finalizedAt.toISOString(),
          transitionReason: 'attestation',
        },
      },
    });

    mockResultVersionsFindFirst.mockResolvedValue(draftVersion);
    mockUpdateReturningQueue.push([updatedVersion]);

    const result = await transitionResultVersionLifecycle({
      resultVersionId: RESULT_VERSION_ID,
      toStatus: 'official',
      finalizedByUserId: ORGANIZER_ID,
      finalizedAt,
      transitionReason: 'attestation',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected transition to succeed');
    expect(result.data.status).toBe('official');
    expect(result.data.finalizedByUserId).toBe(ORGANIZER_ID);
    expect(result.data.finalizedAt?.toISOString()).toBe(finalizedAt.toISOString());
    expect(mockUpdateSetCalls).toHaveLength(1);
    expect(mockUpdateSetCalls[0]).toMatchObject({
      status: 'official',
      finalizedByUserId: ORGANIZER_ID,
      finalizedAt,
    });
  });

  it('returns active official pointer as latest official/corrected version', async () => {
    mockResultVersionsFindMany.mockResolvedValue([
      makeResultVersionRow({
        id: '99999999-9999-4999-8999-999999999999',
        status: 'corrected',
        versionNumber: 5,
      }),
    ]);

    const pointer = await getActiveOfficialResultVersionForEdition(EDITION_ID);

    expect(pointer).not.toBeNull();
    expect(pointer?.status).toBe('corrected');
    expect(pointer?.versionNumber).toBe(5);
  });

  it('returns history in descending version order while keeping older versions queryable', async () => {
    mockResultVersionsFindMany.mockResolvedValue([
      makeResultVersionRow({
        id: 'version-5',
        status: 'corrected',
        versionNumber: 5,
      }),
      makeResultVersionRow({
        id: 'version-4',
        status: 'official',
        versionNumber: 4,
      }),
      makeResultVersionRow({
        id: 'version-3',
        status: 'draft',
        versionNumber: 3,
      }),
    ]);

    const history = await listResultVersionHistoryForEdition(EDITION_ID, 10);

    expect(history).toHaveLength(3);
    expect(history.map((item) => item.versionNumber)).toEqual([5, 4, 3]);
    expect(history.map((item) => item.status)).toEqual([
      'corrected',
      'official',
      'draft',
    ]);
  });
});
