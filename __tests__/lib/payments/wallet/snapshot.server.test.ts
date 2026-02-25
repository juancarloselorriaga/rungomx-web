const mockSelect = jest.fn();

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

describe('payments wallet snapshot', () => {
  const queue: Array<Array<Record<string, unknown>>> = [];

  beforeEach(() => {
    queue.length = 0;
    mockSelect.mockReset();
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          orderBy: async () => queue.shift() ?? [],
        }),
      }),
    }));
  });

  it('applies deterministic repayment waterfall from new earnings', async () => {
    queue.push([
      {
        eventName: 'refund.executed',
        occurredAt: new Date('2026-02-23T19:15:00.000Z'),
        payloadJson: {
          refundAmount: { amountMinor: 500, currency: 'MXN' },
        },
      },
      {
        eventName: 'payment.captured',
        occurredAt: new Date('2026-02-23T19:30:00.000Z'),
        payloadJson: {
          netAmount: { amountMinor: 300, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletBucketSnapshot({
      organizerId: '11111111-1111-4111-8111-111111111111',
      now: new Date('2026-02-23T20:00:00.000Z'),
    });

    expect(result.asOf).toEqual(new Date('2026-02-23T19:30:00.000Z'));
    expect(result.buckets).toEqual({
      availableMinor: 0,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 200,
    });
    expect(result.debt).toEqual({
      waterfallOrder: ['disputes', 'refunds', 'fees'],
      categoryBalancesMinor: {
        disputes: 0,
        refunds: 200,
        fees: 0,
      },
      repaymentAppliedMinor: 300,
    });
  });

  it('returns zeroed buckets and debt projection when organizer has no wallet events', async () => {
    queue.push([]);

    const now = new Date('2026-02-23T21:00:00.000Z');
    const result = await getOrganizerWalletBucketSnapshot({
      organizerId: '22222222-2222-4222-8222-222222222222',
      now,
    });

    expect(result.asOf).toEqual(now);
    expect(result.buckets).toEqual({
      availableMinor: 0,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 0,
    });
    expect(result.debt).toEqual({
      waterfallOrder: ['disputes', 'refunds', 'fees'],
      categoryBalancesMinor: {
        disputes: 0,
        refunds: 0,
        fees: 0,
      },
      repaymentAppliedMinor: 0,
    });
  });

  it('keeps dispute debt category and applies repayment before lower-priority categories', async () => {
    queue.push([
      {
        eventName: 'dispute.debt_posted',
        occurredAt: new Date('2026-02-24T04:00:00.000Z'),
        payloadJson: {
          debtAmount: { amountMinor: 700, currency: 'MXN' },
        },
      },
      {
        eventName: 'financial.adjustment_posted',
        occurredAt: new Date('2026-02-24T04:05:00.000Z'),
        payloadJson: {
          adjustmentCode: 'platform_fee_correction',
          amount: { amountMinor: -400, currency: 'MXN' },
        },
      },
      {
        eventName: 'payment.captured',
        occurredAt: new Date('2026-02-24T04:10:00.000Z'),
        payloadJson: {
          netAmount: { amountMinor: 900, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletBucketSnapshot({
      organizerId: '33333333-3333-4333-8333-333333333333',
      now: new Date('2026-02-24T05:00:00.000Z'),
    });

    expect(result.buckets).toEqual({
      availableMinor: 0,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 200,
    });
    expect(result.debt.categoryBalancesMinor).toEqual({
      disputes: 0,
      refunds: 0,
      fees: 200,
    });
    expect(result.debt.repaymentAppliedMinor).toBe(900);
  });

  it('applies payout decrease-only adjustment and failed-release deltas deterministically', async () => {
    queue.push([
      {
        eventName: 'payment.captured',
        occurredAt: new Date('2026-02-24T06:00:00.000Z'),
        payloadJson: {
          netAmount: { amountMinor: 15000, currency: 'MXN' },
        },
      },
      {
        eventName: 'payout.requested',
        occurredAt: new Date('2026-02-24T06:10:00.000Z'),
        payloadJson: {
          requestedAmount: { amountMinor: 10000, currency: 'MXN' },
        },
      },
      {
        eventName: 'payout.adjusted',
        occurredAt: new Date('2026-02-24T06:20:00.000Z'),
        payloadJson: {
          previousRequestedAmount: { amountMinor: 10000, currency: 'MXN' },
          adjustedRequestedAmount: { amountMinor: 8000, currency: 'MXN' },
          reasonCode: 'high_risk_dispute_signal',
        },
      },
      {
        eventName: 'payout.failed',
        occurredAt: new Date('2026-02-24T06:30:00.000Z'),
        payloadJson: {
          failedAmount: { amountMinor: 8000, currency: 'MXN' },
          reasonCode: 'provider_transfer_failed',
        },
      },
    ]);

    const result = await getOrganizerWalletBucketSnapshot({
      organizerId: '44444444-4444-4444-8444-444444444444',
      now: new Date('2026-02-24T07:00:00.000Z'),
    });

    expect(result.buckets).toEqual({
      availableMinor: 15000,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 0,
    });
    expect(result.debt.categoryBalancesMinor).toEqual({
      disputes: 0,
      refunds: 0,
      fees: 0,
    });
  });
});
