import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents, payoutQuotes, payoutRequests } from '@/db/schema';

const lifecycleEventNames = [
  'payout.requested',
  'payout.processing',
  'payout.paused',
  'payout.resumed',
  'payout.adjusted',
  'payout.completed',
  'payout.failed',
] as const;

type LifecycleEventName = (typeof lifecycleEventNames)[number];

type PayoutStatus = 'requested' | 'processing' | 'paused' | 'completed' | 'failed';

export type OrganizerPayoutListItem = {
  payoutRequestId: string;
  organizerId: string;
  status: PayoutStatus;
  requestedAt: Date;
  traceId: string;
  currency: string;
  requestedAmountMinor: number;
  currentRequestedAmountMinor: number;
  maxWithdrawableAmountMinor: number;
};

export type OrganizerPayoutPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type OrganizerPayoutLifecycleEvent = {
  eventId: string;
  eventName: LifecycleEventName;
  status: PayoutStatus;
  occurredAt: Date;
  reasonCode: string | null;
  amountMinor: number | null;
};

export type OrganizerPayoutDetail = {
  payoutRequestId: string;
  organizerId: string;
  status: PayoutStatus;
  traceId: string;
  currency: string;
  requestedAt: Date;
  requestedAmountMinor: number;
  currentRequestedAmountMinor: number;
  maxWithdrawableAmountMinor: number;
  includedAmountMinor: number;
  deductionAmountMinor: number;
  lifecycleEvents: OrganizerPayoutLifecycleEvent[];
  isTerminal: boolean;
};

type OrganizerPayoutDetailRow = {
  payoutRequestId: string;
  organizerId: string;
  status: string;
  traceId: string;
  requestedAt: Date;
  lifecycleContextJson: unknown;
  currency: string;
  requestedAmountMinor: number;
  maxWithdrawableAmountMinor: number;
  includedAmountMinor: number;
  deductionAmountMinor: number;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
    return null;
  }

  if (value <= 0) {
    return null;
  }

  return value;
}

function readCurrentRequestedAmount(params: {
  lifecycleContextJson: Record<string, unknown>;
  fallbackRequestedAmountMinor: number;
}): number {
  return (
    readPositiveInteger(params.lifecycleContextJson.currentRequestedAmountMinor) ??
    params.fallbackRequestedAmountMinor
  );
}

function mapPayoutStatus(value: string): PayoutStatus {
  if (
    value === 'requested' ||
    value === 'processing' ||
    value === 'paused' ||
    value === 'completed' ||
    value === 'failed'
  ) {
    return value;
  }

  return 'requested';
}

function mapStatusFromEventName(eventName: LifecycleEventName): PayoutStatus {
  switch (eventName) {
    case 'payout.requested':
      return 'requested';
    case 'payout.processing':
    case 'payout.resumed':
    case 'payout.adjusted':
      return 'processing';
    case 'payout.paused':
      return 'paused';
    case 'payout.completed':
      return 'completed';
    case 'payout.failed':
      return 'failed';
    default:
      return 'requested';
  }
}

function readAmountMinor(payload: Record<string, unknown>, key: string): number | null {
  const candidate = payload[key];
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const amountMinor = (candidate as Record<string, unknown>).amountMinor;
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) {
    return null;
  }

  return Math.trunc(amountMinor);
}

function extractAmountFromEvent(params: {
  eventName: LifecycleEventName;
  payload: Record<string, unknown>;
}): number | null {
  switch (params.eventName) {
    case 'payout.requested':
      return readAmountMinor(params.payload, 'requestedAmount');
    case 'payout.processing':
    case 'payout.paused':
    case 'payout.resumed':
      return readAmountMinor(params.payload, 'currentRequestedAmount');
    case 'payout.adjusted':
      return readAmountMinor(params.payload, 'adjustedRequestedAmount');
    case 'payout.completed':
      return readAmountMinor(params.payload, 'settledAmount');
    case 'payout.failed':
      return readAmountMinor(params.payload, 'failedAmount');
    default:
      return null;
  }
}

