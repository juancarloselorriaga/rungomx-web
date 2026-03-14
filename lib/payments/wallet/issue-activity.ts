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

function classifyIssueState(eventName: WalletIssueEventName): WalletIssueState {
  switch (eventName) {
    case 'dispute.opened':
      return 'action_needed';
    case 'subscription.renewal_failed':
      return 'action_needed';
    case 'debt_control.pause_required':
      return 'action_needed';
    case 'debt_control.resume_allowed':
      return 'in_progress';
    case 'payout.queued':
      return 'action_needed';
    case 'payout.requested':
    case 'payout.processing':
    case 'payout.resumed':
    case 'payout.completed':
    case 'payout.adjusted':
      return 'in_progress';
    case 'payout.paused':
      return 'action_needed';
    case 'payout.failed':
      return 'action_needed';
    case 'refund.executed':
      return 'in_progress';
    default:
      return 'in_progress';
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
    state: classification,
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
