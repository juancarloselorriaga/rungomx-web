import { and, eq } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents } from '@/db/schema';
import { canonicalMoneyEventNames } from '@/lib/payments/core/contracts/events/v1';

export type WalletExplainabilityEvidenceRef = {
  kind: 'trace' | 'entity' | 'timeline';
  label: string;
  value?: string;
  href?: string;
};

export type WalletExplainabilityEntity = {
  entityType: string;
  entityId: string;
  label: string;
};

export type OrganizerWalletExplainability = {
  organizerId: string;
  eventId: string;
  eventName: string;
  traceId: string;
  reasonText: string;
  policyDisclosure: string;
  impactedEntities: WalletExplainabilityEntity[];
  evidenceReferences: WalletExplainabilityEvidenceRef[];
};

type PersistedExplainabilityEvent = {
  id: string;
  organizerId: string | null;
  traceId: string;
  eventName: string;
  entityType: string;
  entityId: string;
  payloadJson: Record<string, unknown>;
};

function readPayloadId(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readNestedAmountMinor(payload: Record<string, unknown>, key: string): number | null {
  const value = payload[key];
  if (!value || typeof value !== 'object') return null;
  const amountMinor = (value as Record<string, unknown>).amountMinor;
  return typeof amountMinor === 'number' && Number.isFinite(amountMinor)
    ? Math.trunc(amountMinor)
    : null;
}

function buildReasonText(event: PersistedExplainabilityEvent): string {
  const payload = event.payloadJson;

  switch (event.eventName) {
    case 'payment.captured':
      return 'A registration payment was captured, and the net proceeds were added to your available balance.';
    case 'refund.executed':
      return 'A refund was executed for a participant, reducing your available balance by the refunded amount.';
    case 'dispute.opened':
      return 'A dispute opened for this payment, and the at-risk amount was moved into a frozen state while review is in progress.';
    case 'dispute.funds_released':
      return 'Dispute settlement released frozen funds back into available balance according to the deterministic freeze policy.';
    case 'dispute.debt_posted':
      return 'Dispute settlement posted a debt-impacting amount after loss, preserving explicit at-risk conversion tracking.';
    case 'payout.queued':
      return 'A payout intent was queued because immediate eligibility was not met; it can auto-activate when deterministic conditions recover.';
    case 'payout.requested':
      return 'A payout request was created, moving funds from available balance into processing.';
    case 'payout.processing':
      return 'Payout processing started in the asynchronous payout lifecycle.';
    case 'payout.paused':
      return 'Payout processing was paused by risk policy with an explicit reason code.';
    case 'payout.resumed':
      return 'A paused payout resumed processing after policy conditions allowed continuation.';
    case 'payout.completed':
      return 'Payout processing completed and the lifecycle reached terminal settlement state.';
    case 'payout.failed':
      return 'Payout processing failed with explicit policy reason metadata for follow-up actions.';
    case 'payout.adjusted':
      return 'Payout amount was decreased by risk policy to keep payout execution within safe deterministic limits.';
    case 'subscription.renewal_failed':
      return 'A subscription renewal failed, which may trigger grace and access policy workflows.';
    case 'financial.adjustment_posted': {
      const adjustmentAmount = readNestedAmountMinor(payload, 'amount') ?? 0;
      if (adjustmentAmount >= 0) {
        return 'A positive financial adjustment was posted to correct or reconcile your organizer balance.';
      }

      return 'A negative financial adjustment was posted, increasing outstanding debt obligations.';
    }
    default:
      return 'A balance-impacting financial event was recorded for your wallet timeline.';
  }
}

function buildPolicyDisclosure(event: PersistedExplainabilityEvent): string {
  switch (event.eventName) {
    case 'payment.captured':
      return 'Net proceeds follow your configured fee model at capture time.';
    case 'refund.executed':
      return 'Refund execution follows refund-policy eligibility and deterministic refundable-balance constraints.';
    case 'dispute.opened':
      return 'Dispute-at-risk balances remain frozen until the dispute lifecycle reaches an outcome.';
    case 'dispute.funds_released':
      return 'Winning and settled dispute outcomes release frozen balances through explicit canonical postings.';
    case 'dispute.debt_posted':
      return 'Loss outcomes apply deterministic debt postings that remain trace-linked for repayment policy processing.';
    case 'payout.queued':
      return 'Queued payout intents retain eligibility criteria snapshots and activate deterministically when policy allows.';
    case 'payout.requested':
      return 'Payout requests enter an async lifecycle and can pause/adjust under risk policy controls.';
    case 'payout.processing':
      return 'Processing transitions are handled by async payout worker orchestration with deterministic state updates.';
    case 'payout.paused':
      return 'Risk pause transitions require explicit reason codes and preserve trace-linked lifecycle context.';
    case 'payout.resumed':
      return 'Resume transitions are policy-governed and trace-linked to prior paused state context.';
    case 'payout.completed':
      return 'Completion transitions finalize payout lifecycle state with immutable trace-linked history.';
    case 'payout.failed':
      return 'Failure transitions preserve explicit reason coding and deterministic retry/audit boundaries.';
    case 'payout.adjusted':
      return 'Risk adjustments are decrease-only and recorded with immutable before/after requested amounts.';
    case 'subscription.renewal_failed':
      return 'Subscription continuity follows grace, reminder, and recovery rules for your plan.';
    case 'financial.adjustment_posted':
      return 'Manual adjustments require explicit reason codes and remain trace-linked for auditability.';
    default:
      return 'This event follows the platform financial policy controls and trace-linked evidence requirements.';
  }
}

function buildImpactedEntities(event: PersistedExplainabilityEvent): WalletExplainabilityEntity[] {
  const payload = event.payloadJson;
  const entities: WalletExplainabilityEntity[] = [
    {
      entityType: event.entityType,
      entityId: event.entityId,
      label: 'Primary financial entity',
    },
  ];

  const registrationId = readPayloadId(payload, 'registrationId');
  if (registrationId) {
    entities.push({
      entityType: 'registration',
      entityId: registrationId,
      label: 'Registration',
    });
  }

  const refundRequestId = readPayloadId(payload, 'refundRequestId');
  if (refundRequestId) {
    entities.push({
      entityType: 'refund_request',
      entityId: refundRequestId,
      label: 'Refund request',
    });
  }

  const payoutRequestId = readPayloadId(payload, 'payoutRequestId');
  if (payoutRequestId) {
    entities.push({
      entityType: 'payout_request',
      entityId: payoutRequestId,
      label: 'Payout request',
    });
  }

  const payoutQueuedIntentId = readPayloadId(payload, 'payoutQueuedIntentId');
  if (payoutQueuedIntentId) {
    entities.push({
      entityType: 'payout_queued_intent',
      entityId: payoutQueuedIntentId,
      label: 'Queued payout intent',
    });
  }

  const disputeCaseId = readPayloadId(payload, 'disputeCaseId');
  if (disputeCaseId) {
    entities.push({
      entityType: 'dispute_case',
      entityId: disputeCaseId,
      label: 'Dispute case',
    });
  }

  const uniqueByKey = new Map<string, WalletExplainabilityEntity>();
  for (const entity of entities) {
    const key = `${entity.entityType}:${entity.entityId}`;
    if (!uniqueByKey.has(key)) {
      uniqueByKey.set(key, entity);
    }
  }

  return Array.from(uniqueByKey.values());
}

function buildEvidenceReferences(event: PersistedExplainabilityEvent): WalletExplainabilityEvidenceRef[] {
  return [
    {
      kind: 'trace',
      label: 'Trace reference',
      value: event.traceId,
    },
    {
      kind: 'entity',
      label: 'Primary entity',
      value: `${event.entityType}:${event.entityId}`,
    },
    {
      kind: 'timeline',
      label: 'Timeline view',
      href: `/dashboard/payments/activity?traceId=${encodeURIComponent(event.traceId)}`,
    },
  ];
}

function isKnownCanonicalEventName(eventName: string): boolean {
  return (canonicalMoneyEventNames as readonly string[]).includes(eventName);
}

function toOrganizerExplainability(
  event: PersistedExplainabilityEvent,
  organizerId: string,
): OrganizerWalletExplainability {
  const normalizedEventName = isKnownCanonicalEventName(event.eventName)
    ? event.eventName
    : 'financial.unknown';

  return {
    organizerId,
    eventId: event.id,
    eventName: normalizedEventName,
    traceId: event.traceId,
    reasonText: buildReasonText(event),
    policyDisclosure: buildPolicyDisclosure(event),
    impactedEntities: buildImpactedEntities(event),
    evidenceReferences: buildEvidenceReferences(event),
  };
}

export async function getOrganizerWalletExplainability(params: {
  organizerId: string;
  eventId: string;
}): Promise<OrganizerWalletExplainability | null> {
  const [event] = await db
    .select({
      id: moneyEvents.id,
      organizerId: moneyEvents.organizerId,
      traceId: moneyEvents.traceId,
      eventName: moneyEvents.eventName,
      entityType: moneyEvents.entityType,
      entityId: moneyEvents.entityId,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(eq(moneyEvents.id, params.eventId), eq(moneyEvents.organizerId, params.organizerId)),
    );

  if (!event) {
    return null;
  }

  return toOrganizerExplainability(event, params.organizerId);
}
