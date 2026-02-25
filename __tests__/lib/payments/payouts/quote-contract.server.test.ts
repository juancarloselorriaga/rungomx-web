const mockFindFirstPayoutQuote = jest.fn();
const mockFindFirstPayoutRequest = jest.fn();
const mockFindFirstPayoutContract = jest.fn();
const mockInsert = jest.fn();
const mockValues = jest.fn();
const mockOnConflictDoNothing = jest.fn();
const mockReturning = jest.fn();
const mockGetOrganizerWalletBucketSnapshot = jest.fn();
const mockIngestMoneyMutationFromApi = jest.fn();

const insertReturningQueue: Array<unknown[]> = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      payoutQuotes: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutQuote(...args),
      },
      payoutRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutRequest(...args),
      },
      payoutContracts: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutContract(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
  },
}));

jest.mock('@/lib/payments/wallet/snapshot', () => ({
  getOrganizerWalletBucketSnapshot: (...args: unknown[]) =>
    mockGetOrganizerWalletBucketSnapshot(...args),
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApi: (...args: unknown[]) => mockIngestMoneyMutationFromApi(...args),
}));

import {
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  payoutContracts,
  payoutQuotes,
  payoutRequests,
} from '@/db/schema';
import {
  createPayoutQuoteAndContract,
  PayoutQuoteContractError,
} from '@/lib/payments/payouts/quote-contract';

