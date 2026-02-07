type SelectChainWithLimit = {
  from: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
};

const mockSelect = jest.fn();

function createSelectChainWithLimit(rows: unknown[]): SelectChainWithLimit {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);

  return chain;
}

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getCorrectionLifecycleMetrics } from '@/lib/events/results/queries';

describe('correction lifecycle metrics query', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-02-08T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('aggregates status counts, median resolution, pending aging, and export rows', async () => {
    const rows = [
      {
        requestId: 'request-pending-old',
        status: 'pending',
        reason: 'Pending review',
        requestedByUserId: 'runner-1',
        reviewedByUserId: null,
        requestedAt: new Date('2026-02-05T12:00:00.000Z'),
        reviewedAt: null,
        editionId: 'edition-1',
        editionLabel: '2026',
        organizationId: 'org-1',
      },
      {
        requestId: 'request-approved',
        status: 'approved',
        reason: 'Approved update',
        requestedByUserId: 'runner-2',
        reviewedByUserId: 'organizer-1',
        requestedAt: new Date('2026-02-08T09:00:00.000Z'),
        reviewedAt: new Date('2026-02-08T11:00:00.000Z'),
        editionId: 'edition-1',
        editionLabel: '2026',
        organizationId: 'org-1',
      },
      {
        requestId: 'request-rejected',
        status: 'rejected',
        reason: 'Rejected update',
        requestedByUserId: 'runner-3',
        reviewedByUserId: 'organizer-2',
        requestedAt: new Date('2026-02-08T07:00:00.000Z'),
        reviewedAt: new Date('2026-02-08T08:00:00.000Z'),
        editionId: 'edition-1',
        editionLabel: '2026',
        organizationId: 'org-1',
      },
    ];

    const selectChain = createSelectChainWithLimit(rows);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await getCorrectionLifecycleMetrics({
      editionId: 'edition-1',
      organizationId: 'org-1',
      requestedFrom: new Date('2026-02-01T00:00:00.000Z'),
      requestedTo: new Date('2026-02-10T23:59:59.999Z'),
    });

    expect(selectChain.limit).toHaveBeenCalledWith(1000);
    expect(result.statusCounts).toEqual({
      total: 3,
      pending: 1,
      approved: 1,
      rejected: 1,
    });
    expect(result.medianResolutionMillis).toBe(5_400_000);
    expect(result.medianResolutionHours).toBe(1.5);
    expect(result.pendingAging).toEqual({
      totalPending: 1,
      oldestPendingAgeHours: 72,
      buckets: {
        lessThan24Hours: 0,
        oneToThreeDays: 0,
        threeToSevenDays: 1,
        moreThanSevenDays: 0,
      },
    });
    expect(result.agingHighlights).toEqual([
      {
        requestId: 'request-pending-old',
        editionId: 'edition-1',
        editionLabel: '2026',
        organizationId: 'org-1',
        requestedByUserId: 'runner-1',
        requestedAt: new Date('2026-02-05T12:00:00.000Z'),
        pendingAgeHours: 72,
      },
    ]);
    expect(result.exportRows).toHaveLength(3);
    expect(result.filters).toEqual({
      editionId: 'edition-1',
      organizationId: 'org-1',
      requestedFrom: new Date('2026-02-01T00:00:00.000Z'),
      requestedTo: new Date('2026-02-10T23:59:59.999Z'),
    });
  });

  it('returns empty-state metrics when no rows match filters', async () => {
    const selectChain = createSelectChainWithLimit([]);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await getCorrectionLifecycleMetrics();

    expect(result.statusCounts).toEqual({
      total: 0,
      pending: 0,
      approved: 0,
      rejected: 0,
    });
    expect(result.medianResolutionMillis).toBeNull();
    expect(result.medianResolutionHours).toBeNull();
    expect(result.pendingAging).toEqual({
      totalPending: 0,
      oldestPendingAgeHours: null,
      buckets: {
        lessThan24Hours: 0,
        oneToThreeDays: 0,
        threeToSevenDays: 0,
        moreThanSevenDays: 0,
      },
    });
    expect(result.agingHighlights).toEqual([]);
    expect(result.exportRows).toEqual([]);
  });
});
