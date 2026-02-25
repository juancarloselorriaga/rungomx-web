const mockFindFirstPayoutQueuedIntent = jest.fn();
const mockFindFirstPayoutRequest = jest.fn();
const mockInsert = jest.fn();
const mockInsertValues = jest.fn();
const mockInsertOnConflictDoNothing = jest.fn();
const mockInsertReturning = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateSet = jest.fn();
const mockUpdateWhere = jest.fn();
const mockUpdateReturning = jest.fn();
const mockGetOrganizerWalletBucketSnapshot = jest.fn();
const mockIngestMoneyMutationFromApi = jest.fn();
const mockCreatePayoutQuoteAndContract = jest.fn();

const insertReturningQueue: Array<unknown[]> = [];
const updateReturningQueue: Array<unknown[]> = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      payoutQueuedIntents: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutQueuedIntent(...args),
      },
      payoutRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutRequest(...args),
      },
    },
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/lib/payments/wallet/snapshot', () => ({
  getOrganizerWalletBucketSnapshot: (...args: unknown[]) =>
    mockGetOrganizerWalletBucketSnapshot(...args),
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromApi: (...args: unknown[]) => mockIngestMoneyMutationFromApi(...args),
}));

jest.mock('@/lib/payments/payouts/quote-contract', () => {
  class MockPayoutQuoteContractError extends Error {
    public readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }

  return {
    PayoutQuoteContractError: MockPayoutQuoteContractError,
    createPayoutQuoteAndContract: (...args: unknown[]) => mockCreatePayoutQuoteAndContract(...args),
  };
});

import {
  activateQueuedPayoutIntent,
  createQueuedPayoutIntent,
} from '@/lib/payments/payouts/queue-intents';
import { PayoutQuoteContractError } from '@/lib/payments/payouts/quote-contract';

