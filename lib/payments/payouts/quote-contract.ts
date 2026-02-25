import { createHash } from 'node:crypto';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { payoutContracts, payoutQuotes, payoutRequests } from '@/db/schema';
import { type CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import { ingestMoneyMutationFromApi } from '@/lib/payments/core/mutation-ingress-paths';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

const DEFAULT_PAYOUT_CURRENCY = 'MXN';
const PAYOUT_QUOTE_ELIGIBILITY_VERSION = 'payout-quote-eligibility-v1';
const PAYOUT_QUOTE_COMPONENT_VERSION = 'payout-quote-components-v1';
const PAYOUT_CONTRACT_POLICY_VERSION = 'payout-contract-v1';
const PAYOUT_REQUEST_TRACE_PREFIX = 'payout-request:';
const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';
const PAYOUT_REQUESTS_ACTIVE_ORGANIZER_UNIQUE_IDX = 'payout_requests_active_organizer_unique_idx';

const activePayoutRequestStatuses = ['requested', 'processing', 'paused'] as const;

export const payoutActiveConflictPolicies = ['reject', 'queue'] as const;
export type PayoutActiveConflictPolicy = (typeof payoutActiveConflictPolicies)[number];

export const payoutActiveConflictReasonCodes = [
  'active_requested_payout_exists',
  'active_processing_payout_exists',
  'active_paused_payout_exists',
  'active_payout_lifecycle_conflict',
] as const;

export type PayoutActiveConflictReasonCode = (typeof payoutActiveConflictReasonCodes)[number];

export const payoutQuoteContractErrorCodes = [
  'PAYOUT_IDEMPOTENCY_KEY_REQUIRED',
  'PAYOUT_REQUESTED_AMOUNT_INVALID',
  'PAYOUT_NOT_ELIGIBLE',
  'PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE',
  'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED',
  'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
  'PAYOUT_BASELINE_INCOMPLETE',
  'PAYOUT_QUOTE_INSERT_FAILED',
  'PAYOUT_REQUEST_INSERT_FAILED',
  'PAYOUT_CONTRACT_INSERT_FAILED',
] as const;

export type PayoutQuoteContractErrorCode = (typeof payoutQuoteContractErrorCodes)[number];

export class PayoutQuoteContractError extends Error {
  public readonly code: PayoutQuoteContractErrorCode;

  constructor(code: PayoutQuoteContractErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type PayoutQuoteContractResult = {
  payoutQuoteId: string;
  payoutRequestId: string;
  payoutContractId: string;
  organizerId: string;
  quoteFingerprint: string;
  currency: typeof DEFAULT_PAYOUT_CURRENCY;
  includedAmountMinor: number;
  deductionAmountMinor: number;
  maxWithdrawableAmountMinor: number;
  requestedAmountMinor: number;
  traceId: string;
  requestedAt: Date;
  idempotencyReused: boolean;
  ingressDeduplicated: boolean;
  eligibilitySnapshot: Record<string, unknown>;
  componentBreakdown: Record<string, unknown>;
  contractBaseline: Record<string, unknown>;
};

function toError(
  code: PayoutQuoteContractErrorCode,
  context?: { detail?: string },
): PayoutQuoteContractError {
  switch (code) {
    case 'PAYOUT_IDEMPOTENCY_KEY_REQUIRED':
      return new PayoutQuoteContractError(
        code,
        'Payout quote creation requires a non-empty idempotency key.',
      );
    case 'PAYOUT_REQUESTED_AMOUNT_INVALID':
      return new PayoutQuoteContractError(
        code,
        'Requested payout amount must be a positive integer amount in minor units.',
      );
    case 'PAYOUT_NOT_ELIGIBLE':
      return new PayoutQuoteContractError(
        code,
        context?.detail ??
          'Organizer is not eligible for immediate payout because max withdrawable amount is zero.',
      );
    case 'PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE':
      return new PayoutQuoteContractError(
        code,
        context?.detail ?? 'Requested payout amount exceeds deterministic max withdrawable amount.',
      );
    case 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED':
      return new PayoutQuoteContractError(
        code,
        context?.detail ??
          'Organizer already has an active payout lifecycle; immediate payout request was rejected.',
      );
    case 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED':
      return new PayoutQuoteContractError(
        code,
        context?.detail ??
          'Organizer already has an active payout lifecycle; queue policy requires queued intent fallback.',
      );
    case 'PAYOUT_BASELINE_INCOMPLETE':
      return new PayoutQuoteContractError(
        code,
        context?.detail ?? 'Existing payout quote has an incomplete payout baseline contract.',
      );
    case 'PAYOUT_QUOTE_INSERT_FAILED':
      return new PayoutQuoteContractError(code, 'Payout quote could not be persisted.');
    case 'PAYOUT_REQUEST_INSERT_FAILED':
      return new PayoutQuoteContractError(code, 'Payout request could not be persisted.');
    case 'PAYOUT_CONTRACT_INSERT_FAILED':
      return new PayoutQuoteContractError(code, 'Payout contract baseline could not be persisted.');
    default:
      return new PayoutQuoteContractError(code, 'Payout quote creation failed.');
  }
}

function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw toError('PAYOUT_IDEMPOTENCY_KEY_REQUIRED');
  }
  return normalized.slice(0, 128);
}

function normalizePositiveMinor(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) return null;
  return value;
}

