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
      return 'A registration payment cleared, and the net proceeds were added to your available balance.';
    case 'refund.executed':
      return 'A participant received a refund, so the refunded amount was removed from your available balance.';
    case 'dispute.opened':
      return 'A dispute was opened for this payment, so the amount at risk was moved into reserved funds while the case is reviewed.';
    case 'dispute.funds_released':
      return 'The dispute was resolved in your favor, so the reserved funds were returned to your available balance.';
    case 'dispute.debt_posted':
      return 'The dispute was lost, so the remaining amount was recorded as debt.';
    case 'payout.queued':
      return "A payout was queued because it couldn't start yet. It can activate automatically once the blocker clears.";
    case 'payout.requested':
      return 'A payout request was created, so the requested amount moved out of available balance and into payout processing.';
    case 'payout.processing':
      return 'This payout is currently being processed.';
    case 'payout.paused':
      return "This payout was paused for review, so it can't continue until the blocker is cleared.";
    case 'payout.resumed':
      return 'A paused payout resumed after the review conditions were cleared.';
    case 'payout.completed':
      return 'This payout completed and reached its final settled state.';
    case 'payout.failed':
      return 'This payout failed and needs follow-up before another payout replaces it.';
    case 'payout.adjusted':
      return 'This payout amount was reduced during review to keep the payout within the safe amount available.';
    case 'subscription.renewal_failed':
      return "A subscription renewal failed, which can affect access to payments tools if billing isn't updated.";
    case 'financial.adjustment_posted': {
      const adjustmentAmount = readNestedAmountMinor(payload, 'amount') ?? 0;
      if (adjustmentAmount >= 0) {
        return 'A positive balance adjustment was posted to correct or reconcile your organizer balance.';
      }

      return 'A negative balance adjustment was posted, increasing the amount that still needs to be covered.';
    }
    default:
      return 'A balance-affecting payment event was recorded in your timeline.';
  }
}

function buildPolicyDisclosure(event: PersistedExplainabilityEvent): string {
  switch (event.eventName) {
    case 'payment.captured':
      return 'Net proceeds are calculated using your payout settings at the time of capture.';
    case 'refund.executed':
      return "Refunds follow the event's refund rules and cannot exceed the balance that can be refunded.";
    case 'dispute.opened':
      return 'Funds tied to an open dispute stay reserved until the dispute is resolved.';
    case 'dispute.funds_released':
      return 'When a dispute is resolved in your favor or settled without loss, reserved funds return to the available balance.';
    case 'dispute.debt_posted':
      return 'When a dispute ends in loss, the unpaid amount is recorded as debt and remains linked to the original trace.';
    case 'payout.queued':
      return 'Queued payouts keep the eligibility snapshot from the moment they were created and activate only when the rules allow it.';
    case 'payout.requested':
      return 'Payout requests move through a tracked review and processing flow and can be paused or adjusted when needed.';
    case 'payout.processing':
      return 'Processing updates are recorded as the payout moves through review and settlement.';
    case 'payout.paused':
      return 'Paused payouts keep their full audit trail, including the reason code that triggered the hold.';
    case 'payout.resumed':
      return 'A payout resumes only after the blocking condition is cleared and the change is recorded in its audit trail.';
    case 'payout.completed':
      return 'Completed payouts keep an immutable history of the full payout flow.';
    case 'payout.failed':
      return 'Failed payouts keep the reason code and trace history needed for support and audit follow-up.';
    case 'payout.adjusted':
      return 'Payout adjustments only reduce the requested amount and keep the before-and-after values in the audit trail.';
    case 'subscription.renewal_failed':
      return "Subscription recovery follows your plan's grace and billing recovery rules.";
    case 'financial.adjustment_posted':
      return 'Manual balance adjustments require a reason code and remain linked to the trace for audit review.';
    default:
      return 'This event follows the platform financial controls and keeps a traceable audit record.';
  }
}

function buildImpactedEntities(event: PersistedExplainabilityEvent): WalletExplainabilityEntity[] {
  const payload = event.payloadJson;
  const entities: WalletExplainabilityEntity[] = [
    {
      entityType: event.entityType,
      entityId: event.entityId,
      label: 'Primary record',
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
      label: 'Queued payout',
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
      label: 'Trace',
      value: event.traceId,
    },
    {
      kind: 'entity',
      label: 'Primary record',
      value: `${event.entityType}:${event.entityId}`,
    },
    {
      kind: 'timeline',
      label: 'Timeline',
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