describe('payout queued intents', () => {
  const now = new Date('2026-02-25T20:00:00.000Z');

  beforeEach(() => {
    insertReturningQueue.length = 0;
    updateReturningQueue.length = 0;

    mockFindFirstPayoutQueuedIntent.mockReset();
    mockFindFirstPayoutRequest.mockReset();
    mockInsert.mockReset();
    mockInsertValues.mockReset();
    mockInsertOnConflictDoNothing.mockReset();
    mockInsertReturning.mockReset();
    mockUpdate.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockGetOrganizerWalletBucketSnapshot.mockReset();
    mockIngestMoneyMutationFromApi.mockReset();
    mockCreatePayoutQuoteAndContract.mockReset();

    mockFindFirstPayoutQueuedIntent.mockResolvedValue(null);
    mockFindFirstPayoutRequest.mockResolvedValue(null);
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 1000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 1000,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });
    mockIngestMoneyMutationFromApi.mockResolvedValue({
      traceId: 'payout-queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      persistedEvents: [],
      deduplicated: false,
    });

    mockInsert.mockImplementation(() => ({
      values: (...valuesArgs: unknown[]) => {
        mockInsertValues(...valuesArgs);
        return {
          onConflictDoNothing: (...conflictArgs: unknown[]) => {
            mockInsertOnConflictDoNothing(...conflictArgs);
            return {
              returning: (...returningArgs: unknown[]) => {
                mockInsertReturning(...returningArgs);
                return Promise.resolve(insertReturningQueue.shift() ?? []);
              },
            };
          },
        };
      },
    }));

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockUpdateSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockUpdateWhere(...whereArgs);
            return {
              returning: (...returningArgs: unknown[]) => {
                mockUpdateReturning(...returningArgs);
                return Promise.resolve(updateReturningQueue.shift() ?? []);
              },
            };
          },
        };
      },
    }));
  });

  it('creates queued payout intent when organizer is ineligible for immediate payout', async () => {
    insertReturningQueue.push([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'queued',
        requestedAmountMinor: 5000,
        currency: 'MXN',
        blockedReasonCode: 'insufficient_available_after_deductions',
        criteriaFingerprint: 'f'.repeat(64),
        queueTraceId: 'payout-queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        eligibilityCriteriaJson: { version: 'payout-queued-criteria-v1' },
        createdAt: now,
      },
    ]);

    const result = await createQueuedPayoutIntent({
      organizerId: '11111111-1111-4111-8111-111111111111',
      createdByUserId: '22222222-2222-4222-8222-222222222222',
      requestedAmountMinor: 5000,
      idempotencyKey: 'queued-1',
      now,
    });

    expect(result.status).toBe('queued');
    expect(result.idempotencyReused).toBe(false);
    expect(result.requestedAmountMinor).toBe(5000);
    expect(result.blockedReasonCode).toBe('insufficient_available_after_deductions');
    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
    const ingressCall = mockIngestMoneyMutationFromApi.mock.calls[0]![0] as {
      events: Array<{ eventName: string }>;
    };
    expect(ingressCall.events[0].eventName).toBe('payout.queued');
  });

  it('returns existing queued intent for idempotent retries and reuses ingress dedup', async () => {
    mockFindFirstPayoutQueuedIntent.mockResolvedValueOnce({
      id: 'existing-intent-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      requestedAmountMinor: 5000,
      currency: 'MXN',
      blockedReasonCode: 'requested_exceeds_current_withdrawable',
      criteriaFingerprint: 'f'.repeat(64),
      queueTraceId: 'payout-queue:existing-intent-id',
      eligibilityCriteriaJson: { version: 'payout-queued-criteria-v1' },
      createdAt: now,
    });
    mockIngestMoneyMutationFromApi.mockResolvedValueOnce({
      traceId: 'payout-queue:existing-intent-id',
      persistedEvents: [],
      deduplicated: true,
    });

    const result = await createQueuedPayoutIntent({
      organizerId: '11111111-1111-4111-8111-111111111111',
      createdByUserId: '22222222-2222-4222-8222-222222222222',
      requestedAmountMinor: 5000,
      idempotencyKey: 'queued-1',
      now,
    });

    expect(result.idempotencyReused).toBe(true);
    expect(result.ingressDeduplicated).toBe(true);
    expect(result.payoutQueuedIntentId).toBe('existing-intent-id');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('rejects queue creation when immediate payout is already eligible', async () => {
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValueOnce({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 10000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    await expect(
      createQueuedPayoutIntent({
        organizerId: '11111111-1111-4111-8111-111111111111',
        createdByUserId: '22222222-2222-4222-8222-222222222222',
        requestedAmountMinor: 3000,
        idempotencyKey: 'queued-2',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE',
    });
  });

  it('queues intent when organizer has active payout lifecycle even if immediate funds are available', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'active-request-id',
      status: 'requested',
    });
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValueOnce({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 10000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });
    insertReturningQueue.push([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'queued',
        requestedAmountMinor: 3000,
        currency: 'MXN',
        blockedReasonCode: 'active_requested_payout_exists',
        criteriaFingerprint: 'f'.repeat(64),
        queueTraceId: 'payout-queue:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        eligibilityCriteriaJson: { version: 'payout-queued-criteria-v1' },
        createdAt: now,
      },
    ]);

    const result = await createQueuedPayoutIntent({
      organizerId: '11111111-1111-4111-8111-111111111111',
      createdByUserId: '22222222-2222-4222-8222-222222222222',
      requestedAmountMinor: 3000,
      idempotencyKey: 'queued-active-fallback',
      now,
    });

    expect(result.status).toBe('queued');
    expect(result.blockedReasonCode).toBe('active_requested_payout_exists');
    expect(result.idempotencyReused).toBe(false);
    expect(mockIngestMoneyMutationFromApi).toHaveBeenCalledTimes(1);
  });

  it('rejects queue creation when another active queued intent already exists', async () => {
    mockFindFirstPayoutQueuedIntent
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'existing-queued-intent',
        status: 'queued',
      });

    await expect(
      createQueuedPayoutIntent({
        organizerId: '11111111-1111-4111-8111-111111111111',
        createdByUserId: '22222222-2222-4222-8222-222222222222',
        requestedAmountMinor: 5000,
        idempotencyKey: 'queued-second-attempt',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_QUEUE_ALREADY_ACTIVE',
    });

    expect(mockInsert).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromApi).not.toHaveBeenCalled();
  });

  it('activates queued payout intent once eligibility is restored', async () => {
    mockFindFirstPayoutQueuedIntent.mockResolvedValueOnce({
      id: 'queued-intent-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      requestedAmountMinor: 5000,
      activatedAt: null,
      activatedPayoutQuoteId: null,
      activatedPayoutRequestId: null,
    });
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValueOnce({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 12000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });
    mockCreatePayoutQuoteAndContract.mockResolvedValueOnce({
      payoutQuoteId: 'quote-id',
      payoutRequestId: 'request-id',
    });
    updateReturningQueue.push([
      {
        id: 'queued-intent-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        status: 'activated',
        activatedAt: now,
        activatedPayoutQuoteId: 'quote-id',
        activatedPayoutRequestId: 'request-id',
      },
    ]);

    const result = await activateQueuedPayoutIntent({
      payoutQueuedIntentId: 'queued-intent-id',
      activatedByUserId: '22222222-2222-4222-8222-222222222222',
      now,
    });

    expect(result.activated).toBe(true);
    expect(result.reasonCode).toBe('activated');
    expect(result.payoutQuoteId).toBe('quote-id');
    expect(result.payoutRequestId).toBe('request-id');
    expect(mockCreatePayoutQuoteAndContract).toHaveBeenCalledTimes(1);
  });

  it('keeps queued status when activation eligibility is still not met', async () => {
    mockFindFirstPayoutQueuedIntent.mockResolvedValueOnce({
      id: 'queued-intent-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      requestedAmountMinor: 5000,
      activatedAt: null,
      activatedPayoutQuoteId: null,
      activatedPayoutRequestId: null,
    });
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValueOnce({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 2000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 1000,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    const result = await activateQueuedPayoutIntent({
      payoutQueuedIntentId: 'queued-intent-id',
      activatedByUserId: '22222222-2222-4222-8222-222222222222',
      now,
    });

    expect(result.activated).toBe(false);
    expect(result.reasonCode).toBe('still_ineligible');
    expect(result.status).toBe('queued');
    expect(mockCreatePayoutQuoteAndContract).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('keeps queued status when activation hits active payout lifecycle conflict', async () => {
    mockFindFirstPayoutQueuedIntent.mockResolvedValueOnce({
      id: 'queued-intent-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      status: 'queued',
      requestedAmountMinor: 5000,
      activatedAt: null,
      activatedPayoutQuoteId: null,
      activatedPayoutRequestId: null,
    });
    mockGetOrganizerWalletBucketSnapshot.mockResolvedValueOnce({
      organizerId: '11111111-1111-4111-8111-111111111111',
      asOf: now,
      buckets: {
        availableMinor: 12000,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: [],
        categoryBalancesMinor: {},
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });
    mockCreatePayoutQuoteAndContract.mockRejectedValueOnce(
      new PayoutQuoteContractError(
        'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED',
        'Organizer already has an active payout lifecycle.',
      ),
    );

    const result = await activateQueuedPayoutIntent({
      payoutQueuedIntentId: 'queued-intent-id',
      activatedByUserId: '22222222-2222-4222-8222-222222222222',
      now,
    });

    expect(result.activated).toBe(false);
    expect(result.reasonCode).toBe('active_payout_in_progress');
    expect(result.status).toBe('queued');
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});