describe('payout quote + contract creation', () => {
  const now = new Date('2026-02-25T18:00:00.000Z');

  beforeEach(() => {
    insertReturningQueue.length = 0;

    mockFindFirstPayoutQuote.mockReset();
    mockFindFirstPayoutRequest.mockReset();
    mockFindFirstPayoutContract.mockReset();
    mockInsert.mockReset();
    mockValues.mockReset();
    mockOnConflictDoNothing.mockReset();
    mockReturning.mockReset();
    mockGetOrganizerWalletBucketSnapshot.mockReset();
    mockIngestMoneyMutationFromApi.mockReset();

    mockFindFirstPayoutQuote.mockResolvedValue(null);
    mockFindFirstPayoutRequest.mockResolvedValue(null);
    mockFindFirstPayoutContract.mockResolvedValue(null);

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 12000,
        processingMinor: 1000,
        frozenMinor: 0,
        debtMinor: 2000,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    mockIngestMoneyMutationFromApi.mockResolvedValue({
      traceId: 'payout-request:99999999-9999-4999-8999-999999999999',
      persistedEvents: [],
      deduplicated: false,
    });

    mockInsert.mockImplementation(() => ({
      values: (...args: unknown[]) => {
        mockValues(...args);

        const executeReturning = (...returningArgs: unknown[]) => {
          mockReturning(...returningArgs);
          return Promise.resolve(insertReturningQueue.shift() ?? []);
        };

        return {
          onConflictDoNothing: (...conflictArgs: unknown[]) => {
            mockOnConflictDoNothing(...conflictArgs);
            return {
              returning: (...returningArgs: unknown[]) => executeReturning(...returningArgs),
            };
          },
          returning: (...returningArgs: unknown[]) => executeReturning(...returningArgs),
        };
      },
    }));
  });

  it('creates deterministic quote + request + contract and appends payout.requested via ingress', async () => {
    insertReturningQueue.push([{ id: 'quote-row-id' }]);
    insertReturningQueue.push([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ]);
    insertReturningQueue.push([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        baselineSnapshotJson: {
          version: 'payout-contract-v1',
        },
      },
    ]);

    const result = await createPayoutQuoteAndContract({
      organizerId: '11111111-1111-4111-8111-111111111111',
      requestedByUserId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'withdrawal-1',
      now,
    });

    expect(result.organizerId).toBe('11111111-1111-4111-8111-111111111111');
    expect(result.currency).toBe('MXN');
    expect(result.includedAmountMinor).toBe(12000);
    expect(result.deductionAmountMinor).toBe(2000);
    expect(result.maxWithdrawableAmountMinor).toBe(10000);
    expect(result.requestedAmountMinor).toBe(10000);
    expect(result.idempotencyReused).toBe(false);
    expect(result.ingressDeduplicated).toBe(false);

    expect(result.payoutQuoteId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(result.quoteFingerprint).toMatch(/^[0-9a-f]{64}$/);

    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
    const ingressCall = mockIngestMoneyMutationFromApi.mock.calls[0]![0] as {
      organizerId: string;
      idempotencyKey: string;
      events: Array<{
        eventName: string;
        payload: {
          payoutQuoteId: string;
          requestedAmount: {
            amountMinor: number;
            currency: string;
          };
        };
      }>;
    };

    expect(ingressCall.organizerId).toBe('11111111-1111-4111-8111-111111111111');
    expect(ingressCall.idempotencyKey).toMatch(/^payout-request:/);
    expect(ingressCall.events).toHaveLength(1);
    expect(ingressCall.events[0].eventName).toBe('payout.requested');
    expect(ingressCall.events[0].payload.requestedAmount.amountMinor).toBe(10000);
    expect(ingressCall.events[0].payload.requestedAmount.currency).toBe('MXN');
  });

  it('returns existing quote/request/contract on idempotent retry and skips new writes', async () => {
    mockFindFirstPayoutQuote.mockResolvedValueOnce({
      id: 'existing-quote-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      quoteFingerprint: 'f'.repeat(64),
      currency: 'MXN',
      includedAmountMinor: 9000,
      deductionAmountMinor: 1000,
      maxWithdrawableAmountMinor: 8000,
      requestedAmountMinor: 8000,
      eligibilitySnapshotJson: { version: 'payout-quote-eligibility-v1' },
      componentBreakdownJson: { version: 'payout-quote-components-v1' },
      requestedAt: now,
    });
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'existing-request-id',
      traceId: 'payout-request:existing-request-id',
    });
    mockFindFirstPayoutContract.mockResolvedValueOnce({
      id: 'existing-contract-id',
      baselineSnapshotJson: {
        version: 'payout-contract-v1',
      },
    });
    mockIngestMoneyMutationFromApi.mockResolvedValueOnce({
      traceId: 'payout-request:existing-request-id',
      persistedEvents: [],
      deduplicated: true,
    });

    const result = await createPayoutQuoteAndContract({
      organizerId: '11111111-1111-4111-8111-111111111111',
      requestedByUserId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'withdrawal-1',
      now,
    });

    expect(result.idempotencyReused).toBe(true);
    expect(result.ingressDeduplicated).toBe(true);
    expect(result.payoutQuoteId).toBe('existing-quote-id');
    expect(result.payoutRequestId).toBe('existing-request-id');
    expect(result.payoutContractId).toBe('existing-contract-id');
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
  });

  it('rejects requests above deterministic max withdrawable amount', async () => {
    await expect(
      createPayoutQuoteAndContract({
        organizerId: '11111111-1111-4111-8111-111111111111',
        requestedByUserId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'withdrawal-1',
        requestedAmountMinor: 10001,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE',
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
  });

  it('rejects creation when organizer already has an active payout lifecycle', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'active-request-id',
      status: 'processing',
    });

    await expect(
      createPayoutQuoteAndContract({
        organizerId: '11111111-1111-4111-8111-111111111111',
        requestedByUserId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'withdrawal-active-conflict',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED',
    });

    expect(mockGetOrganizerWalletBucketSnapshot).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
  });

  it('returns queue-required conflict outcome when active conflict policy is queue', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'active-request-id',
      status: 'requested',
    });

    await expect(
      createPayoutQuoteAndContract({
        organizerId: '11111111-1111-4111-8111-111111111111',
        requestedByUserId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'withdrawal-active-conflict-queue',
        activeConflictPolicy: 'queue',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
    });

    expect(mockGetOrganizerWalletBucketSnapshot).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
  });

  it('writes payout records while keeping canonical event append ingress-only', async () => {
    insertReturningQueue.push([{ id: 'quote-row-id' }]);
    insertReturningQueue.push([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
    ]);
    insertReturningQueue.push([
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        baselineSnapshotJson: { version: 'payout-contract-v1' },
      },
    ]);

    await createPayoutQuoteAndContract({
      organizerId: '11111111-1111-4111-8111-111111111111',
      requestedByUserId: '22222222-2222-4222-8222-222222222222',
      idempotencyKey: 'withdrawal-2',
      now,
    });

    const insertedTables = mockInsert.mock.calls.map((call) => call[0]);
    expect(insertedTables).toEqual(
      expect.arrayContaining([payoutQuotes, payoutRequests, payoutContracts]),
    );
    expect(insertedTables).not.toContain(moneyEvents);
    expect(insertedTables).not.toContain(moneyTraces);
    expect(insertedTables).not.toContain(moneyCommandIngestions);

    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
  });

  it('throws invalid amount error for non-positive requested values', async () => {
    await expect(
      createPayoutQuoteAndContract({
        organizerId: '11111111-1111-4111-8111-111111111111',
        requestedByUserId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'withdrawal-3',
        requestedAmountMinor: 0,
        now,
      }),
    ).rejects.toBeInstanceOf(PayoutQuoteContractError);
    await expect(
      createPayoutQuoteAndContract({
        organizerId: '11111111-1111-4111-8111-111111111111',
        requestedByUserId: '22222222-2222-4222-8222-222222222222',
        idempotencyKey: 'withdrawal-3',
        requestedAmountMinor: 0,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_REQUESTED_AMOUNT_INVALID',
    });
  });
});
