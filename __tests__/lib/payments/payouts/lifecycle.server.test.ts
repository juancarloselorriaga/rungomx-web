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

  it('reconciles optimistic transition race when update returns empty but refreshed status matches target', async () => {
    mockFindFirstPayoutRequest
      .mockResolvedValueOnce({
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'requested',
        traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        lifecycleContextJson: {},
      })
      .mockResolvedValueOnce({
        status: 'processing',
      });

    const result = await transitionPayoutLifecycle({
      payoutRequestId: 'payout-request-id',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'mark_processing',
      now,
    });

    expect(result.status).toBe('processing');
    expect(result.previousStatus).toBe('requested');
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockIngestMoneyMutationFromWorker).toHaveBeenCalledTimes(1);
  });

  it('throws update-failed when optimistic update returns empty and refreshed status mismatches target', async () => {
    mockFindFirstPayoutRequest
      .mockResolvedValueOnce({
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'requested',
        traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        lifecycleContextJson: {},
      })
      .mockResolvedValueOnce({
        status: 'requested',
      });

    await expect(
      transitionPayoutLifecycle({
        payoutRequestId: 'payout-request-id',
        actorUserId: '22222222-2222-4222-8222-222222222222',
        action: 'mark_processing',
        now,
      }),
    ).rejects.toMatchObject({
      code: 'PAYOUT_TRANSITION_UPDATE_FAILED',
    });

    expect(mockIngestMoneyMutationFromWorker).not.toHaveBeenCalled();
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

  it('emits payout.resumed payload branch with currentRequestedAmount and reasonCode', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'paused',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {
        currentRequestedAmountMinor: 7400,
      },
    });
    updateReturningQueue.push([
      {
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'processing',
      },
    ]);

    await transitionPayoutLifecycle({
      payoutRequestId: 'payout-request-id',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'resume',
      reasonCode: 'manual_resume',
      now,
    });

    const ingressCall = mockIngestMoneyMutationFromWorker.mock.calls[0]![0] as {
      events: Array<{
        eventName: string;
        payload: {
          currentRequestedAmount: {
            amountMinor: number;
          };
          reasonCode: string;
        };
      }>;
    };

    expect(ingressCall.events[0].eventName).toBe('payout.resumed');
    expect(ingressCall.events[0].payload.currentRequestedAmount.amountMinor).toBe(7400);
    expect(ingressCall.events[0].payload.reasonCode).toBe('manual_resume');
  });

  it('emits payout.completed payload branch with settledAmount', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'processing',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {
        currentRequestedAmountMinor: 6100,
      },
    });
    updateReturningQueue.push([
      {
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'completed',
      },
    ]);

    await transitionPayoutLifecycle({
      payoutRequestId: 'payout-request-id',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'complete',
      now,
    });

    const ingressCall = mockIngestMoneyMutationFromWorker.mock.calls[0]![0] as {
      events: Array<{
        eventName: string;
        payload: {
          settledAmount: {
            amountMinor: number;
          };
          reasonCode?: string;
        };
      }>;
    };

    expect(ingressCall.events[0].eventName).toBe('payout.completed');
    expect(ingressCall.events[0].payload.settledAmount.amountMinor).toBe(6100);
    expect(ingressCall.events[0].payload).not.toHaveProperty('reasonCode');
  });

  it('emits payout.failed payload branch with failedAmount and reasonCode', async () => {
    mockFindFirstPayoutRequest.mockResolvedValueOnce({
      id: 'payout-request-id',
      organizerId: '11111111-1111-4111-8111-111111111111',
      payoutQuoteId: 'payout-quote-id',
      status: 'processing',
      traceId: 'payout-request:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      lifecycleContextJson: {
        currentRequestedAmountMinor: 5900,
      },
    });
    updateReturningQueue.push([
      {
        id: 'payout-request-id',
        organizerId: '11111111-1111-4111-8111-111111111111',
        payoutQuoteId: 'payout-quote-id',
        status: 'failed',
      },
    ]);

    await transitionPayoutLifecycle({
      payoutRequestId: 'payout-request-id',
      actorUserId: '22222222-2222-4222-8222-222222222222',
      action: 'fail',
      reasonCode: 'bank_rejection',
      now,
    });

    const ingressCall = mockIngestMoneyMutationFromWorker.mock.calls[0]![0] as {
      events: Array<{
        eventName: string;
        payload: {
          failedAmount: {
            amountMinor: number;
          };
          reasonCode: string;
        };
      }>;
    };

    expect(ingressCall.events[0].eventName).toBe('payout.failed');
    expect(ingressCall.events[0].payload.failedAmount.amountMinor).toBe(5900);
    expect(ingressCall.events[0].payload.reasonCode).toBe('bank_rejection');
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
