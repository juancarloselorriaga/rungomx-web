import { createHash } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { payoutQuotes, payoutRequests } from '@/db/schema';
import { type CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import { ingestMoneyMutationFromWorker } from '@/lib/payments/core/mutation-ingress-paths';
import {
  assertFinancialProcessorRuntime,
  type FinancialProcessorRuntime,
} from '@/lib/payments/core/replay';

const DEFAULT_PAYOUT_CURRENCY = 'MXN';
const PAYOUT_LIFECYCLE_TRACE_PREFIX = 'payout-lifecycle:';
const PAYOUT_LIFECYCLE_POLICY_VERSION = 'payout-lifecycle-risk-v1';

export const payoutLifecycleExecutionModes = ['in_process', 'queued_worker'] as const;

export type PayoutLifecycleExecutionMode = (typeof payoutLifecycleExecutionModes)[number];

export const payoutLifecycleTransitionActions = [
  'mark_processing',
  'pause_for_risk',
  'resume',
  'complete',
  'fail',
] as const;

export type PayoutLifecycleTransitionAction = (typeof payoutLifecycleTransitionActions)[number];

const payoutTransitionStatuses = ['requested', 'processing', 'paused', 'completed', 'failed'] as const;

type PayoutTransitionStatus = (typeof payoutTransitionStatuses)[number];

type PayoutTransitionRule = {
  toStatus: PayoutTransitionStatus;
  eventName:
    | 'payout.processing'
    | 'payout.paused'
    | 'payout.resumed'
    | 'payout.completed'
    | 'payout.failed';
  allowedFrom: readonly PayoutTransitionStatus[];
};

const payoutTransitionRuleByAction: Record<PayoutLifecycleTransitionAction, PayoutTransitionRule> = {
  mark_processing: {
    toStatus: 'processing',
    eventName: 'payout.processing',
    allowedFrom: ['requested'],
  },
  pause_for_risk: {
    toStatus: 'paused',
    eventName: 'payout.paused',
    allowedFrom: ['processing'],
  },
  resume: {
    toStatus: 'processing',
    eventName: 'payout.resumed',
    allowedFrom: ['paused'],
  },
  complete: {
    toStatus: 'completed',
    eventName: 'payout.completed',
    allowedFrom: ['processing'],
  },
  fail: {
    toStatus: 'failed',
    eventName: 'payout.failed',
    allowedFrom: ['requested', 'processing', 'paused'],
  },
} as const;

export const payoutLifecycleErrorCodes = [
  'PAYOUT_REQUEST_ID_REQUIRED',
  'PAYOUT_REQUEST_NOT_FOUND',
  'PAYOUT_TRANSITION_NOT_ALLOWED',
  'PAYOUT_TRANSITION_REASON_REQUIRED',
  'PAYOUT_TRANSITION_MODE_BLOCKED',
  'PAYOUT_TRANSITION_RUNTIME_BLOCKED',
  'PAYOUT_RISK_ADJUSTMENT_INVALID',
  'PAYOUT_RISK_ADJUSTMENT_NON_DECREASE',
  'PAYOUT_TRANSITION_UPDATE_FAILED',
] as const;

export type PayoutLifecycleErrorCode = (typeof payoutLifecycleErrorCodes)[number];

export class PayoutLifecycleError extends Error {
  public readonly code: PayoutLifecycleErrorCode;

  constructor(code: PayoutLifecycleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type PayoutLifecycleTransitionResult = {
  payoutRequestId: string;
  organizerId: string;
  payoutQuoteId: string;
  transitionAction: PayoutLifecycleTransitionAction;
  previousStatus: string;
  status: PayoutTransitionStatus;
  reasonCode: string;
  currentRequestedAmountMinor: number;
  adjustmentAppliedMinor: number;
  adjustedRequestedAmountMinor: number | null;
  occurredAt: Date;
  traceId: string;
  ingressDeduplicated: boolean;
  executionMode: PayoutLifecycleExecutionMode;
  runtime: FinancialProcessorRuntime;
};

function deterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

function toError(code: PayoutLifecycleErrorCode, detail?: string): PayoutLifecycleError {
  switch (code) {
    case 'PAYOUT_REQUEST_ID_REQUIRED':
      return new PayoutLifecycleError(code, 'Payout transition requires a payout request id.');
    case 'PAYOUT_REQUEST_NOT_FOUND':
      return new PayoutLifecycleError(code, 'Payout request was not found.');
    case 'PAYOUT_TRANSITION_NOT_ALLOWED':
      return new PayoutLifecycleError(
        code,
        detail ?? 'Requested payout transition is not allowed for current lifecycle state.',
      );
    case 'PAYOUT_TRANSITION_REASON_REQUIRED':
      return new PayoutLifecycleError(
        code,
        detail ?? 'Payout transition requires an explicit reason code for this action.',
      );
    case 'PAYOUT_TRANSITION_MODE_BLOCKED':
      return new PayoutLifecycleError(code, 'in_process payout transitions are blocked in production.');
    case 'PAYOUT_TRANSITION_RUNTIME_BLOCKED':
      return new PayoutLifecycleError(
        code,
        detail ?? 'Payout processor must run on dedicated worker runtime in production.',
      );
    case 'PAYOUT_RISK_ADJUSTMENT_INVALID':
      return new PayoutLifecycleError(
        code,
        detail ?? 'Risk adjustment amount must be a positive integer amount in minor units.',
      );
    case 'PAYOUT_RISK_ADJUSTMENT_NON_DECREASE':
      return new PayoutLifecycleError(
        code,
        detail ?? 'Risk adjustment must be decrease-only relative to current requested payout amount.',
      );
    case 'PAYOUT_TRANSITION_UPDATE_FAILED':
      return new PayoutLifecycleError(
        code,
        detail ?? 'Payout transition update could not be persisted with deterministic guards.',
      );
    default:
      return new PayoutLifecycleError(code, 'Payout lifecycle transition failed.');
  }
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function normalizeExecutionMode(value: unknown): PayoutLifecycleExecutionMode {
  return value === 'queued_worker' ? 'queued_worker' : 'in_process';
}

function normalizeRuntime(
  value: unknown,
  mode: PayoutLifecycleExecutionMode,
): FinancialProcessorRuntime {
  if (value === 'worker' || value === 'web') {
    return value;
  }

  return mode === 'queued_worker' ? 'worker' : 'web';
}

function assertExecutionModeAllowed(nodeEnv: string, mode: PayoutLifecycleExecutionMode): void {
  if (mode === 'in_process' && nodeEnv === 'production') {
    throw toError('PAYOUT_TRANSITION_MODE_BLOCKED');
  }
}

function normalizeTransitionReasonCode(params: {
  action: PayoutLifecycleTransitionAction;
  reasonCode: string | null | undefined;
}): string {
  const trimmed = typeof params.reasonCode === 'string' ? params.reasonCode.trim() : '';

  if ((params.action === 'pause_for_risk' || params.action === 'fail') && trimmed.length === 0) {
    throw toError(
      'PAYOUT_TRANSITION_REASON_REQUIRED',
      `Action ${params.action} requires a non-empty reason code.`,
    );
  }

  if (trimmed.length > 0) return trimmed;

  switch (params.action) {
    case 'mark_processing':
      return 'processing_started';
    case 'resume':
      return 'resume_requested';
    case 'complete':
      return 'payout_completed';
    default:
      return 'transition_reason_unspecified';
  }
}

function normalizePositiveMinor(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || !Number.isInteger(value)) return null;
  if (value <= 0) return null;
  return value;
}

function readCurrentRequestedAmount(params: {
  lifecycleContext: Record<string, unknown>;
  baselineRequestedAmountMinor: number;
}): number {
  const contextAmountRaw = params.lifecycleContext.currentRequestedAmountMinor;
  const contextAmount =
    typeof contextAmountRaw === 'number' &&
    Number.isFinite(contextAmountRaw) &&
    Number.isInteger(contextAmountRaw) &&
    contextAmountRaw > 0
      ? contextAmountRaw
      : null;

  return contextAmount ?? Math.max(Math.trunc(params.baselineRequestedAmountMinor), 0);
}

function buildTransitionTraceId(params: {
  payoutRequestTraceId: string;
  action: PayoutLifecycleTransitionAction;
}): string {
  const seed = `${PAYOUT_LIFECYCLE_TRACE_PREFIX}${params.payoutRequestTraceId}:${params.action}`;
  return seed.slice(0, 128);
}

function buildTransitionEvent(params: {
  eventName: PayoutTransitionRule['eventName'];
  traceId: string;
  occurredAt: Date;
  payoutRequestId: string;
  payoutQuoteId: string;
  organizerId: string;
  amountMinor: number;
  reasonCode: string;
}): CanonicalMoneyEventV1 {
  const commonEnvelope = {
    eventId: deterministicUuid(`event:${params.traceId}:${params.eventName}`),
    traceId: params.traceId,
    occurredAt: params.occurredAt.toISOString(),
    recordedAt: params.occurredAt.toISOString(),
    version: 1 as const,
    entityType: 'payout' as const,
    entityId: params.payoutRequestId,
    source: 'worker' as const,
    idempotencyKey: params.traceId,
    metadata: {
      policyVersion: PAYOUT_LIFECYCLE_POLICY_VERSION,
      reasonCode: params.reasonCode,
    },
  };

  const amount = {
    amountMinor: params.amountMinor,
    currency: DEFAULT_PAYOUT_CURRENCY,
  };

  if (params.eventName === 'payout.processing') {
    return {
      ...commonEnvelope,
      eventName: 'payout.processing',
      payload: {
        organizerId: params.organizerId,
        payoutRequestId: params.payoutRequestId,
        payoutQuoteId: params.payoutQuoteId,
        currentRequestedAmount: amount,
      },
    };
  }

  if (params.eventName === 'payout.paused') {
    return {
      ...commonEnvelope,
      eventName: 'payout.paused',
      payload: {
        organizerId: params.organizerId,
        payoutRequestId: params.payoutRequestId,
        payoutQuoteId: params.payoutQuoteId,
        currentRequestedAmount: amount,
        reasonCode: params.reasonCode,
      },
    };
  }

  if (params.eventName === 'payout.resumed') {
    return {
      ...commonEnvelope,
      eventName: 'payout.resumed',
      payload: {
        organizerId: params.organizerId,
        payoutRequestId: params.payoutRequestId,
        payoutQuoteId: params.payoutQuoteId,
        currentRequestedAmount: amount,
        reasonCode: params.reasonCode,
      },
    };
  }

  if (params.eventName === 'payout.completed') {
    return {
      ...commonEnvelope,
      eventName: 'payout.completed',
      payload: {
        organizerId: params.organizerId,
        payoutRequestId: params.payoutRequestId,
        payoutQuoteId: params.payoutQuoteId,
        settledAmount: amount,
      },
    };
  }

  return {
    ...commonEnvelope,
    eventName: 'payout.failed',
    payload: {
      organizerId: params.organizerId,
      payoutRequestId: params.payoutRequestId,
      payoutQuoteId: params.payoutQuoteId,
      failedAmount: amount,
      reasonCode: params.reasonCode,
    },
  };
}

function buildAdjustmentEvent(params: {
  traceId: string;
  occurredAt: Date;
  payoutRequestId: string;
  payoutQuoteId: string;
  organizerId: string;
  previousRequestedAmountMinor: number;
  adjustedRequestedAmountMinor: number;
  reasonCode: string;
}): CanonicalMoneyEventV1 {
  return {
    eventId: deterministicUuid(`event:${params.traceId}:payout.adjusted`),
    traceId: params.traceId,
    occurredAt: params.occurredAt.toISOString(),
    recordedAt: params.occurredAt.toISOString(),
    eventName: 'payout.adjusted',
    version: 1,
    entityType: 'payout',
    entityId: params.payoutRequestId,
    source: 'worker',
    idempotencyKey: `${params.traceId}:adjusted`.slice(0, 128),
    metadata: {
      policyVersion: PAYOUT_LIFECYCLE_POLICY_VERSION,
      adjustmentMode: 'decrease_only',
      reasonCode: params.reasonCode,
    },
    payload: {
      organizerId: params.organizerId,
      payoutRequestId: params.payoutRequestId,
      payoutQuoteId: params.payoutQuoteId,
      previousRequestedAmount: {
        amountMinor: params.previousRequestedAmountMinor,
        currency: DEFAULT_PAYOUT_CURRENCY,
      },
      adjustedRequestedAmount: {
        amountMinor: params.adjustedRequestedAmountMinor,
        currency: DEFAULT_PAYOUT_CURRENCY,
      },
      reasonCode: params.reasonCode,
    },
  };
}

export async function transitionPayoutLifecycle(params: {
  payoutRequestId: string;
  actorUserId: string;
  action: PayoutLifecycleTransitionAction;
  reasonCode?: string | null;
  adjustedAmountMinor?: number | null;
  executionMode?: PayoutLifecycleExecutionMode;
  runtime?: FinancialProcessorRuntime;
  now?: Date;
  nodeEnv?: string;
}): Promise<PayoutLifecycleTransitionResult> {
  const payoutRequestId = params.payoutRequestId.trim();
  if (!payoutRequestId) {
    throw toError('PAYOUT_REQUEST_ID_REQUIRED');
  }

  const now = params.now ?? new Date();
  const executionMode = normalizeExecutionMode(params.executionMode);
  const runtime = normalizeRuntime(params.runtime, executionMode);
  const nodeEnv = params.nodeEnv ?? process.env.NODE_ENV ?? 'development';

  assertExecutionModeAllowed(nodeEnv, executionMode);

  try {
    assertFinancialProcessorRuntime({
      nodeEnv,
      runtime,
      processorName: 'payout_processor',
    });
  } catch (error) {
    throw toError(
      'PAYOUT_TRANSITION_RUNTIME_BLOCKED',
      error instanceof Error ? error.message : undefined,
    );
  }

  const transitionRule = payoutTransitionRuleByAction[params.action];
  const reasonCode = normalizeTransitionReasonCode({
    action: params.action,
    reasonCode: params.reasonCode,
  });

  const payoutRequest = await db.query.payoutRequests.findFirst({
    where: and(eq(payoutRequests.id, payoutRequestId), isNull(payoutRequests.deletedAt)),
    columns: {
      id: true,
      organizerId: true,
      payoutQuoteId: true,
      status: true,
      traceId: true,
      lifecycleContextJson: true,
    },
  });

  if (!payoutRequest) {
    throw toError('PAYOUT_REQUEST_NOT_FOUND');
  }

  if (!payoutTransitionStatuses.includes(payoutRequest.status as PayoutTransitionStatus)) {
    throw toError(
      'PAYOUT_TRANSITION_NOT_ALLOWED',
      `Payout status ${payoutRequest.status} is outside supported transition set.`,
    );
  }

  if (!transitionRule.allowedFrom.includes(payoutRequest.status as PayoutTransitionStatus)) {
    throw toError(
      'PAYOUT_TRANSITION_NOT_ALLOWED',
      `Transition action ${params.action} is not allowed from status ${payoutRequest.status}.`,
    );
  }

  const payoutQuote = await db.query.payoutQuotes.findFirst({
    where: and(
      eq(payoutQuotes.id, payoutRequest.payoutQuoteId),
      eq(payoutQuotes.organizerId, payoutRequest.organizerId),
      isNull(payoutQuotes.deletedAt),
    ),
    columns: {
      requestedAmountMinor: true,
    },
  });

  if (!payoutQuote) {
    throw toError('PAYOUT_REQUEST_NOT_FOUND');
  }

  const lifecycleContext = toRecord(payoutRequest.lifecycleContextJson);
  const currentRequestedAmountMinor = readCurrentRequestedAmount({
    lifecycleContext,
    baselineRequestedAmountMinor: payoutQuote.requestedAmountMinor,
  });

  if (currentRequestedAmountMinor <= 0) {
    throw toError('PAYOUT_RISK_ADJUSTMENT_INVALID');
  }

  const requestedAdjustmentMinor = normalizePositiveMinor(params.adjustedAmountMinor);

  if (params.adjustedAmountMinor != null && requestedAdjustmentMinor == null) {
    throw toError('PAYOUT_RISK_ADJUSTMENT_INVALID');
  }

  if (params.adjustedAmountMinor != null && params.action !== 'pause_for_risk') {
    throw toError(
      'PAYOUT_RISK_ADJUSTMENT_INVALID',
      'Risk adjustment amount is only supported for pause_for_risk transitions.',
    );
  }

  if (
    requestedAdjustmentMinor != null &&
    requestedAdjustmentMinor > currentRequestedAmountMinor
  ) {
    throw toError(
      'PAYOUT_RISK_ADJUSTMENT_NON_DECREASE',
      `Adjusted requested amount ${requestedAdjustmentMinor} exceeds current amount ${currentRequestedAmountMinor}.`,
    );
  }

  const adjustedRequestedAmountMinor = requestedAdjustmentMinor ?? currentRequestedAmountMinor;
  const adjustmentAppliedMinor = Math.max(
    currentRequestedAmountMinor - adjustedRequestedAmountMinor,
    0,
  );

  const nextLifecycleContext = {
    ...lifecycleContext,
    currentRequestedAmountMinor: adjustedRequestedAmountMinor,
    lastTransition: {
      fromStatus: payoutRequest.status,
      toStatus: transitionRule.toStatus,
      transitionAction: params.action,
      reasonCode,
      actorUserId: params.actorUserId,
      transitionedAt: now.toISOString(),
    },
    riskPolicy:
      params.action === 'pause_for_risk'
        ? {
            policyVersion: PAYOUT_LIFECYCLE_POLICY_VERSION,
            pausedAt: now.toISOString(),
            reasonCode,
            previousRequestedAmountMinor: currentRequestedAmountMinor,
            adjustedRequestedAmountMinor,
            adjustmentAppliedMinor,
          }
        : lifecycleContext.riskPolicy,
  } satisfies Record<string, unknown>;

  const [updatedRequest] = await db
    .update(payoutRequests)
    .set({
      status: transitionRule.toStatus,
      lifecycleContextJson: nextLifecycleContext,
    })
    .where(
      and(
        eq(payoutRequests.id, payoutRequest.id),
        eq(payoutRequests.status, payoutRequest.status),
        isNull(payoutRequests.deletedAt),
      ),
    )
    .returning({
      id: payoutRequests.id,
      organizerId: payoutRequests.organizerId,
      payoutQuoteId: payoutRequests.payoutQuoteId,
      status: payoutRequests.status,
    });

  let finalStatus = updatedRequest?.status as PayoutTransitionStatus | undefined;

  if (!updatedRequest) {
    const refreshedRequest = await db.query.payoutRequests.findFirst({
      where: and(eq(payoutRequests.id, payoutRequest.id), isNull(payoutRequests.deletedAt)),
      columns: {
        status: true,
      },
    });

    if (!refreshedRequest || refreshedRequest.status !== transitionRule.toStatus) {
      throw toError('PAYOUT_TRANSITION_UPDATE_FAILED');
    }

    finalStatus = refreshedRequest.status as PayoutTransitionStatus;
  }

  const traceId = buildTransitionTraceId({
    payoutRequestTraceId: payoutRequest.traceId,
    action: params.action,
  });

  const transitionEvent = buildTransitionEvent({
    eventName: transitionRule.eventName,
    traceId,
    occurredAt: now,
    payoutRequestId: payoutRequest.id,
    payoutQuoteId: payoutRequest.payoutQuoteId,
    organizerId: payoutRequest.organizerId,
    amountMinor: adjustedRequestedAmountMinor,
    reasonCode,
  });

  const events: CanonicalMoneyEventV1[] = [transitionEvent];

  if (adjustmentAppliedMinor > 0) {
    events.push(
      buildAdjustmentEvent({
        traceId,
        occurredAt: now,
        payoutRequestId: payoutRequest.id,
        payoutQuoteId: payoutRequest.payoutQuoteId,
        organizerId: payoutRequest.organizerId,
        previousRequestedAmountMinor: currentRequestedAmountMinor,
        adjustedRequestedAmountMinor,
        reasonCode,
      }),
    );
  }

  const ingressResult = await ingestMoneyMutationFromWorker({
    traceId,
    organizerId: payoutRequest.organizerId,
    idempotencyKey: traceId,
    events,
  });

  return {
    payoutRequestId: payoutRequest.id,
    organizerId: payoutRequest.organizerId,
    payoutQuoteId: payoutRequest.payoutQuoteId,
    transitionAction: params.action,
    previousStatus: payoutRequest.status,
    status: finalStatus ?? transitionRule.toStatus,
    reasonCode,
    currentRequestedAmountMinor,
    adjustmentAppliedMinor,
    adjustedRequestedAmountMinor:
      adjustmentAppliedMinor > 0 ? adjustedRequestedAmountMinor : null,
    occurredAt: now,
    traceId: ingressResult.traceId,
    ingressDeduplicated: ingressResult.deduplicated,
    executionMode,
    runtime,
  };
}
