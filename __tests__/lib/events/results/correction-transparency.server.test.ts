type SelectChainWithLimit = {
  from: jest.Mock;
  innerJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
};

const mockSelect = jest.fn();
const mockUsersFindMany = jest.fn();

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
    query: {
      users: {
        findMany: (...args: unknown[]) => mockUsersFindMany(...args),
      },
    },
  },
}));

import {
  listCorrectionAuditTrailForEdition,
  listRecentPublicCorrectionSummaries,
} from '@/lib/events/results/queries';

describe('correction transparency queries', () => {
  beforeEach(() => {
    mockSelect.mockReset();
    mockUsersFindMany.mockReset();
    mockUsersFindMany.mockResolvedValue([]);
  });

  it('builds concise public correction summaries with approver attribution and change list', async () => {
    const selectRows = [
      {
        requestId: 'request-1',
        sourceResultVersionId: 'version-7',
        reason: 'Finish time correction',
        requestContext: {
          correctionPatch: {
            finishTimeMillis: 3_590_000,
            status: 'finish',
          },
          publication: {
            publishedResultVersionId: 'version-8',
            publishedAt: '2026-02-07T08:00:00.000Z',
          },
        },
        reviewedAt: new Date('2026-02-07T07:30:00.000Z'),
        reviewedByUserId: 'organizer-1',
        editionId: 'edition-1',
        editionLabel: '2026',
        editionSlug: 'ultra-valle-2026',
        seriesSlug: 'ultra-valle',
      },
    ];

    const selectChain = createSelectChainWithLimit(selectRows);
    mockSelect.mockReturnValueOnce(selectChain);
    mockUsersFindMany.mockResolvedValueOnce([
      {
        id: 'organizer-1',
        name: 'Jorge Organizer',
        email: 'jorge@example.com',
      },
    ]);

    const result = await listRecentPublicCorrectionSummaries(10);

    expect(selectChain.limit).toHaveBeenCalledWith(40);
    expect(result).toEqual([
      {
        requestId: 'request-1',
        sourceResultVersionId: 'version-7',
        correctedResultVersionId: 'version-8',
        editionId: 'edition-1',
        editionLabel: '2026',
        editionSlug: 'ultra-valle-2026',
        seriesSlug: 'ultra-valle',
        reason: 'Finish time correction',
        changeSummary: [
          { field: 'Finish time (ms)', value: '3590000' },
          { field: 'Result status', value: 'finish' },
        ],
        approvedAt: new Date('2026-02-07T08:00:00.000Z'),
        approvedByUserId: 'organizer-1',
        approvedByDisplayName: 'Jorge Organizer',
      },
    ]);
  });

  it('builds internal audit trail entries linked to version transitions', async () => {
    const selectRows = [
      {
        requestId: 'request-2',
        sourceResultVersionId: 'version-8',
        status: 'approved',
        reason: 'Age group correction',
        requestContext: {
          publication: {
            publishedResultVersionId: 'version-9',
            publishedAt: '2026-02-07T09:00:00.000Z',
          },
        },
        requestedByUserId: 'runner-1',
        reviewedByUserId: 'organizer-2',
        requestedAt: new Date('2026-02-07T08:30:00.000Z'),
        reviewedAt: new Date('2026-02-07T08:45:00.000Z'),
      },
    ];

    const selectChain = createSelectChainWithLimit(selectRows);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await listCorrectionAuditTrailForEdition('edition-2', 25);

    expect(selectChain.limit).toHaveBeenCalledWith(100);
    expect(result).toEqual([
      {
        requestId: 'request-2',
        sourceResultVersionId: 'version-8',
        correctedResultVersionId: 'version-9',
        status: 'approved',
        reason: 'Age group correction',
        requestedByUserId: 'runner-1',
        reviewedByUserId: 'organizer-2',
        requestedAt: new Date('2026-02-07T08:30:00.000Z'),
        reviewedAt: new Date('2026-02-07T08:45:00.000Z'),
        publishedAt: new Date('2026-02-07T09:00:00.000Z'),
      },
    ]);
  });
});
