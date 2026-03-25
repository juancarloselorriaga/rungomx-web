import { createHash } from 'node:crypto';

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '@/db';
import { payoutQueuedIntents, payoutRequests } from '@/db/schema';
import { type CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import { ingestMoneyMutationFromApi } from '@/lib/payments/core/mutation-ingress-paths';
import {
  createPayoutQuoteAndContract,
  PayoutQuoteContractError,
} from '@/lib/payments/payouts/quote-contract';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

const DEFAULT_PAYOUT_CURRENCY = 'MXN';
const QUEUED_PAYOUT_CRITERIA_VERSION = 'payout-queued-criteria-v1';
const PAYOUT_QUEUED_TRACE_PREFIX = 'payout-queue:';
const PAYOUT_QUEUE_ACTIVATION_IDEMPOTENCY_PREFIX = 'queued-activation:';
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';
const PAYOUT_QUEUED_INTENTS_ACTIVE_ORGANIZER_UNIQUE_IDX =
  'payout_queued_intents_active_organizer_unique_idx';

const activePayoutRequestStatuses = ['requested', 'processing', 'paused'] as const;

export const payoutQueueIntentErrorCodes = [
  'PAYOUT_QUEUE_IDEMPOTENCY_KEY_REQUIRED',
  'PAYOUT_QUEUE_REQUESTED_AMOUNT_INVALID',
  'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE',
  'PAYOUT_QUEUE_ALREADY_ACTIVE',
  'PAYOUT_QUEUE_INTENT_NOT_FOUND',
  'PAYOUT_QUEUE_INTENT_NOT_ACTIVATABLE',
  'PAYOUT_QUEUE_INSERT_FAILED',
  'PAYOUT_QUEUE_UPDATE_FAILED',
] as const;

export type PayoutQueueIntentErrorCode = (typeof payoutQueueIntentErrorCodes)[number];

export class PayoutQueueIntentError extends Error {
  public readonly code: PayoutQueueIntentErrorCode;

  constructor(code: PayoutQueueIntentErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type QueuedPayoutIntentResult = {
  payoutQueuedIntentId: string;
  organizerId: string;
  status: 'queued' | 'activated' | 'cancelled';
  requestedAmountMinor: number;
  currency: typeof DEFAULT_PAYOUT_CURRENCY;
  blockedReasonCode: string;
  criteriaFingerprint: string;
  queueTraceId: string;
  createdAt: Date;
  idempotencyReused: boolean;
  ingressDeduplicated: boolean;
  eligibilityCriteria: Record<string, unknown>;
};

export type ActivateQueuedPayoutIntentResult = {
  payoutQueuedIntentId: string;
  organizerId: string;
  status: 'queued' | 'activated' | 'cancelled';
  activated: boolean;
  reasonCode: 'activated' | 'still_ineligible' | 'already_activated' | 'active_payout_in_progress';
  maxWithdrawableAmountMinor: number;
  payoutQuoteId: string | null;
  payoutRequestId: string | null;
  activatedAt: Date | null;
};

function toError(code: PayoutQueueIntentErrorCode, detail?: string): PayoutQueueIntentError {
  switch (code) {
    case 'PAYOUT_QUEUE_IDEMPOTENCY_KEY_REQUIRED':
      return new PayoutQueueIntentError(
        code,
        'Queued payout intent creation requires a non-empty idempotency key.',
      );
    case 'PAYOUT_QUEUE_REQUESTED_AMOUNT_INVALID':
      return new PayoutQueueIntentError(
        code,
        'Queued payout intent requested amount must be a positive integer amount in minor units.',
      );
    case 'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE':
      return new PayoutQueueIntentError(
        code,
        detail ??
          'Organizer is currently eligible for immediate payout; queueing is not required for this request.',
      );
    case 'PAYOUT_QUEUE_ALREADY_ACTIVE':
      return new PayoutQueueIntentError(
        code,
        detail ??
          'Organizer already has an active queued payout intent; additional queued intents are not allowed.',
      );
    case 'PAYOUT_QUEUE_INTENT_NOT_FOUND':
      return new PayoutQueueIntentError(code, 'Queued payout intent was not found.');
    case 'PAYOUT_QUEUE_INTENT_NOT_ACTIVATABLE':
      return new PayoutQueueIntentError(
        code,
        detail ?? 'Queued payout intent is not in a queueable activation state.',
      );
    case 'PAYOUT_QUEUE_INSERT_FAILED':
      return new PayoutQueueIntentError(code, 'Queued payout intent could not be persisted.');
    case 'PAYOUT_QUEUE_UPDATE_FAILED':
      return new PayoutQueueIntentError(code, 'Queued payout intent activation update failed.');
    default:
      return new PayoutQueueIntentError(code, 'Queued payout intent operation failed.');
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw toError('PAYOUT_QUEUE_IDEMPOTENCY_KEY_REQUIRED');
  }
  return normalized.slice(0, 128);
}

function normalizePositiveMinor(value: number): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw toError('PAYOUT_QUEUE_REQUESTED_AMOUNT_INVALID');
  }
  return value;
}

function clampNonNegativeMinor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function deterministicHash(seed: string): string {
  return createHash('sha256').update(seed).digest('hex');
}

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function normalizeJsonRecord(value: Record<string, unknown> | null | undefined): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

type PostgresErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

function isUniqueConstraintViolation(error: unknown, constraintName: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const dbError = error as PostgresErrorLike;
  if (dbError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) return false;
  return dbError.constraint === constraintName;
}

function buildQueuedReasonCode(params: {
  requestedAmountMinor: number;
  maxWithdrawableAmountMinor: number;
}): string {
  if (params.maxWithdrawableAmountMinor <= 0) {
    return 'insufficient_available_after_deductions';
  }

  if (params.requestedAmountMinor > params.maxWithdrawableAmountMinor) {
    return 'requested_exceeds_current_withdrawable';
  }

  return 'temporarily_ineligible';
}

function buildActivePayoutBlockedReasonCode(
  status: (typeof activePayoutRequestStatuses)[number] | string,
): string {
  switch (status) {
    case 'requested':
      return 'active_requested_payout_exists';
    case 'processing':
      return 'active_processing_payout_exists';
    case 'paused':
      return 'active_paused_payout_exists';
    default:
      return 'active_payout_lifecycle_conflict';
  }
}

function buildPayoutQueuedEvent(params: {
  organizerId: string;
  payoutQueuedIntentId: string;
  requestedAmountMinor: number;
  blockedReasonCode: string;
  queueTraceId: string;
  occurredAt: Date;
}): CanonicalMoneyEventV1 {
  return {
    eventId: deterministicUuid(`event:${params.queueTraceId}:payout.queued`),
    traceId: params.queueTraceId,
    occurredAt: params.occurredAt.toISOString(),
    recordedAt: params.occurredAt.toISOString(),
    eventName: 'payout.queued',
    version: 1,
    entityType: 'payout',
    entityId: params.payoutQueuedIntentId,
    source: 'api',
    idempotencyKey: params.queueTraceId,
    metadata: {
      lifecycleState: 'queued',
    },
    payload: {
      organizerId: params.organizerId,
      payoutQueuedIntentId: params.payoutQueuedIntentId,
      requestedAmount: {
        amountMinor: params.requestedAmountMinor,
        currency: DEFAULT_PAYOUT_CURRENCY,
      },
      blockedReasonCode: params.blockedReasonCode,
    },
  };
}

async function appendQueuedEvent(params: {
  organizerId: string;
  payoutQueuedIntentId: string;
  requestedAmountMinor: number;
  blockedReasonCode: string;
  queueTraceId: string;
  occurredAt: Date;
}): Promise<{ traceId: string; deduplicated: boolean }> {
  const queuedEvent = buildPayoutQueuedEvent(params);
  const ingressResult = await ingestMoneyMutationFromApi({
    traceId: params.queueTraceId,
    organizerId: params.organizerId,
    idempotencyKey: params.queueTraceId,
    events: [queuedEvent],
  });

  return {
    traceId: ingressResult.traceId,
    deduplicated: ingressResult.deduplicated,
  };
}

async function loadQueuedIntentByIdempotency(params: {
  organizerId: string;
  idempotencyKey: string;
}) {
  return db.query.payoutQueuedIntents.findFirst({
    where: and(
      eq(payoutQueuedIntents.organizerId, params.organizerId),
      eq(payoutQueuedIntents.idempotencyKey, params.idempotencyKey),
      isNull(payoutQueuedIntents.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      status: true,
      requestedAmountMinor: true,
      currency: true,
      blockedReasonCode: true,
      criteriaFingerprint: true,
      queueTraceId: true,
      eligibilityCriteriaJson: true,
      createdAt: true,
    },
  });
}

async function loadActiveQueuedIntentByOrganizer(params: { organizerId: string }) {
  return db.query.payoutQueuedIntents.findFirst({
    where: and(
      eq(payoutQueuedIntents.organizerId, params.organizerId),
      eq(payoutQueuedIntents.status, 'queued'),
      isNull(payoutQueuedIntents.deletedAt),
    ),
    columns: {
      id: true,
      status: true,
    },
  });
}

async function loadActivePayoutRequestByOrganizer(params: { organizerId: string }) {
  return db.query.payoutRequests.findFirst({
    where: and(
      eq(payoutRequests.organizerId, params.organizerId),
      inArray(payoutRequests.status, activePayoutRequestStatuses),
      isNull(payoutRequests.deletedAt),
    ),
    columns: {
      id: true,
      status: true,
    },
  });
}

export async function createQueuedPayoutIntent(params: {
  organizerId: string;
  createdByUserId: string;
  requestedAmountMinor: number;
  idempotencyKey: string;
  now?: Date;
}): Promise<QueuedPayoutIntentResult> {
  const now = params.now ?? new Date();
  const normalizedIdempotencyKey = normalizeIdempotencyKey(params.idempotencyKey);
  const requestedAmountMinor = normalizePositiveMinor(params.requestedAmountMinor);

  const existingIntent = await loadQueuedIntentByIdempotency({
    organizerId: params.organizerId,
    idempotencyKey: normalizedIdempotencyKey,
  });

  if (existingIntent) {
    const ingressResult = await appendQueuedEvent({
      organizerId: existingIntent.organizerId,
      payoutQueuedIntentId: existingIntent.id,
      requestedAmountMinor: existingIntent.requestedAmountMinor,
      blockedReasonCode: existingIntent.blockedReasonCode,
      queueTraceId: existingIntent.queueTraceId,
      occurredAt: existingIntent.createdAt,
    });

    return {
      payoutQueuedIntentId: existingIntent.id,
      organizerId: existingIntent.organizerId,
      status: existingIntent.status,
      requestedAmountMinor: existingIntent.requestedAmountMinor,
      currency: DEFAULT_PAYOUT_CURRENCY,
      blockedReasonCode: existingIntent.blockedReasonCode,
      criteriaFingerprint: existingIntent.criteriaFingerprint,
      queueTraceId: ingressResult.traceId,
      createdAt: existingIntent.createdAt,
      idempotencyReused: true,
      ingressDeduplicated: ingressResult.deduplicated,
      eligibilityCriteria: normalizeJsonRecord(existingIntent.eligibilityCriteriaJson),
    };
  }

  const existingActiveQueuedIntent = await loadActiveQueuedIntentByOrganizer({
    organizerId: params.organizerId,
  });
  if (existingActiveQueuedIntent) {
    throw toError(
      'PAYOUT_QUEUE_ALREADY_ACTIVE',
      `Organizer already has an active queued payout lifecycle (queuedIntentId=${existingActiveQueuedIntent.id}).`,
    );
  }

  const activePayoutRequest = await loadActivePayoutRequestByOrganizer({
    organizerId: params.organizerId,
  });

  const walletSnapshot = await getOrganizerWalletBucketSnapshot({
    organizerId: params.organizerId,
    now,
  });
  const availableMinor = clampNonNegativeMinor(walletSnapshot.buckets.availableMinor);
  const debtMinor = clampNonNegativeMinor(walletSnapshot.buckets.debtMinor);
  const maxWithdrawableAmountMinor = Math.max(availableMinor - debtMinor, 0);

  if (
    !activePayoutRequest &&
    maxWithdrawableAmountMinor > 0 &&
    requestedAmountMinor <= maxWithdrawableAmountMinor
  ) {
    throw toError('PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE');
  }

  const blockedReasonCode = activePayoutRequest
    ? buildActivePayoutBlockedReasonCode(activePayoutRequest.status)
    : buildQueuedReasonCode({
        requestedAmountMinor,
        maxWithdrawableAmountMinor,
      });

  const criteriaFingerprint = deterministicHash(
    [
      'payout-queued-criteria-v1',
      params.organizerId,
      normalizedIdempotencyKey,
      requestedAmountMinor.toString(),
      maxWithdrawableAmountMinor.toString(),
      blockedReasonCode,
      activePayoutRequest?.id ?? 'none',
      activePayoutRequest?.status ?? 'none',
    ].join('|'),
  );

  const payoutQueuedIntentId = deterministicUuid(`payout-queued-intent:${criteriaFingerprint}`);
  const queueTraceId = `${PAYOUT_QUEUED_TRACE_PREFIX}${payoutQueuedIntentId}`;
  const eligibilityCriteria = {
    version: QUEUED_PAYOUT_CRITERIA_VERSION,
    evaluatedAt: now.toISOString(),
    blockedReasonCode,
    requestedAmountMinor,
    maxWithdrawableAmountMinor,
    walletSnapshot: {
      availableMinor,
      debtMinor,
      processingMinor: clampNonNegativeMinor(walletSnapshot.buckets.processingMinor),
      frozenMinor: clampNonNegativeMinor(walletSnapshot.buckets.frozenMinor),
      currency: DEFAULT_PAYOUT_CURRENCY,
    },
    activePayoutConflict: activePayoutRequest
      ? {
          payoutRequestId: activePayoutRequest.id,
          status: activePayoutRequest.status,
          reasonCode: blockedReasonCode,
        }
      : null,
  } satisfies Record<string, unknown>;

  let insertedIntentRows: Array<{
    id: string;
    organizerId: string;
    status: 'queued' | 'activated' | 'cancelled';
    requestedAmountMinor: number;
    currency: string;
    blockedReasonCode: string;
    criteriaFingerprint: string;
    queueTraceId: string;
    eligibilityCriteriaJson: Record<string, unknown>;
    createdAt: Date;
  }> = [];

  try {
    insertedIntentRows = await db
      .insert(payoutQueuedIntents)
      .values({
        id: payoutQueuedIntentId,
        organizerId: params.organizerId,
        idempotencyKey: normalizedIdempotencyKey,
        status: 'queued',
        requestedAmountMinor,
        currency: DEFAULT_PAYOUT_CURRENCY,
        blockedReasonCode,
        criteriaFingerprint,
        queueTraceId,
        eligibilityCriteriaJson: eligibilityCriteria,
        createdByUserId: params.createdByUserId,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [payoutQueuedIntents.organizerId, payoutQueuedIntents.idempotencyKey],
        where: sql`${payoutQueuedIntents.deletedAt} is null`,
      })
      .returning({
        id: payoutQueuedIntents.id,
        organizerId: payoutQueuedIntents.organizerId,
        status: payoutQueuedIntents.status,
        requestedAmountMinor: payoutQueuedIntents.requestedAmountMinor,
        currency: payoutQueuedIntents.currency,
        blockedReasonCode: payoutQueuedIntents.blockedReasonCode,
        criteriaFingerprint: payoutQueuedIntents.criteriaFingerprint,
        queueTraceId: payoutQueuedIntents.queueTraceId,
        eligibilityCriteriaJson: payoutQueuedIntents.eligibilityCriteriaJson,
        createdAt: payoutQueuedIntents.createdAt,
      });
  } catch (error) {
    if (isUniqueConstraintViolation(error, PAYOUT_QUEUED_INTENTS_ACTIVE_ORGANIZER_UNIQUE_IDX)) {
      const conflictQueuedIntent = await loadActiveQueuedIntentByOrganizer({
        organizerId: params.organizerId,
      });
      throw toError(
        'PAYOUT_QUEUE_ALREADY_ACTIVE',
        `Organizer already has an active queued payout lifecycle${conflictQueuedIntent ? ` (queuedIntentId=${conflictQueuedIntent.id})` : ''}.`,
      );
    }
    throw error;
  }

  const [insertedIntent] = insertedIntentRows;

  if (!insertedIntent) {
    const conflictIntent = await loadQueuedIntentByIdempotency({
      organizerId: params.organizerId,
      idempotencyKey: normalizedIdempotencyKey,
    });
    if (!conflictIntent) {
      throw toError('PAYOUT_QUEUE_INSERT_FAILED');
    }

    const ingressResult = await appendQueuedEvent({
      organizerId: conflictIntent.organizerId,
      payoutQueuedIntentId: conflictIntent.id,
      requestedAmountMinor: conflictIntent.requestedAmountMinor,
      blockedReasonCode: conflictIntent.blockedReasonCode,
      queueTraceId: conflictIntent.queueTraceId,
      occurredAt: conflictIntent.createdAt,
    });

    return {
      payoutQueuedIntentId: conflictIntent.id,
      organizerId: conflictIntent.organizerId,
      status: conflictIntent.status,
      requestedAmountMinor: conflictIntent.requestedAmountMinor,
      currency: DEFAULT_PAYOUT_CURRENCY,
      blockedReasonCode: conflictIntent.blockedReasonCode,
      criteriaFingerprint: conflictIntent.criteriaFingerprint,
      queueTraceId: ingressResult.traceId,
      createdAt: conflictIntent.createdAt,
      idempotencyReused: true,
      ingressDeduplicated: ingressResult.deduplicated,
      eligibilityCriteria: normalizeJsonRecord(conflictIntent.eligibilityCriteriaJson),
    };
  }

  const ingressResult = await appendQueuedEvent({
    organizerId: insertedIntent.organizerId,
    payoutQueuedIntentId: insertedIntent.id,
    requestedAmountMinor: insertedIntent.requestedAmountMinor,
    blockedReasonCode: insertedIntent.blockedReasonCode,
    queueTraceId: insertedIntent.queueTraceId,
    occurredAt: insertedIntent.createdAt,
  });

  return {
    payoutQueuedIntentId: insertedIntent.id,
    organizerId: insertedIntent.organizerId,
    status: insertedIntent.status,
    requestedAmountMinor: insertedIntent.requestedAmountMinor,
    currency: DEFAULT_PAYOUT_CURRENCY,
    blockedReasonCode: insertedIntent.blockedReasonCode,
    criteriaFingerprint: insertedIntent.criteriaFingerprint,
    queueTraceId: ingressResult.traceId,
    createdAt: insertedIntent.createdAt,
    idempotencyReused: false,
    ingressDeduplicated: ingressResult.deduplicated,
    eligibilityCriteria: normalizeJsonRecord(insertedIntent.eligibilityCriteriaJson),
  };
}

export async function activateQueuedPayoutIntent(params: {
  payoutQueuedIntentId: string;
  activatedByUserId: string;
  now?: Date;
}): Promise<ActivateQueuedPayoutIntentResult> {
  const now = params.now ?? new Date();

  const queuedIntent = await db.query.payoutQueuedIntents.findFirst({
    where: and(
      eq(payoutQueuedIntents.id, params.payoutQueuedIntentId),
      isNull(payoutQueuedIntents.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      status: true,
      requestedAmountMinor: true,
      activatedAt: true,
      activatedPayoutQuoteId: true,
      activatedPayoutRequestId: true,
    },
  });

  if (!queuedIntent) {
    throw toError('PAYOUT_QUEUE_INTENT_NOT_FOUND');
  }

  if (queuedIntent.status === 'activated') {
    return {
      payoutQueuedIntentId: queuedIntent.id,
      organizerId: queuedIntent.organizerId,
      status: 'activated',
      activated: true,
      reasonCode: 'already_activated',
      maxWithdrawableAmountMinor: queuedIntent.requestedAmountMinor,
      payoutQuoteId: queuedIntent.activatedPayoutQuoteId,
      payoutRequestId: queuedIntent.activatedPayoutRequestId,
      activatedAt: queuedIntent.activatedAt,
    };
  }

  if (queuedIntent.status !== 'queued') {
    throw toError(
      'PAYOUT_QUEUE_INTENT_NOT_ACTIVATABLE',
      `Queued intent status ${queuedIntent.status} is not activatable.`,
    );
  }

  const walletSnapshot = await getOrganizerWalletBucketSnapshot({
    organizerId: queuedIntent.organizerId,
    now,
  });
  const maxWithdrawableAmountMinor = Math.max(
    clampNonNegativeMinor(walletSnapshot.buckets.availableMinor) -
      clampNonNegativeMinor(walletSnapshot.buckets.debtMinor),
    0,
  );

  if (maxWithdrawableAmountMinor <= 0 || queuedIntent.requestedAmountMinor > maxWithdrawableAmountMinor) {
    return {
      payoutQueuedIntentId: queuedIntent.id,
      organizerId: queuedIntent.organizerId,
      status: 'queued',
      activated: false,
      reasonCode: 'still_ineligible',
      maxWithdrawableAmountMinor,
      payoutQuoteId: null,
      payoutRequestId: null,
      activatedAt: null,
    };
  }

  let activatedPayout: Awaited<ReturnType<typeof createPayoutQuoteAndContract>>;
  try {
    activatedPayout = await createPayoutQuoteAndContract({
      organizerId: queuedIntent.organizerId,
      requestedByUserId: params.activatedByUserId,
      requestedAmountMinor: queuedIntent.requestedAmountMinor,
      idempotencyKey: `${PAYOUT_QUEUE_ACTIVATION_IDEMPOTENCY_PREFIX}${queuedIntent.id}`,
      now,
    });
  } catch (error) {
    if (
      error instanceof PayoutQuoteContractError &&
      (error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED' ||
        error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED')
    ) {
      return {
        payoutQueuedIntentId: queuedIntent.id,
        organizerId: queuedIntent.organizerId,
        status: 'queued',
        activated: false,
        reasonCode: 'active_payout_in_progress',
        maxWithdrawableAmountMinor,
        payoutQuoteId: null,
        payoutRequestId: null,
        activatedAt: null,
      };
    }

    throw error;
  }

  const [updatedIntent] = await db
    .update(payoutQueuedIntents)
    .set({
      status: 'activated',
      activatedAt: now,
      activatedPayoutQuoteId: activatedPayout.payoutQuoteId,
      activatedPayoutRequestId: activatedPayout.payoutRequestId,
    })
    .where(
      and(
        eq(payoutQueuedIntents.id, queuedIntent.id),
        eq(payoutQueuedIntents.status, 'queued'),
        isNull(payoutQueuedIntents.deletedAt),
      ),
    )
    .returning({
      id: payoutQueuedIntents.id,
      organizerId: payoutQueuedIntents.organizerId,
      status: payoutQueuedIntents.status,
      activatedAt: payoutQueuedIntents.activatedAt,
      activatedPayoutQuoteId: payoutQueuedIntents.activatedPayoutQuoteId,
      activatedPayoutRequestId: payoutQueuedIntents.activatedPayoutRequestId,
    });

  if (!updatedIntent) {
    const refreshedIntent = await db.query.payoutQueuedIntents.findFirst({
      where: and(
        eq(payoutQueuedIntents.id, queuedIntent.id),
        isNull(payoutQueuedIntents.deletedAt),
      ),
      columns: {
        id: true,
        organizerId: true,
        status: true,
        activatedAt: true,
        activatedPayoutQuoteId: true,
        activatedPayoutRequestId: true,
      },
    });

    if (refreshedIntent?.status === 'activated') {
      return {
        payoutQueuedIntentId: refreshedIntent.id,
        organizerId: refreshedIntent.organizerId,
        status: 'activated',
        activated: true,
        reasonCode: 'already_activated',
        maxWithdrawableAmountMinor,
        payoutQuoteId: refreshedIntent.activatedPayoutQuoteId,
        payoutRequestId: refreshedIntent.activatedPayoutRequestId,
        activatedAt: refreshedIntent.activatedAt,
      };
    }

    throw toError('PAYOUT_QUEUE_UPDATE_FAILED');
  }

  return {
    payoutQueuedIntentId: updatedIntent.id,
    organizerId: updatedIntent.organizerId,
    status: updatedIntent.status,
    activated: true,
    reasonCode: 'activated',
    maxWithdrawableAmountMinor,
    payoutQuoteId: updatedIntent.activatedPayoutQuoteId,
    payoutRequestId: updatedIntent.activatedPayoutRequestId,
    activatedAt: updatedIntent.activatedAt,
  };
}