function extractReasonCode(payload: Record<string, unknown>): string | null {
  const reasonCode = payload.reasonCode;
  if (typeof reasonCode !== 'string') {
    return null;
  }

  const trimmedReasonCode = reasonCode.trim();
  return trimmedReasonCode.length > 0 ? trimmedReasonCode : null;
}

export async function listOrganizerPayouts(params: {
  organizerId: string;
  limit?: number;
  offset?: number;
}): Promise<OrganizerPayoutListItem[]> {
  const limit = params.limit ?? 25;
  const offset =
    typeof params.offset === 'number' && Number.isFinite(params.offset) && params.offset > 0
      ? Math.trunc(params.offset)
      : 0;

  const rows = await db
    .select({
      payoutRequestId: payoutRequests.id,
      organizerId: payoutRequests.organizerId,
      status: payoutRequests.status,
      traceId: payoutRequests.traceId,
      requestedAt: payoutRequests.requestedAt,
      lifecycleContextJson: payoutRequests.lifecycleContextJson,
      currency: payoutQuotes.currency,
      requestedAmountMinor: payoutQuotes.requestedAmountMinor,
      maxWithdrawableAmountMinor: payoutQuotes.maxWithdrawableAmountMinor,
    })
    .from(payoutRequests)
    .innerJoin(payoutQuotes, eq(payoutRequests.payoutQuoteId, payoutQuotes.id))
    .where(
      and(
        eq(payoutRequests.organizerId, params.organizerId),
        isNull(payoutRequests.deletedAt),
        isNull(payoutQuotes.deletedAt),
      ),
    )
    .orderBy(desc(payoutRequests.requestedAt), desc(payoutRequests.createdAt))
    .offset(offset)
    .limit(limit);

  return rows.map((row) => ({
    payoutRequestId: row.payoutRequestId,
    organizerId: row.organizerId,
    status: mapPayoutStatus(row.status),
    requestedAt: row.requestedAt,
    traceId: row.traceId,
    currency: row.currency,
    requestedAmountMinor: row.requestedAmountMinor,
    currentRequestedAmountMinor: readCurrentRequestedAmount({
      lifecycleContextJson: toRecord(row.lifecycleContextJson),
      fallbackRequestedAmountMinor: row.requestedAmountMinor,
    }),
    maxWithdrawableAmountMinor: row.maxWithdrawableAmountMinor,
  }));
}

export async function countOrganizerPayouts(params: {
  organizerId: string;
}): Promise<number> {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(payoutRequests)
    .innerJoin(payoutQuotes, eq(payoutRequests.payoutQuoteId, payoutQuotes.id))
    .where(
      and(
        eq(payoutRequests.organizerId, params.organizerId),
        isNull(payoutRequests.deletedAt),
        isNull(payoutQuotes.deletedAt),
      ),
    );

  return row?.count ?? 0;
}

export async function getOrganizerPayoutDetail(params: {
  organizerId: string;
  payoutRequestId: string;
}): Promise<OrganizerPayoutDetail | null> {
  const payoutRequest = await db
    .select({
      payoutRequestId: payoutRequests.id,
      organizerId: payoutRequests.organizerId,
      status: payoutRequests.status,
      traceId: payoutRequests.traceId,
      requestedAt: payoutRequests.requestedAt,
      lifecycleContextJson: payoutRequests.lifecycleContextJson,
      currency: payoutQuotes.currency,
      requestedAmountMinor: payoutQuotes.requestedAmountMinor,
      maxWithdrawableAmountMinor: payoutQuotes.maxWithdrawableAmountMinor,
      includedAmountMinor: payoutQuotes.includedAmountMinor,
      deductionAmountMinor: payoutQuotes.deductionAmountMinor,
    })
    .from(payoutRequests)
    .innerJoin(payoutQuotes, eq(payoutRequests.payoutQuoteId, payoutQuotes.id))
    .where(
      and(
        eq(payoutRequests.id, params.payoutRequestId),
        eq(payoutRequests.organizerId, params.organizerId),
        isNull(payoutRequests.deletedAt),
        isNull(payoutQuotes.deletedAt),
      ),
    )
    .limit(1)
    .then((rows) => (rows[0] ?? null) as OrganizerPayoutDetailRow | null);

  return buildOrganizerPayoutDetail(payoutRequest);
}

