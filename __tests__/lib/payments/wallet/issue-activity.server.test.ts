const mockSelect = jest.fn();

jest.mock('@/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

import { getOrganizerWalletIssueActivity } from '@/lib/payments/wallet/issue-activity';

describe('payments wallet issue activity', () => {
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

  it('classifies mixed workflow events into Action Needed and In Progress buckets deterministically', async () => {
    queue.push([
      {
        id: 'event-dispute',
        traceId: 'trace-dispute',
        eventName: 'dispute.opened',
        entityType: 'dispute',
        entityId: 'dispute-1',
        occurredAt: new Date('2026-02-24T10:00:00.000Z'),
        createdAt: new Date('2026-02-24T10:00:01.000Z'),
        payloadJson: {},
      },
      {
        id: 'event-payout',
        traceId: 'trace-payout',
        eventName: 'payout.requested',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-24T09:00:00.000Z'),
        createdAt: new Date('2026-02-24T09:00:01.000Z'),
        payloadJson: {},
      },
      {
        id: 'event-refund',
        traceId: 'trace-refund',
        eventName: 'refund.executed',
        entityType: 'refund',
        entityId: 'refund-1',
        occurredAt: new Date('2026-02-24T08:00:00.000Z'),
        createdAt: new Date('2026-02-24T08:00:01.000Z'),
        payloadJson: {},
      },
      {
        id: 'event-subscription',
        traceId: 'trace-subscription',
        eventName: 'subscription.renewal_failed',
        entityType: 'subscription',
        entityId: 'subscription-1',
        occurredAt: new Date('2026-02-24T07:00:00.000Z'),
        createdAt: new Date('2026-02-24T07:00:01.000Z'),
        payloadJson: {},
      },
    ]);

    const result = await getOrganizerWalletIssueActivity({
      organizerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.actionNeededCount).toBe(2);
    expect(result.inProgressCount).toBe(2);

    expect(result.actionNeeded.map((item) => item.eventName).sort()).toEqual([
      'dispute.opened',
      'subscription.renewal_failed',
    ]);
    expect(result.inProgress.map((item) => item.eventName).sort()).toEqual([
      'payout.requested',
      'refund.executed',
    ]);

    for (const item of [...result.actionNeeded, ...result.inProgress]) {
      expect(item.state === 'action_needed' || item.state === 'in_progress').toBe(true);
    }
  });

  it('returns empty grouped buckets when no issue-focused events exist', async () => {
    queue.push([]);

    const now = new Date('2026-02-24T12:00:00.000Z');
    const result = await getOrganizerWalletIssueActivity({
      organizerId: '11111111-1111-4111-8111-111111111111',
      now,
    });

    expect(result.asOf).toEqual(now);
    expect(result.actionNeeded).toEqual([]);
    expect(result.inProgress).toEqual([]);
    expect(result.actionNeededCount).toBe(0);
    expect(result.inProgressCount).toBe(0);
  });

  it('falls back to deterministic in-progress classification for unexpected event names', async () => {
    queue.push([
      {
        id: 'event-unknown',
        traceId: 'trace-unknown',
        eventName: 'custom.future_event',
        entityType: 'custom',
        entityId: 'custom-1',
        occurredAt: new Date('2026-02-24T06:00:00.000Z'),
        createdAt: new Date('2026-02-24T06:00:01.000Z'),
        payloadJson: {},
      },
    ]);

    const result = await getOrganizerWalletIssueActivity({
      organizerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.actionNeededCount).toBe(0);
    expect(result.inProgressCount).toBe(1);
    expect(result.inProgress[0]!.state).toBe('in_progress');
  });

  it('surfaces recovery guidance for debt-threshold pause/resume policy events', async () => {
    queue.push([
      {
        id: 'event-debt-pause',
        traceId: 'trace-debt-pause',
        eventName: 'debt_control.pause_required',
        entityType: 'debt_policy',
        entityId: 'policy-1',
        occurredAt: new Date('2026-02-24T11:00:00.000Z'),
        createdAt: new Date('2026-02-24T11:00:01.000Z'),
        payloadJson: {
          policyCode: 'debt_threshold_v1',
          reasonCode: 'debt_threshold_pause_required',
          guidanceCode: 'reduce_debt_below_resume_threshold',
          debtAmount: { amountMinor: 75000, currency: 'MXN' },
          pauseThresholdAmount: { amountMinor: 50000, currency: 'MXN' },
          resumeThresholdAmount: { amountMinor: 25000, currency: 'MXN' },
        },
      },
      {
        id: 'event-debt-resume',
        traceId: 'trace-debt-resume',
        eventName: 'debt_control.resume_allowed',
        entityType: 'debt_policy',
        entityId: 'policy-1',
        occurredAt: new Date('2026-02-24T10:30:00.000Z'),
        createdAt: new Date('2026-02-24T10:30:01.000Z'),
        payloadJson: {
          policyCode: 'debt_threshold_v1',
          reasonCode: 'debt_threshold_resume_allowed',
          guidanceCode: 'paid_registrations_resumed',
          debtAmount: { amountMinor: 12000, currency: 'MXN' },
          pauseThresholdAmount: { amountMinor: 50000, currency: 'MXN' },
          resumeThresholdAmount: { amountMinor: 25000, currency: 'MXN' },
        },
      },
    ]);

    const result = await getOrganizerWalletIssueActivity({
      organizerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.actionNeededCount).toBe(1);
    expect(result.inProgressCount).toBe(1);

    const pauseItem = result.actionNeeded[0]!;
    expect(pauseItem.eventName).toBe('debt_control.pause_required');
    expect(pauseItem.recoveryGuidance).toEqual({
      policyCode: 'debt_threshold_v1',
      reasonCode: 'debt_threshold_pause_required',
      guidanceCode: 'reduce_debt_below_resume_threshold',
      debtMinor: 75000,
      pauseThresholdMinor: 50000,
      resumeThresholdMinor: 25000,
    });

    const resumeItem = result.inProgress[0]!;
    expect(resumeItem.eventName).toBe('debt_control.resume_allowed');
    expect(resumeItem.recoveryGuidance?.guidanceCode).toBe('paid_registrations_resumed');
  });

  it('classifies paused payouts as Action Needed and resumed payouts as In Progress', async () => {
    queue.push([
      {
        id: 'event-payout-paused',
        traceId: 'trace-payout-paused',
        eventName: 'payout.paused',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-24T11:30:00.000Z'),
        createdAt: new Date('2026-02-24T11:30:01.000Z'),
        payloadJson: { reasonCode: 'high_risk_dispute_signal' },
      },
      {
        id: 'event-payout-resumed',
        traceId: 'trace-payout-resumed',
        eventName: 'payout.resumed',
        entityType: 'payout',
        entityId: 'payout-1',
        occurredAt: new Date('2026-02-24T11:00:00.000Z'),
        createdAt: new Date('2026-02-24T11:00:01.000Z'),
        payloadJson: { reasonCode: 'risk_conditions_resolved' },
      },
    ]);

    const result = await getOrganizerWalletIssueActivity({
      organizerId: '11111111-1111-4111-8111-111111111111',
    });

    expect(result.actionNeededCount).toBe(1);
    expect(result.inProgressCount).toBe(1);
    expect(result.actionNeeded[0]!.eventName).toBe('payout.paused');
    expect(result.inProgress[0]!.eventName).toBe('payout.resumed');
  });
});
