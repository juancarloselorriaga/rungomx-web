'server only';

export const ownershipStateValues = ['action_needed', 'in_progress'] as const;
export type OwnershipState = (typeof ownershipStateValues)[number];

export const ownershipActorValues = ['attendee', 'organizer', 'support', 'platform'] as const;
export type OwnershipActor = (typeof ownershipActorValues)[number];

export type OwnershipProjectionEvent = {
  id: string;
  eventName: string;
  occurredAt: Date;
};

export type OwnershipTimelineEntry = {
  eventId: string;
  eventName: string;
  occurredAt: Date;
  ownershipState: OwnershipState;
  currentOwner: OwnershipActor;
  nextExpectedTransition: string;
};

export type OwnershipTimelineProjection = {
  currentState: OwnershipState;
  currentOwner: OwnershipActor;
  nextExpectedTransition: string;
  timeline: OwnershipTimelineEntry[];
};

type OwnershipRule = {
  ownershipState: OwnershipState;
  currentOwner: OwnershipActor;
  nextExpectedTransition: string;
};

const ownershipRuleMap: Record<string, OwnershipRule> = {
  // Refund lifecycle
  'refund.requested': {
    ownershipState: 'action_needed',
    currentOwner: 'organizer',
    nextExpectedTransition: 'refund.organizer_approved_or_denied',
  },
  'refund.escalated_admin_review': {
    ownershipState: 'action_needed',
    currentOwner: 'support',
    nextExpectedTransition: 'refund.admin_decision_recorded',
  },
  'refund.organizer_approved': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'refund.executed',
  },
  'refund.organizer_denied': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'refund.closed',
  },
  'refund.executed': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'closed',
  },
  // Dispute lifecycle
  'dispute.opened': {
    ownershipState: 'action_needed',
    currentOwner: 'organizer',
    nextExpectedTransition: 'dispute.evidence_submitted_or_deadline_elapsed',
  },
  'dispute.evidence_required': {
    ownershipState: 'action_needed',
    currentOwner: 'organizer',
    nextExpectedTransition: 'dispute.evidence_submitted',
  },
  'dispute.under_review': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'dispute.won_or_lost',
  },
  'dispute.won': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'closed',
  },
  'dispute.lost': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'debt.repayment_evaluation',
  },
  // Debt control lifecycle
  'debt_control.pause_required': {
    ownershipState: 'action_needed',
    currentOwner: 'organizer',
    nextExpectedTransition: 'debt.repayment_posted',
  },
  'debt_control.resume_allowed': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'registrations_resumed',
  },
  // Payout lifecycle
  'payout.requested': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'payout.processing_started',
  },
  'payout.processing_started': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'payout.completed_or_paused_or_failed',
  },
  'payout.paused': {
    ownershipState: 'action_needed',
    currentOwner: 'support',
    nextExpectedTransition: 'payout.resumed_or_adjusted',
  },
  'payout.failed': {
    ownershipState: 'action_needed',
    currentOwner: 'support',
    nextExpectedTransition: 'payout.retry_or_manual_resolution',
  },
  'payout.completed': {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'closed',
  },
};

function defaultRule(rootEntityType: string): OwnershipRule {
  if (rootEntityType.includes('refund')) {
    return {
      ownershipState: 'action_needed',
      currentOwner: 'support',
      nextExpectedTransition: 'refund.follow_up',
    };
  }

  if (rootEntityType.includes('dispute') || rootEntityType.includes('debt')) {
    return {
      ownershipState: 'action_needed',
      currentOwner: 'support',
      nextExpectedTransition: 'dispute_or_debt_follow_up',
    };
  }

  if (rootEntityType.includes('payout')) {
    return {
      ownershipState: 'in_progress',
      currentOwner: 'platform',
      nextExpectedTransition: 'payout.lifecycle_update',
    };
  }

  return {
    ownershipState: 'in_progress',
    currentOwner: 'platform',
    nextExpectedTransition: 'platform.lifecycle_update',
  };
}

function resolveRule(eventName: string, rootEntityType: string): OwnershipRule {
  return ownershipRuleMap[eventName] ?? defaultRule(rootEntityType);
}

function sortEvents(events: OwnershipProjectionEvent[]): OwnershipProjectionEvent[] {
  return [...events].sort((left, right) => {
    const occurredDiff = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurredDiff !== 0) return occurredDiff;
    return left.id.localeCompare(right.id);
  });
}

export function projectOwnershipTimeline(params: {
  rootEntityType: string;
  events: OwnershipProjectionEvent[];
}): OwnershipTimelineProjection {
  const orderedEvents = sortEvents(params.events);

  const timeline = orderedEvents.map((event) => {
    const rule = resolveRule(event.eventName, params.rootEntityType);
    return {
      eventId: event.id,
      eventName: event.eventName,
      occurredAt: event.occurredAt,
      ownershipState: rule.ownershipState,
      currentOwner: rule.currentOwner,
      nextExpectedTransition: rule.nextExpectedTransition,
    } satisfies OwnershipTimelineEntry;
  });

  const latest = timeline[timeline.length - 1] ?? defaultRule(params.rootEntityType);

  return {
    currentState: latest.ownershipState,
    currentOwner: latest.currentOwner,
    nextExpectedTransition: latest.nextExpectedTransition,
    timeline,
  };
}