export async function getOrganizerPayoutDetailByRequestId(
  payoutRequestId: string,
): Promise<OrganizerPayoutDetail | null> {
  const payoutRequest = await db
    .select({
      payoutRequestId: payoutRequests.id,
      organizerId: payoutRequests.organizerId,
      status: payoutRequests.status,
      traceId: payoutRequests.traceId,
      requestedAt: payoutRequests.requestedAt,
      lifecycleContextJson: payoutRequests.lifecycleContextJson,
      currency: payoutQuotes.currency,
      requestedAmountMinor: payoutQuotes.requestedAmountMinor,
      maxWithdrawableAmountMinor: payoutQuotes.maxWithdrawableAmountMinor,
      includedAmountMinor: payoutQuotes.includedAmountMinor,
      deductionAmountMinor: payoutQuotes.deductionAmountMinor,
    })
    .from(payoutRequests)
    .innerJoin(payoutQuotes, eq(payoutRequests.payoutQuoteId, payoutQuotes.id))
    .where(
      and(
        eq(payoutRequests.id, payoutRequestId),
        isNull(payoutRequests.deletedAt),
        isNull(payoutQuotes.deletedAt),
      ),
    )
    .limit(1)
    .then((rows) => (rows[0] ?? null) as OrganizerPayoutDetailRow | null);

  return buildOrganizerPayoutDetail(payoutRequest);
}

async function buildOrganizerPayoutDetail(
  payoutRequest: OrganizerPayoutDetailRow | null,
): Promise<OrganizerPayoutDetail | null> {
  if (!payoutRequest) {
    return null;
  }

  const eventRows = await db
    .select({
      eventId: moneyEvents.id,
      eventName: moneyEvents.eventName,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.organizerId, payoutRequest.organizerId),
        eq(moneyEvents.entityType, 'payout'),
        eq(moneyEvents.entityId, payoutRequest.payoutRequestId),
        inArray(moneyEvents.eventName, lifecycleEventNames),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id));

  const lifecycleEvents: OrganizerPayoutLifecycleEvent[] = eventRows.map((event) => {
    const eventName = event.eventName as LifecycleEventName;
    const payload = toRecord(event.payloadJson);

    return {
      eventId: event.eventId,
      eventName,
      status: mapStatusFromEventName(eventName),
      occurredAt: event.occurredAt,
      reasonCode: extractReasonCode(payload),
      amountMinor: extractAmountFromEvent({
        eventName,
        payload,
      }),
    };
  });

  const status = mapPayoutStatus(payoutRequest.status);

  return {
    payoutRequestId: payoutRequest.payoutRequestId,
    organizerId: payoutRequest.organizerId,
    status,
    traceId: payoutRequest.traceId,
    currency: payoutRequest.currency,
    requestedAt: payoutRequest.requestedAt,
    requestedAmountMinor: payoutRequest.requestedAmountMinor,
    currentRequestedAmountMinor: readCurrentRequestedAmount({
      lifecycleContextJson: toRecord(payoutRequest.lifecycleContextJson),
      fallbackRequestedAmountMinor: payoutRequest.requestedAmountMinor,
    }),
    maxWithdrawableAmountMinor: payoutRequest.maxWithdrawableAmountMinor,
    includedAmountMinor: payoutRequest.includedAmountMinor,
    deductionAmountMinor: payoutRequest.deductionAmountMinor,
    lifecycleEvents,
    isTerminal: status === 'completed' || status === 'failed',
  };
}
