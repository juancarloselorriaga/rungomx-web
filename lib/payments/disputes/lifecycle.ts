import { randomUUID } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { disputeCases, registrations } from '@/db/schema';
import { type CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import {
  ingestMoneyMutationFromApi,
  ingestMoneyMutationFromWorker,
} from '@/lib/payments/core/mutation-ingress-paths';
import {
  assertFinancialProcessorRuntime,
  type FinancialProcessorRuntime,
} from '@/lib/payments/core/replay';

const DISPUTE_INTAKE_TRACE_PREFIX = 'dispute-intake:';
const DISPUTE_SETTLEMENT_TRACE_PREFIX = 'dispute-settlement:';
const DISPUTE_DEFAULT_CURRENCY = 'MXN';
const DISPUTE_DEFAULT_EVIDENCE_WINDOW_HOURS = 72;
const DISPUTE_FREEZE_LADDER_PROFILE = 'full_at_risk_v1';
const DISPUTE_SETTLEMENT_COMPOSITION = 'single_debt_posting_v1';

export const disputeLifecycleStatuses = [
  'opened',
  'evidence_required',
  'under_review',
  'won',
  'lost',
  'cancelled',
] as const;

export type DisputeLifecycleStatus = (typeof disputeLifecycleStatuses)[number];

export const disputeSettlementExecutionModes = ['in_process', 'queued_worker'] as const;

export type DisputeSettlementExecutionMode = (typeof disputeSettlementExecutionModes)[number];

export const disputeFreezeLadderStages = [
  'opened_full_hold',
  'won_release_full_hold',
  'lost_convert_full_hold_to_debt',
] as const;

export type DisputeFreezeLadderStage = (typeof disputeFreezeLadderStages)[number];

const DISPUTE_TERMINAL_STATUSES = new Set<DisputeLifecycleStatus>([
  'won',
  'lost',
  'cancelled',
]);

const disputeTransitionMap: Record<DisputeLifecycleStatus, readonly DisputeLifecycleStatus[]> = {
  opened: ['evidence_required', 'under_review', 'cancelled'],
  evidence_required: ['under_review', 'cancelled'],
  under_review: ['won', 'lost', 'cancelled'],
  won: [],
  lost: [],
  cancelled: [],
};

export const disputeLifecycleErrorCodes = [
  'DISPUTE_INTAKE_SCOPE_REQUIRED',
  'DISPUTE_INTAKE_REASON_CODE_REQUIRED',
  'DISPUTE_INTAKE_AMOUNT_INVALID',
  'DISPUTE_INTAKE_EVIDENCE_DEADLINE_INVALID',
  'DISPUTE_INTAKE_REGISTRATION_NOT_FOUND',
  'DISPUTE_INTAKE_REGISTRATION_ORGANIZER_MISMATCH',
  'DISPUTE_INTAKE_INSERT_FAILED',
  'DISPUTE_CASE_NOT_FOUND',
  'DISPUTE_EVIDENCE_CONTENT_REQUIRED',
  'DISPUTE_EVIDENCE_STATUS_INVALID',
  'DISPUTE_EVIDENCE_UPDATE_FAILED',
  'DISPUTE_SETTLEMENT_MODE_BLOCKED',
  'DISPUTE_SETTLEMENT_RUNTIME_BLOCKED',
  'DISPUTE_SETTLEMENT_AMOUNT_INVALID',
  'DISPUTE_TRANSITION_TARGET_INVALID',
  'DISPUTE_TRANSITION_NOT_ALLOWED',
  'DISPUTE_TRANSITION_UPDATE_FAILED',
] as const;

export type DisputeLifecycleErrorCode = (typeof disputeLifecycleErrorCodes)[number];

export class DisputeLifecycleError extends Error {
  public readonly code: DisputeLifecycleErrorCode;

  constructor(code: DisputeLifecycleErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type DisputeCaseMetadata = {
  createdBy?: {
    userId: string;
    source: 'api';
  };
  freezeLadder?: {
    profile: typeof DISPUTE_FREEZE_LADDER_PROFILE;
    currentStage: DisputeFreezeLadderStage;
    amountAtRiskMinor: number;
    currency: string;
  };
  settlement?: {
    traceId: string;
    settledAt: string;
    executionMode: DisputeSettlementExecutionMode;
    runtime: FinancialProcessorRuntime;
    outcomeStatus: 'won' | 'lost';
    composition: typeof DISPUTE_SETTLEMENT_COMPOSITION;
    postings: DisputeOutcomePosting[];
  };
  lastTransition?: {
    fromStatus: DisputeLifecycleStatus;
    toStatus: DisputeLifecycleStatus;
    actorUserId: string;
    reasonCode: string | null;
    reasonNote: string | null;
    transitionedAt: string;
  };
  [key: string]: unknown;
};

export type OpenedDisputeCase = {
  disputeCaseId: string;
  organizerId: string;
  registrationId: string | null;
  orderId: string | null;
  attendeeUserId: string | null;
  status: DisputeLifecycleStatus;
  reasonCode: string;
  reasonNote: string | null;
  amountAtRiskMinor: number;
  currency: string;
  evidenceDeadlineAt: Date;
  openedAt: Date;
  lastTransitionAt: Date;
  traceId: string;
  ingressDeduplicated: boolean;
  metadata: DisputeCaseMetadata;
};

export type DisputeCaseTransitionResult = {
  disputeCaseId: string;
  organizerId: string;
  fromStatus: DisputeLifecycleStatus;
  toStatus: DisputeLifecycleStatus;
  reasonCode: string | null;
  reasonNote: string | null;
  transitionedAt: Date;
  closedAt: Date | null;
  latestTransitionByUserId: string | null;
  metadata: DisputeCaseMetadata;
  settlement: DisputeOutcomeSettlement | null;
};

export type DisputeEvidenceDeadlineState = 'open' | 'expired';

export type DisputeEvidenceReference = {
  referenceId: string;
  referenceType: string;
  referenceUrl?: string | null;
  note?: string | null;
};

export type DisputeEvidenceWindow = {
  disputeCaseId: string;
  organizerId: string;
  status: DisputeLifecycleStatus;
  evidenceDeadlineAt: Date;
  asOf: Date;
  remainingSeconds: number;
  deadlineState: DisputeEvidenceDeadlineState;
};

export type SubmitDisputeEvidenceResult = {
  disputeCaseId: string;
  organizerId: string;
  status: DisputeLifecycleStatus;
  evidenceDeadlineAt: Date;
  asOf: Date;
  remainingSeconds: number;
  deadlineState: DisputeEvidenceDeadlineState;
  accepted: boolean;
  nextAction: 'continue_review' | 'escalate_dispute_review';
  metadata: DisputeCaseMetadata;
};

export type DisputeFreezeLadderDecision = {
  profile: typeof DISPUTE_FREEZE_LADDER_PROFILE;
  stage: DisputeFreezeLadderStage;
  freezeAmountMinor: number;
  releaseAmountMinor: number;
  debtAmountMinor: number;
};

export type DisputeOutcomePosting = {
  postingType: 'freeze_release' | 'debt_impact';
  amountMinor: number;
  currency: string;
};

export type DisputeOutcomeSettlement = {
  traceId: string;
  ingressDeduplicated: boolean;
  runtime: FinancialProcessorRuntime;
  executionMode: DisputeSettlementExecutionMode;
  freezeLadder: DisputeFreezeLadderDecision;
  postings: DisputeOutcomePosting[];
};

function toError(code: DisputeLifecycleErrorCode, detail?: string): DisputeLifecycleError {
  switch (code) {
    case 'DISPUTE_INTAKE_SCOPE_REQUIRED':
      return new DisputeLifecycleError(
        code,
        'Dispute intake requires at least one scope identifier (`registrationId` or `orderId`).',
      );
    case 'DISPUTE_INTAKE_REASON_CODE_REQUIRED':
      return new DisputeLifecycleError(code, 'Dispute intake reason code is required.');
    case 'DISPUTE_INTAKE_AMOUNT_INVALID':
      return new DisputeLifecycleError(code, 'Dispute intake amount at risk must be greater than zero.');
    case 'DISPUTE_INTAKE_EVIDENCE_DEADLINE_INVALID':
      return new DisputeLifecycleError(
        code,
        'Dispute evidence deadline must be after dispute opened time.',
      );
    case 'DISPUTE_INTAKE_REGISTRATION_NOT_FOUND':
      return new DisputeLifecycleError(
        code,
        'Registration scope was not found for dispute intake.',
      );
    case 'DISPUTE_INTAKE_REGISTRATION_ORGANIZER_MISMATCH':
      return new DisputeLifecycleError(
        code,
        'Registration scope does not belong to the requested organizer.',
      );
    case 'DISPUTE_INTAKE_INSERT_FAILED':
      return new DisputeLifecycleError(code, 'Dispute case could not be persisted.');
    case 'DISPUTE_CASE_NOT_FOUND':
      return new DisputeLifecycleError(code, 'Dispute case not found.');
    case 'DISPUTE_EVIDENCE_CONTENT_REQUIRED':
      return new DisputeLifecycleError(
        code,
        'Dispute evidence submission requires at least one evidence note or reference.',
      );
    case 'DISPUTE_EVIDENCE_STATUS_INVALID':
      return new DisputeLifecycleError(
        code,
        `Dispute evidence submission is not allowed for the current lifecycle state.${detail ? ` ${detail}` : ''}`,
      );
    case 'DISPUTE_EVIDENCE_UPDATE_FAILED':
      return new DisputeLifecycleError(
        code,
        'Dispute evidence submission could not be persisted.',
      );
    case 'DISPUTE_SETTLEMENT_MODE_BLOCKED':
      return new DisputeLifecycleError(
        code,
        'in_process dispute settlement is blocked in production.',
      );
    case 'DISPUTE_SETTLEMENT_RUNTIME_BLOCKED':
      return new DisputeLifecycleError(
        code,
        detail ??
          'Dispute settlement processor must run on dedicated worker runtime in production.',
      );
    case 'DISPUTE_SETTLEMENT_AMOUNT_INVALID':
      return new DisputeLifecycleError(
        code,
        'Dispute settlement amount at risk must be a positive integer amount in minor units.',
      );
    case 'DISPUTE_TRANSITION_TARGET_INVALID':
      return new DisputeLifecycleError(code, 'Dispute transition target is invalid.');
    case 'DISPUTE_TRANSITION_NOT_ALLOWED':
      return new DisputeLifecycleError(
        code,
        `Dispute transition is not allowed for the current lifecycle state.${detail ? ` ${detail}` : ''}`,
      );
    case 'DISPUTE_TRANSITION_UPDATE_FAILED':
      return new DisputeLifecycleError(
        code,
        'Dispute case transition could not be persisted.',
      );
    default:
      return new DisputeLifecycleError(code, 'Unable to process dispute lifecycle operation.');
  }
}

function normalizeReasonCode(reasonCode: string | null | undefined): string | null {
  if (typeof reasonCode !== 'string') return null;
  const trimmed = reasonCode.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeReasonNote(reasonNote: string | null | undefined): string | null {
  if (typeof reasonNote !== 'string') return null;
  const trimmed = reasonNote.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCurrency(currency: string | null | undefined): string {
  if (typeof currency !== 'string') return DISPUTE_DEFAULT_CURRENCY;
  const normalized = currency.trim().toUpperCase();
  if (normalized.length !== 3) return DISPUTE_DEFAULT_CURRENCY;
  return normalized;
}

function normalizePositiveMinor(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : null;
}

function normalizeId(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function assertDisputeSettlementExecutionModeAllowed(
  nodeEnv: string,
  mode: DisputeSettlementExecutionMode,
): void {
  if (mode === 'in_process' && nodeEnv === 'production') {
    throw toError('DISPUTE_SETTLEMENT_MODE_BLOCKED');
  }
}

function isDisputeOutcomeStatus(status: DisputeLifecycleStatus): status is 'won' | 'lost' {
  return status === 'won' || status === 'lost';
}

function resolveDisputeFreezeLadderDecision(params: {
  toStatus: 'opened' | 'won' | 'lost';
  amountAtRiskMinor: number;
}): DisputeFreezeLadderDecision {
  switch (params.toStatus) {
    case 'opened':
      return {
        profile: DISPUTE_FREEZE_LADDER_PROFILE,
        stage: 'opened_full_hold',
        freezeAmountMinor: params.amountAtRiskMinor,
        releaseAmountMinor: 0,
        debtAmountMinor: 0,
      };
    case 'won':
      return {
        profile: DISPUTE_FREEZE_LADDER_PROFILE,
        stage: 'won_release_full_hold',
        freezeAmountMinor: 0,
        releaseAmountMinor: params.amountAtRiskMinor,
        debtAmountMinor: 0,
      };
    case 'lost':
      return {
        profile: DISPUTE_FREEZE_LADDER_PROFILE,
        stage: 'lost_convert_full_hold_to_debt',
        freezeAmountMinor: 0,
        releaseAmountMinor: params.amountAtRiskMinor,
        debtAmountMinor: params.amountAtRiskMinor,
      };
    default:
      return {
        profile: DISPUTE_FREEZE_LADDER_PROFILE,
        stage: 'opened_full_hold',
        freezeAmountMinor: params.amountAtRiskMinor,
        releaseAmountMinor: 0,
        debtAmountMinor: 0,
      };
  }
}

function buildDisputeSettlementEvents(params: {
  disputeCaseId: string;
  organizerId: string;
  registrationId: string | null;
  orderId: string | null;
  currency: string;
  now: Date;
  runtime: FinancialProcessorRuntime;
  toStatus: 'won' | 'lost';
  freezeLadder: DisputeFreezeLadderDecision;
}): {
  traceId: string;
  events: CanonicalMoneyEventV1[];
  postings: DisputeOutcomePosting[];
} {
  const traceId = `${DISPUTE_SETTLEMENT_TRACE_PREFIX}${params.disputeCaseId}`;
  const source = params.runtime === 'worker' ? 'worker' : 'api';
  const commonPayload = {
    organizerId: params.organizerId,
    disputeCaseId: params.disputeCaseId,
    registrationId: params.registrationId ?? undefined,
    orderId: params.orderId ?? undefined,
    outcomeStatus: params.toStatus,
    freezeLadderProfile: params.freezeLadder.profile,
    freezeLadderStage: params.freezeLadder.stage,
  };

  const events: CanonicalMoneyEventV1[] = [];
  const postings: DisputeOutcomePosting[] = [];

  if (params.freezeLadder.releaseAmountMinor > 0) {
    events.push({
      eventId: randomUUID(),
      traceId,
      occurredAt: params.now.toISOString(),
      eventName: 'dispute.funds_released',
      version: 1,
      entityType: 'dispute',
      entityId: params.disputeCaseId,
      source,
      idempotencyKey: `${traceId}:freeze-release`,
      metadata: {
        settlementType: 'freeze_release',
      },
      payload: {
        ...commonPayload,
        amountReleased: {
          amountMinor: params.freezeLadder.releaseAmountMinor,
          currency: params.currency,
        },
      },
    });
    postings.push({
      postingType: 'freeze_release',
      amountMinor: params.freezeLadder.releaseAmountMinor,
      currency: params.currency,
    });
  }

  if (params.freezeLadder.debtAmountMinor > 0) {
    events.push({
      eventId: randomUUID(),
      traceId,
      occurredAt: params.now.toISOString(),
      eventName: 'dispute.debt_posted',
      version: 1,
      entityType: 'dispute',
      entityId: params.disputeCaseId,
      source,
      idempotencyKey: `${traceId}:debt-impact`,
      metadata: {
        settlementType: 'debt_impact',
      },
      payload: {
        ...commonPayload,
        outcomeStatus: 'lost',
        debtAmount: {
          amountMinor: params.freezeLadder.debtAmountMinor,
          currency: params.currency,
        },
        debtCode: 'dispute_loss_at_risk',
        settlementComposition: DISPUTE_SETTLEMENT_COMPOSITION,
      },
    });
    postings.push({
      postingType: 'debt_impact',
      amountMinor: params.freezeLadder.debtAmountMinor,
      currency: params.currency,
    });
  }

  return {
    traceId,
    events,
    postings,
  };
}

async function settleDisputeOutcome(params: {
  disputeCaseId: string;
  organizerId: string;
  registrationId: string | null;
  orderId: string | null;
  amountAtRiskMinor: number;
  currency: string;
  runtime: FinancialProcessorRuntime;
  executionMode: DisputeSettlementExecutionMode;
  toStatus: DisputeLifecycleStatus;
  nodeEnv: string;
  now: Date;
}): Promise<DisputeOutcomeSettlement | null> {
  if (!isDisputeOutcomeStatus(params.toStatus)) {
    return null;
  }

  const amountAtRiskMinor = normalizePositiveMinor(params.amountAtRiskMinor);
  if (amountAtRiskMinor == null) {
    throw toError('DISPUTE_SETTLEMENT_AMOUNT_INVALID');
  }

  assertDisputeSettlementExecutionModeAllowed(params.nodeEnv, params.executionMode);

  try {
    assertFinancialProcessorRuntime({
      nodeEnv: params.nodeEnv,
      runtime: params.runtime,
      processorName: 'dispute_risk_processor',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    throw toError('DISPUTE_SETTLEMENT_RUNTIME_BLOCKED', detail);
  }

  const freezeLadder = resolveDisputeFreezeLadderDecision({
    toStatus: params.toStatus,
    amountAtRiskMinor,
  });

  const settlement = buildDisputeSettlementEvents({
    disputeCaseId: params.disputeCaseId,
    organizerId: params.organizerId,
    registrationId: params.registrationId,
    orderId: params.orderId,
    currency: params.currency,
    now: params.now,
    runtime: params.runtime,
    toStatus: params.toStatus,
    freezeLadder,
  });

  const ingressInput = {
    traceId: settlement.traceId,
    organizerId: params.organizerId,
    idempotencyKey: settlement.traceId,
    events: settlement.events,
  };

  const ingressResult =
    params.runtime === 'worker'
      ? await ingestMoneyMutationFromWorker(ingressInput)
      : await ingestMoneyMutationFromApi(ingressInput);

  return {
    traceId: settlement.traceId,
    ingressDeduplicated: ingressResult.deduplicated,
    runtime: params.runtime,
    executionMode: params.executionMode,
    freezeLadder,
    postings: settlement.postings,
  };
}

function resolveEvidenceDeadline(params: { now: Date; evidenceDeadlineAt?: Date | null }): Date {
  if (params.evidenceDeadlineAt instanceof Date && !Number.isNaN(params.evidenceDeadlineAt.valueOf())) {
    return params.evidenceDeadlineAt;
  }

  return new Date(
    params.now.getTime() + DISPUTE_DEFAULT_EVIDENCE_WINDOW_HOURS * 60 * 60 * 1000,
  );
}

function resolveEvidenceCountdown(params: {
  asOf: Date;
  evidenceDeadlineAt: Date;
}): { remainingSeconds: number; deadlineState: DisputeEvidenceDeadlineState } {
  const deltaMs = params.evidenceDeadlineAt.getTime() - params.asOf.getTime();
  if (deltaMs <= 0) {
    return {
      remainingSeconds: 0,
      deadlineState: 'expired',
    };
  }

  return {
    remainingSeconds: Math.floor(deltaMs / 1000),
    deadlineState: 'open',
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return { ...(value as Record<string, unknown>) };
}

function toDisputeMetadata(value: unknown): DisputeCaseMetadata {
  return toRecord(value) as DisputeCaseMetadata;
}

function normalizeEvidenceReferences(
  references: readonly DisputeEvidenceReference[] | null | undefined,
): DisputeEvidenceReference[] {
  if (!Array.isArray(references)) return [];

  const normalized: DisputeEvidenceReference[] = [];
  for (const reference of references) {
    const referenceId = normalizeId(reference.referenceId);
    const referenceType = normalizeId(reference.referenceType);
    if (!referenceId || !referenceType) {
      continue;
    }

    const item: DisputeEvidenceReference = {
      referenceId,
      referenceType,
    };

    const referenceUrl = normalizeId(reference.referenceUrl);
    if (referenceUrl) {
      item.referenceUrl = referenceUrl;
    }

    const note = normalizeReasonNote(reference.note);
    if (note) {
      item.note = note;
    }

    normalized.push(item);
  }

  return normalized;
}

function canSubmitDisputeEvidence(status: DisputeLifecycleStatus): boolean {
  return status === 'evidence_required';
}

export function canTransitionDisputeCase(
  fromStatus: DisputeLifecycleStatus,
  toStatus: DisputeLifecycleStatus,
): boolean {
  return disputeTransitionMap[fromStatus].includes(toStatus);
}

export async function openDisputeCase(params: {
  organizerId: string;
  openedByUserId: string;
  registrationId?: string | null;
  orderId?: string | null;
  attendeeUserId?: string | null;
  reasonCode: string;
  reasonNote?: string | null;
  amountAtRiskMinor: number;
  currency?: string | null;
  evidenceDeadlineAt?: Date | null;
  now?: Date;
}): Promise<OpenedDisputeCase> {
  const now = params.now ?? new Date();
  const registrationId = normalizeId(params.registrationId);
  const orderId = normalizeId(params.orderId);
  const reasonCode = normalizeReasonCode(params.reasonCode);
  const reasonNote = normalizeReasonNote(params.reasonNote);
  const amountAtRiskMinor = normalizePositiveMinor(params.amountAtRiskMinor);
  const currency = normalizeCurrency(params.currency);

  if (!registrationId && !orderId) {
    throw toError('DISPUTE_INTAKE_SCOPE_REQUIRED');
  }

  if (!reasonCode) {
    throw toError('DISPUTE_INTAKE_REASON_CODE_REQUIRED');
  }

  if (amountAtRiskMinor == null) {
    throw toError('DISPUTE_INTAKE_AMOUNT_INVALID');
  }

  let attendeeUserId = normalizeId(params.attendeeUserId);
  if (registrationId) {
    const registration = await db.query.registrations.findFirst({
      where: and(eq(registrations.id, registrationId), isNull(registrations.deletedAt)),
      columns: {
        id: true,
        buyerUserId: true,
      },
      with: {
        edition: {
          columns: {
            id: true,
          },
          with: {
            series: {
              columns: {
                organizationId: true,
              },
            },
          },
        },
      },
    });

    if (!registration) {
      throw toError('DISPUTE_INTAKE_REGISTRATION_NOT_FOUND');
    }

    if (registration.edition.series.organizationId !== params.organizerId) {
      throw toError('DISPUTE_INTAKE_REGISTRATION_ORGANIZER_MISMATCH');
    }

    attendeeUserId = attendeeUserId ?? registration.buyerUserId ?? null;
  }

  const evidenceDeadlineAt = resolveEvidenceDeadline({
    now,
    evidenceDeadlineAt: params.evidenceDeadlineAt,
  });
  if (evidenceDeadlineAt.getTime() <= now.getTime()) {
    throw toError('DISPUTE_INTAKE_EVIDENCE_DEADLINE_INVALID');
  }

  const disputeCaseId = randomUUID();
  const traceId = `${DISPUTE_INTAKE_TRACE_PREFIX}${disputeCaseId}`;
  const freezeLadder = resolveDisputeFreezeLadderDecision({
    toStatus: 'opened',
    amountAtRiskMinor,
  });

  const disputeOpenedEvent: CanonicalMoneyEventV1 = {
    eventId: randomUUID(),
    traceId,
    occurredAt: now.toISOString(),
    recordedAt: now.toISOString(),
    eventName: 'dispute.opened',
    version: 1,
    entityType: 'dispute',
    entityId: disputeCaseId,
    source: 'api',
    idempotencyKey: traceId,
    metadata: {
      lifecycleStatus: 'opened',
      intakeSource: 'api',
    },
    payload: {
      organizerId: params.organizerId,
      registrationId: registrationId ?? undefined,
      orderId: orderId ?? undefined,
      disputeCaseId,
      amountAtRisk: {
        amountMinor: amountAtRiskMinor,
        currency,
      },
      evidenceDeadlineAt: evidenceDeadlineAt.toISOString(),
    },
  };

  const ingressResult = await ingestMoneyMutationFromApi({
    traceId,
    organizerId: params.organizerId,
    idempotencyKey: traceId,
    events: [disputeOpenedEvent],
  });

  const metadata: DisputeCaseMetadata = {
    createdBy: {
      userId: params.openedByUserId,
      source: 'api',
    },
    freezeLadder: {
      profile: freezeLadder.profile,
      currentStage: freezeLadder.stage,
      amountAtRiskMinor,
      currency,
    },
    lastTransition: {
      fromStatus: 'opened',
      toStatus: 'opened',
      actorUserId: params.openedByUserId,
      reasonCode,
      reasonNote,
      transitionedAt: now.toISOString(),
    },
  };

  const [createdDisputeCase] = await db
    .insert(disputeCases)
    .values({
      id: disputeCaseId,
      organizerId: params.organizerId,
      registrationId,
      orderId,
      attendeeUserId,
      openedByUserId: params.openedByUserId,
      latestTransitionByUserId: params.openedByUserId,
      status: 'opened',
      reasonCode,
      reasonNote,
      amountAtRiskMinor,
      currency,
      evidenceDeadlineAt,
      openedAt: now,
      lastTransitionAt: now,
      metadataJson: metadata,
    })
    .returning({
      id: disputeCases.id,
      organizerId: disputeCases.organizerId,
      registrationId: disputeCases.registrationId,
      orderId: disputeCases.orderId,
      attendeeUserId: disputeCases.attendeeUserId,
      status: disputeCases.status,
      reasonCode: disputeCases.reasonCode,
      reasonNote: disputeCases.reasonNote,
      amountAtRiskMinor: disputeCases.amountAtRiskMinor,
      currency: disputeCases.currency,
      evidenceDeadlineAt: disputeCases.evidenceDeadlineAt,
      openedAt: disputeCases.openedAt,
      lastTransitionAt: disputeCases.lastTransitionAt,
      metadataJson: disputeCases.metadataJson,
    });

  if (!createdDisputeCase) {
    throw toError('DISPUTE_INTAKE_INSERT_FAILED');
  }

  return {
    disputeCaseId: createdDisputeCase.id,
    organizerId: createdDisputeCase.organizerId,
    registrationId: createdDisputeCase.registrationId,
    orderId: createdDisputeCase.orderId,
    attendeeUserId: createdDisputeCase.attendeeUserId,
    status: createdDisputeCase.status as DisputeLifecycleStatus,
    reasonCode: createdDisputeCase.reasonCode,
    reasonNote: createdDisputeCase.reasonNote,
    amountAtRiskMinor: createdDisputeCase.amountAtRiskMinor,
    currency: createdDisputeCase.currency,
    evidenceDeadlineAt: createdDisputeCase.evidenceDeadlineAt,
    openedAt: createdDisputeCase.openedAt,
    lastTransitionAt: createdDisputeCase.lastTransitionAt,
    traceId,
    ingressDeduplicated: ingressResult.deduplicated,
    metadata: toDisputeMetadata(createdDisputeCase.metadataJson),
  };
}

export async function getDisputeEvidenceWindow(params: {
  disputeCaseId: string;
  organizerId: string;
  asOf?: Date;
}): Promise<DisputeEvidenceWindow> {
  const asOf = params.asOf ?? new Date();

  const disputeCase = await db.query.disputeCases.findFirst({
    where: and(
      eq(disputeCases.id, params.disputeCaseId),
      eq(disputeCases.organizerId, params.organizerId),
      isNull(disputeCases.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      status: true,
      evidenceDeadlineAt: true,
    },
  });

  if (!disputeCase) {
    throw toError('DISPUTE_CASE_NOT_FOUND');
  }

  const countdown = resolveEvidenceCountdown({
    asOf,
    evidenceDeadlineAt: disputeCase.evidenceDeadlineAt,
  });

  return {
    disputeCaseId: disputeCase.id,
    organizerId: disputeCase.organizerId,
    status: disputeCase.status as DisputeLifecycleStatus,
    evidenceDeadlineAt: disputeCase.evidenceDeadlineAt,
    asOf,
    remainingSeconds: countdown.remainingSeconds,
    deadlineState: countdown.deadlineState,
  };
}

export async function submitDisputeEvidence(params: {
  disputeCaseId: string;
  organizerId: string;
  actorUserId: string;
  evidenceNote?: string | null;
  evidenceReferences?: readonly DisputeEvidenceReference[];
  now?: Date;
}): Promise<SubmitDisputeEvidenceResult> {
  const now = params.now ?? new Date();
  const evidenceNote = normalizeReasonNote(params.evidenceNote);
  const evidenceReferences = normalizeEvidenceReferences(params.evidenceReferences);
  if (!evidenceNote && evidenceReferences.length === 0) {
    throw toError('DISPUTE_EVIDENCE_CONTENT_REQUIRED');
  }

  const disputeCase = await db.query.disputeCases.findFirst({
    where: and(
      eq(disputeCases.id, params.disputeCaseId),
      eq(disputeCases.organizerId, params.organizerId),
      isNull(disputeCases.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      status: true,
      evidenceDeadlineAt: true,
      metadataJson: true,
    },
  });

  if (!disputeCase) {
    throw toError('DISPUTE_CASE_NOT_FOUND');
  }

  const fromStatus = disputeCase.status as DisputeLifecycleStatus;
  if (!canSubmitDisputeEvidence(fromStatus)) {
    throw toError('DISPUTE_EVIDENCE_STATUS_INVALID', `status=${fromStatus}`);
  }

  const countdown = resolveEvidenceCountdown({
    asOf: now,
    evidenceDeadlineAt: disputeCase.evidenceDeadlineAt,
  });
  const metadata = toDisputeMetadata(disputeCase.metadataJson);
  const evidenceSubmission = {
    submittedAt: now.toISOString(),
    actorUserId: params.actorUserId,
    note: evidenceNote,
    references: evidenceReferences,
  };

  if (countdown.deadlineState === 'expired') {
    const expiredMetadata: DisputeCaseMetadata = {
      ...metadata,
      lastEvidenceSubmissionAttempt: {
        ...evidenceSubmission,
        outcome: 'blocked_deadline_expired',
      },
      escalation: {
        nextAction: 'escalate_dispute_review',
        reasonCode: 'evidence_deadline_expired',
        requestedAt: now.toISOString(),
      },
    };

    const [updatedDisputeCase] = await db
      .update(disputeCases)
      .set({
        lastTransitionAt: now,
        latestTransitionByUserId: params.actorUserId,
        metadataJson: expiredMetadata,
      })
      .where(
        and(
          eq(disputeCases.id, params.disputeCaseId),
          eq(disputeCases.organizerId, params.organizerId),
          eq(disputeCases.status, fromStatus),
          isNull(disputeCases.deletedAt),
        ),
      )
      .returning({
        id: disputeCases.id,
        organizerId: disputeCases.organizerId,
        status: disputeCases.status,
        evidenceDeadlineAt: disputeCases.evidenceDeadlineAt,
        metadataJson: disputeCases.metadataJson,
      });

    if (!updatedDisputeCase) {
      throw toError('DISPUTE_EVIDENCE_UPDATE_FAILED');
    }

    return {
      disputeCaseId: updatedDisputeCase.id,
      organizerId: updatedDisputeCase.organizerId,
      status: updatedDisputeCase.status as DisputeLifecycleStatus,
      evidenceDeadlineAt: updatedDisputeCase.evidenceDeadlineAt,
      asOf: now,
      remainingSeconds: 0,
      deadlineState: 'expired',
      accepted: false,
      nextAction: 'escalate_dispute_review',
      metadata: toDisputeMetadata(updatedDisputeCase.metadataJson),
    };
  }

  const toStatus: DisputeLifecycleStatus = 'under_review';
  const nextMetadata: DisputeCaseMetadata = {
    ...metadata,
    lastEvidenceSubmission: {
      ...evidenceSubmission,
      outcome: 'accepted',
    },
    lastTransition: {
      fromStatus,
      toStatus,
      actorUserId: params.actorUserId,
      reasonCode: 'evidence_submitted',
      reasonNote: evidenceNote,
      transitionedAt: now.toISOString(),
    },
  };

  const [updatedDisputeCase] = await db
    .update(disputeCases)
    .set({
      status: toStatus,
      lastTransitionAt: now,
      latestTransitionByUserId: params.actorUserId,
      metadataJson: nextMetadata,
    })
    .where(
      and(
        eq(disputeCases.id, params.disputeCaseId),
        eq(disputeCases.organizerId, params.organizerId),
        eq(disputeCases.status, fromStatus),
        isNull(disputeCases.deletedAt),
      ),
    )
    .returning({
      id: disputeCases.id,
      organizerId: disputeCases.organizerId,
      status: disputeCases.status,
      evidenceDeadlineAt: disputeCases.evidenceDeadlineAt,
      metadataJson: disputeCases.metadataJson,
    });

  if (!updatedDisputeCase) {
    throw toError('DISPUTE_EVIDENCE_UPDATE_FAILED');
  }

  const updatedCountdown = resolveEvidenceCountdown({
    asOf: now,
    evidenceDeadlineAt: updatedDisputeCase.evidenceDeadlineAt,
  });

  return {
    disputeCaseId: updatedDisputeCase.id,
    organizerId: updatedDisputeCase.organizerId,
    status: updatedDisputeCase.status as DisputeLifecycleStatus,
    evidenceDeadlineAt: updatedDisputeCase.evidenceDeadlineAt,
    asOf: now,
    remainingSeconds: updatedCountdown.remainingSeconds,
    deadlineState: updatedCountdown.deadlineState,
    accepted: true,
    nextAction: 'continue_review',
    metadata: toDisputeMetadata(updatedDisputeCase.metadataJson),
  };
}

export async function transitionDisputeCase(params: {
  disputeCaseId: string;
  organizerId: string;
  actorUserId: string;
  toStatus: DisputeLifecycleStatus;
  reasonCode?: string | null;
  reasonNote?: string | null;
  runtime?: FinancialProcessorRuntime;
  executionMode?: DisputeSettlementExecutionMode;
  nodeEnv?: string;
  now?: Date;
}): Promise<DisputeCaseTransitionResult> {
  const now = params.now ?? new Date();
  const toStatus = params.toStatus;
  const runtime = params.runtime ?? 'web';
  const executionMode = params.executionMode ?? 'in_process';
  const nodeEnv = params.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const reasonCode = normalizeReasonCode(params.reasonCode);
  const reasonNote = normalizeReasonNote(params.reasonNote);

  if (!disputeLifecycleStatuses.includes(toStatus)) {
    throw toError('DISPUTE_TRANSITION_TARGET_INVALID');
  }

  const disputeCase = await db.query.disputeCases.findFirst({
    where: and(
      eq(disputeCases.id, params.disputeCaseId),
      eq(disputeCases.organizerId, params.organizerId),
      isNull(disputeCases.deletedAt),
    ),
    columns: {
      id: true,
      organizerId: true,
      registrationId: true,
      orderId: true,
      status: true,
      amountAtRiskMinor: true,
      currency: true,
      metadataJson: true,
    },
  });

  if (!disputeCase) {
    throw toError('DISPUTE_CASE_NOT_FOUND');
  }

  const fromStatus = disputeCase.status as DisputeLifecycleStatus;
  if (!canTransitionDisputeCase(fromStatus, toStatus)) {
    throw toError(
      'DISPUTE_TRANSITION_NOT_ALLOWED',
      `from=${fromStatus} to=${toStatus}`,
    );
  }

  const metadata = toDisputeMetadata(disputeCase.metadataJson);
  const settlement = await settleDisputeOutcome({
    disputeCaseId: disputeCase.id,
    organizerId: disputeCase.organizerId,
    registrationId: disputeCase.registrationId,
    orderId: disputeCase.orderId,
    amountAtRiskMinor: disputeCase.amountAtRiskMinor,
    currency: disputeCase.currency,
    runtime,
    executionMode,
    toStatus,
    nodeEnv,
    now,
  });
  const nextMetadata: DisputeCaseMetadata = {
    ...metadata,
    freezeLadder: settlement
      ? {
          profile: settlement.freezeLadder.profile,
          currentStage: settlement.freezeLadder.stage,
          amountAtRiskMinor: disputeCase.amountAtRiskMinor,
          currency: disputeCase.currency,
        }
      : metadata.freezeLadder,
    settlement: settlement
      ? {
          traceId: settlement.traceId,
          settledAt: now.toISOString(),
          executionMode: settlement.executionMode,
          runtime: settlement.runtime,
          outcomeStatus: toStatus as 'won' | 'lost',
          composition: DISPUTE_SETTLEMENT_COMPOSITION,
          postings: settlement.postings,
        }
      : metadata.settlement,
    lastTransition: {
      fromStatus,
      toStatus,
      actorUserId: params.actorUserId,
      reasonCode,
      reasonNote,
      transitionedAt: now.toISOString(),
    },
  };

  const closedAt = DISPUTE_TERMINAL_STATUSES.has(toStatus) ? now : null;

  const [updatedDisputeCase] = await db
    .update(disputeCases)
    .set({
      status: toStatus,
      lastTransitionAt: now,
      latestTransitionByUserId: params.actorUserId,
      closedAt,
      metadataJson: nextMetadata,
    })
    .where(
      and(
        eq(disputeCases.id, params.disputeCaseId),
        eq(disputeCases.organizerId, params.organizerId),
        eq(disputeCases.status, fromStatus),
        isNull(disputeCases.deletedAt),
      ),
    )
    .returning({
      id: disputeCases.id,
      organizerId: disputeCases.organizerId,
      status: disputeCases.status,
      closedAt: disputeCases.closedAt,
      lastTransitionAt: disputeCases.lastTransitionAt,
      latestTransitionByUserId: disputeCases.latestTransitionByUserId,
      metadataJson: disputeCases.metadataJson,
    });

  if (!updatedDisputeCase) {
    throw toError('DISPUTE_TRANSITION_UPDATE_FAILED');
  }

  return {
    disputeCaseId: updatedDisputeCase.id,
    organizerId: updatedDisputeCase.organizerId,
    fromStatus,
    toStatus: updatedDisputeCase.status as DisputeLifecycleStatus,
    reasonCode,
    reasonNote,
    transitionedAt: updatedDisputeCase.lastTransitionAt,
    closedAt: updatedDisputeCase.closedAt,
    latestTransitionByUserId: updatedDisputeCase.latestTransitionByUserId,
    metadata: toDisputeMetadata(updatedDisputeCase.metadataJson),
    settlement,
  };
}
