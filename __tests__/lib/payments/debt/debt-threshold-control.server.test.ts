const mockFindManySeries = jest.fn();
const mockFindManyEditions = jest.fn();
const mockUpdate = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockGetOrganizerWalletBucketSnapshot = jest.fn();
const mockIngestMoneyMutationFromScheduler = jest.fn();

jest.mock('@/db', () => ({
  db: {
    query: {
      eventSeries: {
        findMany: (...args: unknown[]) => mockFindManySeries(...args),
      },
      eventEditions: {
        findMany: (...args: unknown[]) => mockFindManyEditions(...args),
      },
    },
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

jest.mock('@/lib/payments/wallet/snapshot', () => ({
  getOrganizerWalletBucketSnapshot: (...args: unknown[]) =>
    mockGetOrganizerWalletBucketSnapshot(...args),
}));

jest.mock('@/lib/payments/core/mutation-ingress-paths', () => ({
  ingestMoneyMutationFromScheduler: (...args: unknown[]) =>
    mockIngestMoneyMutationFromScheduler(...args),
}));

import {
  applyDebtThresholdRegistrationControl,
  evaluateDebtThresholdTransition,
  resolveDebtThresholdPolicyConfig,
} from '@/lib/payments/debt/debt-threshold-control';

describe('debt threshold registration control', () => {
  const organizerId = '11111111-1111-4111-8111-111111111111';

  beforeEach(() => {
    mockFindManySeries.mockReset();
    mockFindManyEditions.mockReset();
    mockUpdate.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
    mockGetOrganizerWalletBucketSnapshot.mockReset();
    mockIngestMoneyMutationFromScheduler.mockReset();

    mockUpdate.mockImplementation(() => ({
      set: (...setArgs: unknown[]) => {
        mockSet(...setArgs);
        return {
          where: (...whereArgs: unknown[]) => {
            mockWhere(...whereArgs);
            return Promise.resolve(undefined);
          },
        };
      },
    }));

    mockFindManySeries.mockResolvedValue([
      {
        id: '22222222-2222-4222-8222-222222222222',
      },
    ]);

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId,
      asOf: new Date('2026-02-24T10:00:00.000Z'),
      buckets: {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 0,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 0,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    mockIngestMoneyMutationFromScheduler.mockResolvedValue({
      traceId: 'debt-threshold-control:11111111-1111-4111-8111-111111111111:trace-1',
      deduplicated: false,
      persistedEvents: [],
    });
  });

  it('enforces hysteresis guard requiring pauseThresholdMinor >= resumeThresholdMinor', () => {
    expect(() =>
      resolveDebtThresholdPolicyConfig({
        pauseThresholdMinor: 10,
        resumeThresholdMinor: 20,
      }),
    ).toThrow('Debt threshold policy requires pauseThresholdMinor >= resumeThresholdMinor.');
  });

  it('evaluates deterministic pause/resume/no-change transitions', () => {
    expect(
      evaluateDebtThresholdTransition({
        debtMinor: 55_000,
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
        paidEditionCount: 2,
        pausedEditionCount: 0,
      }),
    ).toMatchObject({
      transitionState: 'pause_required',
      desiredPaused: true,
      reasonCode: 'debt_threshold_pause_required',
    });

    expect(
      evaluateDebtThresholdTransition({
        debtMinor: 10_000,
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
        paidEditionCount: 2,
        pausedEditionCount: 2,
      }),
    ).toMatchObject({
      transitionState: 'resume_allowed',
      desiredPaused: false,
      reasonCode: 'debt_threshold_resume_allowed',
    });

    expect(
      evaluateDebtThresholdTransition({
        debtMinor: 30_000,
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
        paidEditionCount: 2,
        pausedEditionCount: 2,
      }),
    ).toMatchObject({
      transitionState: 'no_change',
      desiredPaused: true,
      reasonCode: 'debt_threshold_hysteresis_hold_paused',
    });
  });

  it('pauses only paid editions and emits canonical pause event through scheduler ingress', async () => {
    mockFindManyEditions.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        isRegistrationPaused: false,
        distances: [
          {
            id: 'd1',
            pricingTiers: [{ priceCents: 5_000 }],
          },
        ],
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        isRegistrationPaused: false,
        distances: [
          {
            id: 'd2',
            pricingTiers: [{ priceCents: 2_500 }],
          },
        ],
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        isRegistrationPaused: false,
        distances: [
          {
            id: 'd3',
            pricingTiers: [{ priceCents: 0 }],
          },
        ],
      },
    ]);

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId,
      asOf: new Date('2026-02-24T10:00:00.000Z'),
      buckets: {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 95_000,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 95_000,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    const result = await applyDebtThresholdRegistrationControl({
      organizerId,
      now: new Date('2026-02-24T10:30:00.000Z'),
      policyConfig: {
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
      },
    });

    expect(result).toMatchObject({
      transitionState: 'pause_required',
      paidEditionCount: 2,
      freeEditionCount: 1,
      pausedEditionCountBefore: 0,
      pausedEditionCountAfter: 2,
      affectedEditionIds: [
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ],
    });

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith({ isRegistrationPaused: true });

    expect(mockIngestMoneyMutationFromScheduler).toHaveBeenCalledTimes(1);
    const ingressCall = mockIngestMoneyMutationFromScheduler.mock.calls[0]![0];
    expect(ingressCall.organizerId).toBe(organizerId);
    expect(ingressCall.events).toHaveLength(1);
    expect(ingressCall.events[0].eventName).toBe('debt_control.pause_required');
    expect(ingressCall.events[0].payload.reasonCode).toBe('debt_threshold_pause_required');
    expect(ingressCall.events[0].payload.affectedEditionIds).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ]);
  });

  it('resumes paid editions when debt recovers and emits resume event', async () => {
    mockFindManyEditions.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        isRegistrationPaused: true,
        distances: [
          {
            id: 'd1',
            pricingTiers: [{ priceCents: 4_000 }],
          },
        ],
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        isRegistrationPaused: false,
        distances: [
          {
            id: 'd2',
            pricingTiers: [{ priceCents: 0 }],
          },
        ],
      },
    ]);

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId,
      asOf: new Date('2026-02-24T11:00:00.000Z'),
      buckets: {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 10_000,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 10_000,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    const result = await applyDebtThresholdRegistrationControl({
      organizerId,
      now: new Date('2026-02-24T11:00:00.000Z'),
      policyConfig: {
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
      },
    });

    expect(result.transitionState).toBe('resume_allowed');
    expect(result.affectedEditionIds).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
    expect(mockSet).toHaveBeenCalledWith({ isRegistrationPaused: false });

    const ingressCall = mockIngestMoneyMutationFromScheduler.mock.calls[0]![0];
    expect(ingressCall.events[0].eventName).toBe('debt_control.resume_allowed');
    expect(ingressCall.events[0].payload.guidanceCode).toBe('paid_registrations_resumed');
  });

  it('is idempotent when no transition is required and does not emit duplicate events', async () => {
    mockFindManyEditions.mockResolvedValue([
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        isRegistrationPaused: true,
        distances: [
          {
            id: 'd1',
            pricingTiers: [{ priceCents: 6_000 }],
          },
        ],
      },
    ]);

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId,
      asOf: new Date('2026-02-24T11:15:00.000Z'),
      buckets: {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 80_000,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 80_000,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    const result = await applyDebtThresholdRegistrationControl({
      organizerId,
      now: new Date('2026-02-24T11:15:00.000Z'),
      policyConfig: {
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
      },
    });

    expect(result.transitionState).toBe('no_change');
    expect(result.reasonCode).toBe('debt_threshold_hold_paused');
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromScheduler).not.toHaveBeenCalled();
  });

  it('returns no-change when organizer has no paid editions and keeps free registrations untouched', async () => {
    mockFindManyEditions.mockResolvedValue([
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        isRegistrationPaused: false,
        distances: [
          {
            id: 'd3',
            pricingTiers: [{ priceCents: 0 }],
          },
        ],
      },
    ]);

    mockGetOrganizerWalletBucketSnapshot.mockResolvedValue({
      organizerId,
      asOf: new Date('2026-02-24T12:00:00.000Z'),
      buckets: {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
        debtMinor: 120_000,
      },
      debt: {
        waterfallOrder: ['disputes', 'refunds', 'fees'],
        categoryBalancesMinor: {
          disputes: 120_000,
          refunds: 0,
          fees: 0,
        },
        repaymentAppliedMinor: 0,
      },
      queryDurationMs: 2,
    });

    const result = await applyDebtThresholdRegistrationControl({
      organizerId,
      now: new Date('2026-02-24T12:00:00.000Z'),
      policyConfig: {
        pauseThresholdMinor: 50_000,
        resumeThresholdMinor: 25_000,
      },
    });

    expect(result).toMatchObject({
      transitionState: 'no_change',
      paidEditionCount: 0,
      freeEditionCount: 1,
      reasonCode: 'debt_threshold_no_paid_editions',
    });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockIngestMoneyMutationFromScheduler).not.toHaveBeenCalled();
  });
});