function normalizeActiveConflictPolicy(
  value: PayoutActiveConflictPolicy | null | undefined,
): PayoutActiveConflictPolicy {
  return value === 'queue' ? 'queue' : 'reject';
}

function clampNonNegativeMinor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function deterministicHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
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

function getActiveConflictReasonCode(
  status: (typeof activePayoutRequestStatuses)[number] | string | null | undefined,
): PayoutActiveConflictReasonCode {
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

function toActiveConflictError(params: {
  policy: PayoutActiveConflictPolicy;
  payoutRequestId: string | null;
  status: (typeof activePayoutRequestStatuses)[number] | string | null;
}): PayoutQuoteContractError {
  const reasonCode = getActiveConflictReasonCode(params.status);
  const detail = [
    'Organizer already has an active payout lifecycle.',
    `reasonCode=${reasonCode}`,
    `policyOutcome=${params.policy}`,
    params.payoutRequestId ? `activePayoutRequestId=${params.payoutRequestId}` : null,
    params.status ? `activePayoutStatus=${params.status}` : null,
  ]
    .filter(Boolean)
    .join(' ');

  return toError(
    params.policy === 'queue'
      ? 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED'
      : 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED',
    {
      detail,
    },
  );
}

type ExistingQuoteBundle = {
  quote: {
    id: string;
    organizerId: string;
    quoteFingerprint: string;
    currency: string;
    includedAmountMinor: number;
    deductionAmountMinor: number;
    maxWithdrawableAmountMinor: number;
    requestedAmountMinor: number;
    eligibilitySnapshotJson: Record<string, unknown>;
    componentBreakdownJson: Record<string, unknown>;
    requestedAt: Date;
  };
  payoutRequest: {
    id: string;
    traceId: string;
  };
  payoutContract: {
    id: string;
    baselineSnapshotJson: Record<string, unknown>;
  };
};

type ActivePayoutRequest = {
  id: string;
  status: (typeof activePayoutRequestStatuses)[number];
};

function buildPayoutRequestedEvent(params: {
  organizerId: string;
  payoutRequestId: string;
  payoutQuoteId: string;
  requestedAmountMinor: number;
  quoteFingerprint: string;
  traceId: string;
  occurredAt: Date;
}): CanonicalMoneyEventV1 {
  return {
    eventId: deterministicUuid(`event:${params.traceId}:payout.requested`),
    traceId: params.traceId,
    occurredAt: params.occurredAt.toISOString(),
    recordedAt: params.occurredAt.toISOString(),
    eventName: 'payout.requested',
    version: 1,
    entityType: 'payout',
    entityId: params.payoutRequestId,
    source: 'api',
    idempotencyKey: params.traceId,
    metadata: {
      quoteFingerprint: params.quoteFingerprint,
      policyVersion: PAYOUT_CONTRACT_POLICY_VERSION,
    },
    payload: {
      organizerId: params.organizerId,
      payoutRequestId: params.payoutRequestId,
      payoutQuoteId: params.payoutQuoteId,
      requestedAmount: {
        amountMinor: params.requestedAmountMinor,
        currency: DEFAULT_PAYOUT_CURRENCY,
      },
    },
  };
}

async function appendPayoutRequestedEvent(params: {
  organizerId: string;
  payoutRequestId: string;
  payoutQuoteId: string;
  requestedAmountMinor: number;
  quoteFingerprint: string;
  traceId: string;
  occurredAt: Date;
}): Promise<{ traceId: string; deduplicated: boolean }> {
  const payoutRequestedEvent = buildPayoutRequestedEvent(params);
  const ingressResult = await ingestMoneyMutationFromApi({
    traceId: params.traceId,
    organizerId: params.organizerId,
    idempotencyKey: params.traceId,
    events: [payoutRequestedEvent],
  });

  return {
    traceId: ingressResult.traceId,
    deduplicated: ingressResult.deduplicated,
  };
}

async function loadExistingQuoteBundle(params: {
  organizerId: string;
  idempotencyKey: string;
}): Promise<ExistingQuoteBundle | null> {
  const quote = await db.query.payoutQuotes.findFirst({
    where: and(
      eq(payoutQuotes.organizerId, params.organizerId),
      eq(payoutQuotes.idempotencyKey, params.idempotencyKey),
      isNull(payoutQuotes.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      quoteFingerprint: true,
      currency: true,
      includedAmountMinor: true,
      deductionAmountMinor: true,
      maxWithdrawableAmountMinor: true,
      requestedAmountMinor: true,
      eligibilitySnapshotJson: true,
      componentBreakdownJson: true,
      requestedAt: true,
    },
  });

  if (!quote) return null;

  const [payoutRequest, payoutContract] = await Promise.all([
    db.query.payoutRequests.findFirst({
      where: and(eq(payoutRequests.payoutQuoteId, quote.id), isNull(payoutRequests.deletedAt)),
      columns: {
        id: true,
        traceId: true,
      },
    }),
    db.query.payoutContracts.findFirst({
      where: and(eq(payoutContracts.payoutQuoteId, quote.id), isNull(payoutContracts.deletedAt)),
      columns: {
        id: true,
        baselineSnapshotJson: true,
      },
    }),
  ]);

  if (!payoutRequest || !payoutContract) {
    throw toError('PAYOUT_BASELINE_INCOMPLETE');
  }

  return {
    quote,
    payoutRequest,
    payoutContract,
  };
}

async function toResultFromExistingBundle(existing: ExistingQuoteBundle): Promise<PayoutQuoteContractResult> {
  const ingressResult = await appendPayoutRequestedEvent({
    organizerId: existing.quote.organizerId,
    payoutRequestId: existing.payoutRequest.id,
    payoutQuoteId: existing.quote.id,
    requestedAmountMinor: existing.quote.requestedAmountMinor,
    quoteFingerprint: existing.quote.quoteFingerprint,
    traceId: existing.payoutRequest.traceId,
    occurredAt: existing.quote.requestedAt,
  });

  return {
    payoutQuoteId: existing.quote.id,
    payoutRequestId: existing.payoutRequest.id,
    payoutContractId: existing.payoutContract.id,
    organizerId: existing.quote.organizerId,
    quoteFingerprint: existing.quote.quoteFingerprint,
    currency: DEFAULT_PAYOUT_CURRENCY,
    includedAmountMinor: existing.quote.includedAmountMinor,
    deductionAmountMinor: existing.quote.deductionAmountMinor,
    maxWithdrawableAmountMinor: existing.quote.maxWithdrawableAmountMinor,
    requestedAmountMinor: existing.quote.requestedAmountMinor,
    traceId: ingressResult.traceId,
    requestedAt: existing.quote.requestedAt,
    idempotencyReused: true,
    ingressDeduplicated: ingressResult.deduplicated,
    eligibilitySnapshot: normalizeJsonRecord(existing.quote.eligibilitySnapshotJson),
    componentBreakdown: normalizeJsonRecord(existing.quote.componentBreakdownJson),
    contractBaseline: normalizeJsonRecord(existing.payoutContract.baselineSnapshotJson),
  };
}

async function loadActivePayoutRequest(params: { organizerId: string }): Promise<ActivePayoutRequest | null> {
  const activeRequest = await db.query.payoutRequests.findFirst({
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

  if (!activeRequest) return null;

  return {
    id: activeRequest.id,
    status: activeRequest.status as (typeof activePayoutRequestStatuses)[number],
  };
}

export async function createPayoutQuoteAndContract(params: {
  organizerId: string;
  requestedByUserId: string;
  idempotencyKey: string;
  requestedAmountMinor?: number | null;
  activeConflictPolicy?: PayoutActiveConflictPolicy;
  now?: Date;
}): Promise<PayoutQuoteContractResult> {
  const now = params.now ?? new Date();
  const normalizedIdempotencyKey = normalizeIdempotencyKey(params.idempotencyKey);
  const requestedAmountMinorInput = normalizePositiveMinor(params.requestedAmountMinor);
  const activeConflictPolicy = normalizeActiveConflictPolicy(params.activeConflictPolicy);

  if (params.requestedAmountMinor != null && requestedAmountMinorInput == null) {
    throw toError('PAYOUT_REQUESTED_AMOUNT_INVALID');
  }

  const existingBundle = await loadExistingQuoteBundle({
    organizerId: params.organizerId,
    idempotencyKey: normalizedIdempotencyKey,
  });
  if (existingBundle) {
    return toResultFromExistingBundle(existingBundle);
  }

  const activePayoutRequest = await loadActivePayoutRequest({
    organizerId: params.organizerId,
  });
  if (activePayoutRequest) {
    throw toActiveConflictError({
      policy: activeConflictPolicy,
      payoutRequestId: activePayoutRequest.id,
      status: activePayoutRequest.status,
    });
  }

  const walletSnapshot = await getOrganizerWalletBucketSnapshot({
    organizerId: params.organizerId,
    now,
  });

  const includedAmountMinor = clampNonNegativeMinor(walletSnapshot.buckets.availableMinor);
  const deductionAmountMinor = clampNonNegativeMinor(walletSnapshot.buckets.debtMinor);
  const maxWithdrawableAmountMinor = Math.max(includedAmountMinor - deductionAmountMinor, 0);

  if (maxWithdrawableAmountMinor <= 0) {
    throw toError('PAYOUT_NOT_ELIGIBLE');
  }

  const requestedAmountMinor = requestedAmountMinorInput ?? maxWithdrawableAmountMinor;
  if (requestedAmountMinor > maxWithdrawableAmountMinor) {
    throw toError('PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE');
  }

  const quoteSeed = [
    'payout-quote-v1',
    params.organizerId,
    normalizedIdempotencyKey,
    includedAmountMinor.toString(),
    deductionAmountMinor.toString(),
    maxWithdrawableAmountMinor.toString(),
    requestedAmountMinor.toString(),
    DEFAULT_PAYOUT_CURRENCY,
  ].join('|');

  const quoteFingerprint = deterministicHash(quoteSeed);
  const payoutQuoteId = deterministicUuid(`payout-quote:${quoteFingerprint}`);
  const payoutRequestId = deterministicUuid(`payout-request:${quoteFingerprint}`);
  const payoutContractId = deterministicUuid(`payout-contract:${quoteFingerprint}`);
  const traceId = `${PAYOUT_REQUEST_TRACE_PREFIX}${payoutRequestId}`;

  const eligibilitySnapshot = {
    version: PAYOUT_QUOTE_ELIGIBILITY_VERSION,
    evaluatedAt: now.toISOString(),
    decision: 'eligible',
    reasonCode: 'ELIGIBLE',
    walletSnapshot: {
      availableMinor: includedAmountMinor,
      debtMinor: deductionAmountMinor,
      processingMinor: clampNonNegativeMinor(walletSnapshot.buckets.processingMinor),
      frozenMinor: clampNonNegativeMinor(walletSnapshot.buckets.frozenMinor),
      currency: DEFAULT_PAYOUT_CURRENCY,
    },
  } satisfies Record<string, unknown>;

  const componentBreakdown = {
    version: PAYOUT_QUOTE_COMPONENT_VERSION,
    quoteFingerprint,
    includedAmountMinor,
    deductionAmountMinor,
    maxWithdrawableAmountMinor,
    requestedAmountMinor,
    currency: DEFAULT_PAYOUT_CURRENCY,
  } satisfies Record<string, unknown>;

  const baselineSnapshot = {
    version: PAYOUT_CONTRACT_POLICY_VERSION,
    payoutQuoteId,
    payoutRequestId,
    traceId,
    quoteFingerprint,
    includedAmountMinor,
    deductionAmountMinor,
    maxWithdrawableAmountMinor,
    requestedAmountMinor,
    currency: DEFAULT_PAYOUT_CURRENCY,
    lockedAt: now.toISOString(),
  } satisfies Record<string, unknown>;

  const [insertedQuote] = await db
    .insert(payoutQuotes)
    .values({
      id: payoutQuoteId,
      organizerId: params.organizerId,
      idempotencyKey: normalizedIdempotencyKey,
      quoteFingerprint,
      currency: DEFAULT_PAYOUT_CURRENCY,
      includedAmountMinor,
      deductionAmountMinor,
      maxWithdrawableAmountMinor,
      requestedAmountMinor,
      eligibilitySnapshotJson: eligibilitySnapshot,
      componentBreakdownJson: componentBreakdown,
      createdByUserId: params.requestedByUserId,
      requestedAt: now,
    })
    .onConflictDoNothing({
      target: [payoutQuotes.organizerId, payoutQuotes.idempotencyKey],
    })
    .returning({
      id: payoutQuotes.id,
    });

  if (!insertedQuote) {
    const conflictBundle = await loadExistingQuoteBundle({
      organizerId: params.organizerId,
      idempotencyKey: normalizedIdempotencyKey,
    });
    if (conflictBundle) {
      return toResultFromExistingBundle(conflictBundle);
    }
    throw toError('PAYOUT_QUOTE_INSERT_FAILED');
  }

  let insertedRequestRows: Array<{ id: string; traceId: string }> = [];

  try {
    insertedRequestRows = await db
      .insert(payoutRequests)
      .values({
        id: payoutRequestId,
        organizerId: params.organizerId,
        payoutQuoteId,
        status: 'requested',
        traceId,
        requestedByUserId: params.requestedByUserId,
        requestedAt: now,
        lifecycleContextJson: {
          origin: 'quote_generation',
          contractVersion: PAYOUT_CONTRACT_POLICY_VERSION,
        },
      })
      .returning({
        id: payoutRequests.id,
        traceId: payoutRequests.traceId,
      });
  } catch (error) {
    if (isUniqueConstraintViolation(error, PAYOUT_REQUESTS_ACTIVE_ORGANIZER_UNIQUE_IDX)) {
      const conflictedActiveRequest = await loadActivePayoutRequest({
        organizerId: params.organizerId,
      });

      throw toActiveConflictError({
        policy: activeConflictPolicy,
        payoutRequestId: conflictedActiveRequest?.id ?? null,
        status: conflictedActiveRequest?.status ?? null,
      });
    }

    throw error;
  }

  const [insertedRequest] = insertedRequestRows;

  if (!insertedRequest) {
    throw toError('PAYOUT_REQUEST_INSERT_FAILED');
  }

  const [insertedContract] = await db
    .insert(payoutContracts)
    .values({
      id: payoutContractId,
      organizerId: params.organizerId,
      payoutQuoteId,
      payoutRequestId: insertedRequest.id,
      policyVersion: PAYOUT_CONTRACT_POLICY_VERSION,
      immutableFingerprint: quoteFingerprint,
      baselineSnapshotJson: baselineSnapshot,
    })
    .returning({
      id: payoutContracts.id,
      baselineSnapshotJson: payoutContracts.baselineSnapshotJson,
    });

  if (!insertedContract) {
    throw toError('PAYOUT_CONTRACT_INSERT_FAILED');
  }

  const ingressResult = await appendPayoutRequestedEvent({
    organizerId: params.organizerId,
    payoutRequestId: insertedRequest.id,
    payoutQuoteId,
    requestedAmountMinor,
    quoteFingerprint,
    traceId,
    occurredAt: now,
  });

  return {
    payoutQuoteId,
    payoutRequestId: insertedRequest.id,
    payoutContractId: insertedContract.id,
    organizerId: params.organizerId,
    quoteFingerprint,
    currency: DEFAULT_PAYOUT_CURRENCY,
    includedAmountMinor,
    deductionAmountMinor,
    maxWithdrawableAmountMinor,
    requestedAmountMinor,
    traceId: ingressResult.traceId,
    requestedAt: now,
    idempotencyReused: false,
    ingressDeduplicated: ingressResult.deduplicated,
    eligibilitySnapshot,
    componentBreakdown,
    contractBaseline: normalizeJsonRecord(insertedContract.baselineSnapshotJson),
  };
}
