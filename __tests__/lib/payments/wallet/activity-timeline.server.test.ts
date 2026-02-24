const mockSelect = jest.fn();

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getOrganizerWalletActivityTimeline } from '@/lib/payments/wallet/activity-timeline';

describe('payments wallet activity timeline', () => {
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

  it('builds deterministic day-grouped timeline entries with debt projection details', async () => {
    queue.push([
      {
        id: 'event-1',
        traceId: 'trace-1',
        eventName: 'payment.captured',
        entityType: 'registration',
        entityId: 'registration-1',
        occurredAt: new Date('2026-02-23T10:00:00.000Z'),
        payloadJson: {
          netAmount: { amountMinor: 1000, currency: 'MXN' },
        },
      },
      {
        id: 'event-2',
        traceId: 'trace-2',
        eventName: 'payout.requested',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-23T11:00:00.000Z'),
        payloadJson: {
          requestedAmount: { amountMinor: 300, currency: 'MXN' },
        },
      },
      {
        id: 'event-3',
        traceId: 'trace-3',
        eventName: 'refund.executed',
        entityType: 'refund',
        entityId: 'refund-1',
        occurredAt: new Date('2026-02-24T09:00:00.000Z'),
        payloadJson: {
          refundAmount: { amountMinor: 100, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletActivityTimeline({
      organizerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.totals).toEqual({
      availableMinor: 600,
      processingMinor: 300,
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
    expect(result.entryCount).toBe(3);
    expect(result.filteredEntryCount).toBe(3);

    expect(result.dayGroups.map((group) => group.day)).toEqual(['2026-02-24', '2026-02-23']);

    const latestEntry = result.dayGroups[0]!.entries[0]!;
    expect(latestEntry.before).toEqual({
      availableMinor: 700,
      processingMinor: 300,
      frozenMinor: 0,
      debtMinor: 0,
    });
    expect(latestEntry.after).toEqual({
      availableMinor: 600,
      processingMinor: 300,
      frozenMinor: 0,
      debtMinor: 0,
    });
    expect(latestEntry.debt.repaymentAppliedMinor).toBe(0);
    expect(latestEntry.debt.categoryBalancesMinor).toEqual({
      disputes: 0,
      refunds: 0,
      fees: 0,
    });
  });

  it('applies scope filter to visible entries while preserving totals and debt projection', async () => {
    queue.push([
      {
        id: 'event-1',
        traceId: 'trace-1',
        eventName: 'payment.captured',
        entityType: 'registration',
        entityId: 'registration-1',
        occurredAt: new Date('2026-02-23T10:00:00.000Z'),
        payloadJson: {
          netAmount: { amountMinor: 1000, currency: 'MXN' },
        },
      },
      {
        id: 'event-2',
        traceId: 'trace-2',
        eventName: 'refund.executed',
        entityType: 'refund',
        entityId: 'refund-1',
        occurredAt: new Date('2026-02-24T09:00:00.000Z'),
        payloadJson: {
          refundAmount: { amountMinor: 100, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletActivityTimeline({
      organizerId: '11111111-1111-4111-8111-111111111111',
      scope: 'refund.executed',
    });

    expect(result.scope).toBe('refund.executed');
    expect(result.entryCount).toBe(2);
    expect(result.filteredEntryCount).toBe(1);
    expect(result.dayGroups).toHaveLength(1);
    expect(result.dayGroups[0]!.entries).toHaveLength(1);
    expect(result.dayGroups[0]!.entries[0]!.eventName).toBe('refund.executed');
    expect(result.totals).toEqual({
      availableMinor: 900,
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

  it('returns empty day groups and zero totals when no events are available', async () => {
    queue.push([]);

    const now = new Date('2026-02-24T12:00:00.000Z');
    const result = await getOrganizerWalletActivityTimeline({
      organizerId: '11111111-1111-4111-8111-111111111111',
      now,
    });

    expect(result.asOf).toEqual(now);
    expect(result.totals).toEqual({
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
    expect(result.dayGroups).toEqual([]);
    expect(result.entryCount).toBe(0);
    expect(result.filteredEntryCount).toBe(0);
  });

  it('applies repayment to debt categories when earnings arrive after debt posting', async () => {
    queue.push([
      {
        id: 'event-1',
        traceId: 'trace-1',
        eventName: 'dispute.debt_posted',
        entityType: 'dispute',
        entityId: 'dispute-1',
        occurredAt: new Date('2026-02-24T08:00:00.000Z'),
        payloadJson: {
          debtAmount: { amountMinor: 1000, currency: 'MXN' },
        },
      },
      {
        id: 'event-2',
        traceId: 'trace-2',
        eventName: 'payment.captured',
        entityType: 'registration',
        entityId: 'registration-1',
        occurredAt: new Date('2026-02-24T09:00:00.000Z'),
        payloadJson: {
          netAmount: { amountMinor: 600, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletActivityTimeline({
      organizerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.totals).toEqual({
      availableMinor: 0,
      processingMinor: 0,
      frozenMinor: 0,
      debtMinor: 400,
    });
    expect(result.debt).toEqual({
      waterfallOrder: ['disputes', 'refunds', 'fees'],
      categoryBalancesMinor: {
        disputes: 400,
        refunds: 0,
        fees: 0,
      },
      repaymentAppliedMinor: 600,
    });

    const repaymentEntry = result.dayGroups[0]!.entries.find((entry) => entry.eventId === 'event-2');
    expect(repaymentEntry?.debt.repaymentAppliedMinor).toBe(600);
    expect(repaymentEntry?.debt.repaymentAppliedByCategoryMinor).toEqual({
      disputes: 600,
      refunds: 0,
      fees: 0,
    });
  });
});
