import { and, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents } from '@/db/schema';

export const walletIssueRelevantEventNames = [
  'refund.executed',
  'dispute.opened',
  'debt_control.pause_required',
  'debt_control.resume_allowed',
  'payout.queued',
  'payout.requested',
  'payout.processing',
  'payout.paused',
  'payout.resumed',
  'payout.completed',
  'payout.failed',
  'payout.adjusted',
  'subscription.renewal_failed',
] as const;

export type WalletIssueEventName = (typeof walletIssueRelevantEventNames)[number];

export type WalletIssueState = 'action_needed' | 'in_progress';

export type WalletIssueRecoveryGuidance = {
  policyCode: string;
  reasonCode: string;
  guidanceCode: string;
  debtMinor: number;
  pauseThresholdMinor: number;
  resumeThresholdMinor: number;
};

export type WalletIssueActivityItem = {
  eventId: string;
  traceId: string;
  eventName: WalletIssueEventName;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  state: WalletIssueState;
  stateLabel: 'Action Needed' | 'In Progress';
  stateDescription: string;
  recoveryGuidance: WalletIssueRecoveryGuidance | null;
};

export type OrganizerWalletIssueActivity = {
  organizerId: string;
  asOf: Date;
  actionNeeded: WalletIssueActivityItem[];
  inProgress: WalletIssueActivityItem[];
  actionNeededCount: number;
  inProgressCount: number;
};

type PersistedIssueEvent = {
  id: string;
  traceId: string;
  eventName: string;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  createdAt: Date;
  payloadJson: Record<string, unknown>;
};

function classifyIssueState(eventName: WalletIssueEventName): {
  state: WalletIssueState;
  stateLabel: 'Action Needed' | 'In Progress';
  stateDescription: string;
} {
  switch (eventName) {
    case 'dispute.opened':
      return {
        state: 'action_needed',
        stateLabel: 'Action Needed',
        stateDescription:
          'Evidence action is required to respond to this dispute before the configured deadline.',
      };
    case 'subscription.renewal_failed':
      return {
        state: 'action_needed',
        stateLabel: 'Action Needed',
        stateDescription:
          'A billing recovery action is required to avoid grace expiry and access downgrade.',
      };
    case 'debt_control.pause_required':
      return {
        state: 'action_needed',
        stateLabel: 'Action Needed',
        stateDescription:
          'Paid registrations were paused by debt policy; free registrations remain available while debt recovers.',
      };
    case 'debt_control.resume_allowed':
      return {
        state: 'in_progress',
        stateLabel: 'In Progress',
        stateDescription:
          'Debt recovered through policy threshold and paid registrations were resumed automatically.',
      };
    case 'payout.queued':
      return {
        state: 'action_needed',
        stateLabel: 'Action Needed',
        stateDescription:
          'Your payout is queued because eligibility is not currently met; resolve blockers so activation can proceed.',
      };
    case 'payout.requested':
    case 'payout.processing':
    case 'payout.resumed':
    case 'payout.completed':
    case 'payout.adjusted':
      return {
        state: 'in_progress',
        stateLabel: 'In Progress',
        stateDescription: 'Your payout request is progressing through the platform payout lifecycle.',
      };
    case 'payout.paused':
      return {
        state: 'action_needed',
        stateLabel: 'Action Needed',
        stateDescription:
          'Your payout is paused by risk policy; review reason codes and complete required remediation to continue.',
      };
    case 'payout.failed':
      return {
        state: 'action_needed',
        stateLabel: 'Action Needed',
        stateDescription:
          'Your payout failed to complete and requires follow-up action before a new payout lifecycle can proceed.',
      };
    case 'refund.executed':
      return {
        state: 'in_progress',
        stateLabel: 'In Progress',
        stateDescription: 'A refund lifecycle update is currently managed by platform processing rules.',
      };
    default:
      return {
        state: 'in_progress',
        stateLabel: 'In Progress',
        stateDescription: 'This financial workflow item is currently managed by platform processing.',
      };
  }
}

function normalizeIssueEventName(eventName: string): WalletIssueEventName {
  return (
    walletIssueRelevantEventNames.find((candidate) => candidate === eventName) ??
    'refund.executed'
  );
}

function readStringField(payload: Record<string, unknown>, key: string): string {
  const candidate = payload[key];
  if (typeof candidate !== 'string') return '';
  return candidate.trim();
}

function readAmountMinor(payload: Record<string, unknown>, key: string): number {
  const candidate = payload[key];
  if (!candidate || typeof candidate !== 'object') return 0;
  const amountMinor = (candidate as Record<string, unknown>).amountMinor;
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) return 0;
  return Math.max(Math.trunc(amountMinor), 0);
}

function buildRecoveryGuidance(
  eventName: WalletIssueEventName,
  payload: Record<string, unknown>,
): WalletIssueRecoveryGuidance | null {
  if (eventName !== 'debt_control.pause_required' && eventName !== 'debt_control.resume_allowed') {
    return null;
  }

  return {
    policyCode: readStringField(payload, 'policyCode'),
    reasonCode: readStringField(payload, 'reasonCode'),
    guidanceCode: readStringField(payload, 'guidanceCode'),
    debtMinor: readAmountMinor(payload, 'debtAmount'),
    pauseThresholdMinor: readAmountMinor(payload, 'pauseThresholdAmount'),
    resumeThresholdMinor: readAmountMinor(payload, 'resumeThresholdAmount'),
  };
}

function toIssueItem(event: PersistedIssueEvent): WalletIssueActivityItem {
  const eventName = normalizeIssueEventName(event.eventName);
  const classification = classifyIssueState(eventName);

  return {
    eventId: event.id,
    traceId: event.traceId,
    eventName,
    entityType: event.entityType,
    entityId: event.entityId,
    occurredAt: event.occurredAt,
    state: classification.state,
    stateLabel: classification.stateLabel,
    stateDescription: classification.stateDescription,
    recoveryGuidance: buildRecoveryGuidance(eventName, event.payloadJson),
  };
}

async function loadIssueEvents(organizerId: string): Promise<PersistedIssueEvent[]> {
  const rows = await db
    .select({
      id: moneyEvents.id,
      traceId: moneyEvents.traceId,
      eventName: moneyEvents.eventName,
      entityType: moneyEvents.entityType,
      entityId: moneyEvents.entityId,
      occurredAt: moneyEvents.occurredAt,
      createdAt: moneyEvents.createdAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.organizerId, organizerId),
        inArray(moneyEvents.eventName, walletIssueRelevantEventNames),
      ),
    )
    .orderBy(desc(moneyEvents.occurredAt), desc(moneyEvents.createdAt), desc(moneyEvents.id));

  return rows;
}

export async function getOrganizerWalletIssueActivity(params: {
  organizerId: string;
  now?: Date;
}): Promise<OrganizerWalletIssueActivity> {
  const now = params.now ?? new Date();
  const events = await loadIssueEvents(params.organizerId);

  const items = events.map(toIssueItem);
  const actionNeeded = items.filter((item) => item.state === 'action_needed');
  const inProgress = items.filter((item) => item.state === 'in_progress');

  return {
    organizerId: params.organizerId,
    asOf: events[0]?.occurredAt ?? now,
    actionNeeded,
    inProgress,
    actionNeededCount: actionNeeded.length,
    inProgressCount: inProgress.length,
  };
}
