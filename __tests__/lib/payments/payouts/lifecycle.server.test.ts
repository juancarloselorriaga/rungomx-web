const mockFindFirstPayoutRequest = jest.fn();
const mockFindFirstPayoutQuote = jest.fn();
const mockUpdate = jest.fn();
const mockUpdateSet = jest.fn();
const mockUpdateWhere = jest.fn();
const mockUpdateReturning = jest.fn();
const mockIngestMoneyMutationFromWorker = jest.fn();

const updateReturningQueue: Array<unknown[]> = [];

jest.mock('@/db', () => ({
  db: {
    query: {
      payoutRequests: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutRequest(...args),
      },
      payoutQuotes: {
        findFirst: (...args: unknown[]) => mockFindFirstPayoutQuote(...args),
      },
    },
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromWorker: (...args: unknown[]) => mockIngestMoneyMutationFromWorker(...args),
}));

import { transitionPayoutLifecycle } from '@/lib/payments/payouts/lifecycle';

describe('payout lifecycle transitions', () => {
  const now = new Date('2026-02-25T22:00:00.000Z');

  beforeEach(() => {
    updateReturningQueue.length = 0;

    mockFindFirstPayoutRequest.mockReset();
    mockFindFirstPayoutQuote.mockReset();
    mockUpdate.mockReset();
    mockUpdateSet.mockReset();
    mockUpdateWhere.mockReset();
    mockUpdateReturning.mockReset();
    mockIngestMoneyMutationFromWorker.mockReset();

    mockFindFirstPayoutRequest.mockResolvedValue({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'requested',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {},
    });

    mockFindFirstPayoutQuote.mockResolvedValue({
      requestedAmountMinor: 10000,
    });

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

    mockIngestMoneyMutationFromWorker.mockResolvedValue({
      traceId: 'payout-lifecycle:payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa:mark_processing',
      persistedEvents: [],
      deduplicated: false,
    });
  });

  it('transitions requested payout into processing and appends payout.processing via ingress', async () => {
    updateReturningQueue.push([
      {
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'processing',
      },
    ]);

    const result = await transitionPayoutLifecycle({
      payoutRequestId: 'payout-request-id',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'mark_processing',
      now,
    });

    expect(result.status).toBe('processing');
    expect(result.transitionAction).toBe('mark_processing');
    expect(result.adjustmentAppliedMinor).toBe(0);
    expect(mockIngestMoneyMutationFromWorker).toHaveBeenCalledTimes(1);

    const ingressCall = mockIngestMoneyMutationFromWorker.mock.calls[0]![0] as {
      events: Array<{ eventName: string }>;
    };

    expect(ingressCall.events).toHaveLength(1);
    expect(ingressCall.events[0].eventName).toBe('payout.processing');
  });

  it('pauses processing payout with decrease-only risk adjustment and appends payout.adjusted', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'processing',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {
        currentRequestedAmountMinor: 10000,
      },
    });
    updateReturningQueue.push([
      {
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'paused',
      },
    ]);

    const result = await transitionPayoutLifecycle({
      payoutRequestId: 'payout-request-id',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'pause_for_risk',
      reasonCode: 'high_risk_dispute_signal',
      adjustedAmountMinor: 8000,
      now,
    });

    expect(result.status).toBe('paused');
    expect(result.adjustmentAppliedMinor).toBe(2000);
    expect(result.adjustedRequestedAmountMinor).toBe(8000);
    expect(mockIngestMoneyMutationFromWorker).toHaveBeenCalledTimes(1);

    const ingressCall = mockIngestMoneyMutationFromWorker.mock.calls[0]![0] as {
      events: Array<{ eventName: string }>;
    };

    expect(ingressCall.events.map((event) => event.eventName)).toEqual([
      'payout.paused',
      'payout.adjusted',
    ]);
  });

  it('rejects risk adjustments that are not decrease-only', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'processing',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {
        currentRequestedAmountMinor: 8000,
      },
    });

    await expect(
      transitionPayoutLifecycle({
        payoutRequestId: 'payout-request-id',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        action: 'pause_for_risk',
        reasonCode: 'high_risk_dispute_signal',
        adjustedAmountMinor: 9000,
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_RISK_ADJUSTMENT_NON_DECREASE',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromWorker).not.toHaveBeenCalled();
  });

  it('rejects transitions that are not allowed from current status', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'completed',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {},
    });

    await expect(
      transitionPayoutLifecycle({
        payoutRequestId: 'payout-request-id',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        action: 'resume',
        reasonCode: 'manual_resume',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_TRANSITION_NOT_ALLOWED',
    });

    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('requires reason code for pause_for_risk and fail actions', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'processing',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {},
    });

    await expect(
      transitionPayoutLifecycle({
        payoutRequestId: 'payout-request-id',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        action: 'pause_for_risk',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_TRANSITION_REASON_REQUIRED',
    });
  });

  it('blocks in_process execution mode in production', async () => {
    await expect(
      transitionPayoutLifecycle({
        payoutRequestId: 'payout-request-id',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        action: 'mark_processing',
        nodeEnv: 'production',
        executionMode: 'in_process',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_TRANSITION_MODE_BLOCKED',
    });

    expect(mockFindFirstPayoutRequest).not.toHaveBeenCalled();
  });

  it('requires worker runtime for queued worker execution in production', async () => {
    await expect(
      transitionPayoutLifecycle({
        payoutRequestId: 'payout-request-id',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        action: 'mark_processing',
        nodeEnv: 'production',
        executionMode: 'queued_worker',
        runtime: 'web',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_TRANSITION_RUNTIME_BLOCKED',
    });

    expect(mockFindFirstPayoutRequest).not.toHaveBeenCalled();
  });
});
