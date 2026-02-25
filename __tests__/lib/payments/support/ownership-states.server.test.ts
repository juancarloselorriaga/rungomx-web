import { projectOwnershipTimeline } from '@/lib/payments/support/ownership-states';

describe('support ownership state projection', () => {
  it('labels events as Action Needed or In Progress with deterministic ordering', () => {
    const result = projectOwnershipTimeline({
      rootEntityType: 'dispute_case',
      events: [
        {
          id: 'event-2',
          eventName: 'dispute.under_review',
          occurredAt: new Date('2026-02-20T11:00:00.000Z'),
        },
        {
          id: 'event-1',
          eventName: 'dispute.opened',
          occurredAt: new Date('2026-02-20T10:00:00.000Z'),
        },
      ],
    });

    expect(result.timeline).toEqual([
      {
        eventId: 'event-1',
        eventName: 'dispute.opened',
        occurredAt: new Date('2026-02-20T10:00:00.000Z'),
        ownershipState: 'action_needed',
        currentOwner: 'organizer',
        nextExpectedTransition: 'dispute.evidence_submitted_or_deadline_elapsed',
      },
      {
        eventId: 'event-2',
        eventName: 'dispute.under_review',
        occurredAt: new Date('2026-02-20T11:00:00.000Z'),
        ownershipState: 'in_progress',
        currentOwner: 'platform',
        nextExpectedTransition: 'dispute.won_or_lost',
      },
    ]);

    expect(result.currentState).toBe('in_progress');
    expect(result.currentOwner).toBe('platform');
    expect(result.nextExpectedTransition).toBe('dispute.won_or_lost');
  });

  it('exposes explicit current owner and next transition for escalated payout cases', () => {
    const result = projectOwnershipTimeline({
      rootEntityType: 'payout_request',
      events: [
        {
          id: 'event-1',
          eventName: 'payout.processing_started',
          occurredAt: new Date('2026-02-21T10:00:00.000Z'),
        },
        {
          id: 'event-2',
          eventName: 'payout.failed',
          occurredAt: new Date('2026-02-21T11:00:00.000Z'),
        },
      ],
    });

    expect(result.currentState).toBe('action_needed');
    expect(result.currentOwner).toBe('support');
    expect(result.nextExpectedTransition).toBe('payout.retry_or_manual_resolution');
  });

  it('falls back to deterministic defaults for unknown event names', () => {
    const result = projectOwnershipTimeline({
      rootEntityType: 'refund_request',
      events: [
        {
          id: 'event-1',
          eventName: 'refund.custom_transition',
          occurredAt: new Date('2026-02-22T10:00:00.000Z'),
        },
      ],
    });

    expect(result.timeline[0]).toEqual({
      eventId: 'event-1',
      eventName: 'refund.custom_transition',
      occurredAt: new Date('2026-02-22T10:00:00.000Z'),
      ownershipState: 'action_needed',
      currentOwner: 'support',
      nextExpectedTransition: 'refund.follow_up',
    });
  });
});
