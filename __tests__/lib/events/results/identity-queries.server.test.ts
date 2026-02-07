type SelectChainWithLimit = {
  from: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
  limit: jest.Mock;
};

type SelectChainWithoutLimit = {
  from: jest.Mock;
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orderBy: jest.Mock;
};

const mockSelect = jest.fn();

function createSelectChainWithLimit(rows: unknown[]): SelectChainWithLimit {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);

  return chain;
}

function createSelectChainWithoutLimit(rows: unknown[]): SelectChainWithoutLimit {
  const chain = {
    from: jest.fn(),
    innerJoin: jest.fn(),
    leftJoin: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.innerJoin.mockReturnValue(chain);
  chain.leftJoin.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockResolvedValue(rows);

  return chain;
}

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import {
  getResultClaimResolutionTrace,
  listOrganizerCorrectionRequestsForEdition,
  listPendingResultClaimReviewsForEdition,
} from '@/lib/events/results/queries';

describe('results identity queries', () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it('maps pending review queue rows with normalized confidence scores', async () => {
    const queueRows = [
      {
        claimId: '11111111-1111-4111-8111-111111111111',
        entryId: '22222222-2222-4222-8222-222222222222',
        resultVersionId: '33333333-3333-4333-8333-333333333333',
        requestedByUserId: '44444444-4444-4444-8444-444444444444',
        confidenceBasisPoints: 735,
        runnerFullName: 'Sofia Runner',
        bibNumber: '42',
        createdAt: new Date('2026-02-07T02:00:00.000Z'),
      },
    ];
    const selectChain = createSelectChainWithLimit(queueRows);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await listPendingResultClaimReviewsForEdition(
      '55555555-5555-4555-8555-555555555555',
      50,
    );

    expect(selectChain.limit).toHaveBeenCalledWith(50);
    expect(result).toEqual([
      {
        claimId: '11111111-1111-4111-8111-111111111111',
        entryId: '22222222-2222-4222-8222-222222222222',
        resultVersionId: '33333333-3333-4333-8333-333333333333',
        requestedByUserId: '44444444-4444-4444-8444-444444444444',
        confidenceScore: 0.735,
        runnerFullName: 'Sofia Runner',
        bibNumber: '42',
        createdAt: new Date('2026-02-07T02:00:00.000Z'),
      },
    ]);
  });

  it('returns finalized claim trace payload with resolver and context fields', async () => {
    const traceRows = [
      {
        claimId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        entryId: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        resultVersionId: 'ccccccc3-cccc-4ccc-8ccc-ccccccccccc3',
        status: 'rejected',
        requestedByUserId: 'ddddddd4-dddd-4ddd-8ddd-ddddddddddd4',
        linkedUserId: null,
        reviewedByUserId: 'eeeeeee5-eeee-4eee-8eee-eeeeeeeeeee5',
        reviewedAt: new Date('2026-02-07T03:00:00.000Z'),
        reviewReason: 'identity_mismatch',
        reviewContext: { note: 'Organizer validated registration mismatch' },
        updatedAt: new Date('2026-02-07T03:00:00.000Z'),
      },
    ];
    const selectChain = createSelectChainWithoutLimit(traceRows);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await getResultClaimResolutionTrace(
      'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    );

    expect(result).toEqual([
      {
        claimId: 'aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
        entryId: 'bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
        resultVersionId: 'ccccccc3-cccc-4ccc-8ccc-ccccccccccc3',
        status: 'rejected',
        requestedByUserId: 'ddddddd4-dddd-4ddd-8ddd-ddddddddddd4',
        linkedUserId: null,
        reviewedByUserId: 'eeeeeee5-eeee-4eee-8eee-eeeeeeeeeee5',
        reviewedAt: new Date('2026-02-07T03:00:00.000Z'),
        reviewReason: 'identity_mismatch',
        reviewContext: { note: 'Organizer validated registration mismatch' },
        updatedAt: new Date('2026-02-07T03:00:00.000Z'),
      },
    ]);
  });

  it('maps organizer correction review queue rows with context and timeline metadata', async () => {
    const queueRows = [
      {
        requestId: 'f0b198f4-4c24-42ef-a8ff-4076fcb96336',
        entryId: '0caebdf8-3f46-4cbf-b36f-0dd6e4f981f2',
        resultVersionId: '010c4a3f-58d7-4f3f-bf49-83f0fe415ab7',
        resultVersionStatus: 'official',
        status: 'pending',
        reason: 'Age group should be 30-39',
        requestContext: { birthYear: 1992 },
        requestedByUserId: 'runner-123',
        requestedAt: new Date('2026-02-07T05:00:00.000Z'),
        reviewedByUserId: null,
        reviewedAt: null,
        reviewDecisionNote: null,
        runnerFullName: 'Sofia Runner',
        bibNumber: '42',
        resultStatus: 'finish',
        finishTimeMillis: 3_600_000,
      },
    ];
    const selectChain = createSelectChainWithLimit(queueRows);
    mockSelect.mockReturnValueOnce(selectChain);

    const result = await listOrganizerCorrectionRequestsForEdition(
      '55555555-5555-4555-8555-555555555555',
      40,
    );

    expect(selectChain.limit).toHaveBeenCalledWith(40);
    expect(result).toEqual([
      {
        requestId: 'f0b198f4-4c24-42ef-a8ff-4076fcb96336',
        entryId: '0caebdf8-3f46-4cbf-b36f-0dd6e4f981f2',
        resultVersionId: '010c4a3f-58d7-4f3f-bf49-83f0fe415ab7',
        resultVersionStatus: 'official',
        status: 'pending',
        reason: 'Age group should be 30-39',
        requestContext: { birthYear: 1992 },
        requestedByUserId: 'runner-123',
        requestedAt: new Date('2026-02-07T05:00:00.000Z'),
        reviewedByUserId: null,
        reviewedAt: null,
        reviewDecisionNote: null,
        runnerFullName: 'Sofia Runner',
        bibNumber: '42',
        resultStatus: 'finish',
        finishTimeMillis: 3_600_000,
      },
    ]);
  });
});
