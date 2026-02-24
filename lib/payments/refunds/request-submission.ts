import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventEditions, eventPolicyConfigs, eventSeries, refundRequests } from '@/db/schema';
import { getRegistrationForOwnerOrThrow } from '@/lib/events/registrations/ownership';

export const refundSubmissionReasonCodes = [
  'schedule_conflict',
  'medical',
  'injury',
  'event_changed',
  'other',
] as const;

export type RefundSubmissionReasonCode = (typeof refundSubmissionReasonCodes)[number];

export const refundRequestIneligibilityCodes = [
  'POLICY_NOT_CONFIGURED',
  'REFUNDS_DISABLED',
  'REFUND_DEADLINE_EXPIRED',
  'REGISTRATION_NOT_CONFIRMED',
  'REFUND_ALREADY_PENDING',
] as const;

export type RefundRequestIneligibilityCode = (typeof refundRequestIneligibilityCodes)[number];

const POSTGRES_UNIQUE_VIOLATION_CODE = '23505';
const REFUND_REQUEST_PENDING_UNIQUE_IDX = 'refund_requests_registration_pending_unique_idx';

type RefundRequestEligibilitySnapshot = {
  version: 'refund-request-eligibility-v1';
  evaluatedAt: string;
  decision: 'eligible';
  reasonCode: 'ELIGIBLE';
  baseline: 'registration_status_confirmed_only';
  deadlineRule: 'policy_deadline_if_configured_else_open';
  policy: {
    refundsAllowed: boolean;
    refundPolicyText: string | null;
    refundDeadline: string | null;
    timezone: string;
  };
};

type RefundRequestFinancialSnapshot = {
  version: 'refund-request-financial-v1';
  currency: 'MXN';
  totalPaidMinor: number;
  nonRefundableServiceFeeMinor: number;
  maxRefundableToAttendeeMinor: number;
  serviceFeePolicy: 'non_refundable_always';
};

export type SubmittedRefundRequest = {
  id: string;
  registrationId: string;
  editionId: string;
  organizerId: string;
  attendeeUserId: string;
  status: 'pending_organizer_decision';
  reasonCode: RefundSubmissionReasonCode;
  reasonNote: string | null;
  requestedAt: Date;
  eligibilitySnapshot: RefundRequestEligibilitySnapshot;
  financialSnapshot: RefundRequestFinancialSnapshot;
};

export class RefundRequestEligibilityError extends Error {
  public readonly code: RefundRequestIneligibilityCode;

  constructor(code: RefundRequestIneligibilityCode, message: string) {
    super(message);
    this.code = code;
  }
}

function toNonNegativeMinor(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(Math.trunc(value), 0);
}

function normalizeOptionalReasonNote(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

type PostgresErrorLike = {
  code?: unknown;
  constraint?: unknown;
};

function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;

  const dbError = error as PostgresErrorLike;
  if (dbError.code !== POSTGRES_UNIQUE_VIOLATION_CODE) return false;

  if (typeof dbError.constraint !== 'string') return true;
  return dbError.constraint === REFUND_REQUEST_PENDING_UNIQUE_IDX;
}

function toIneligibilityError(
  code: RefundRequestIneligibilityCode,
  policyText: string | null,
  refundDeadline: Date | null,
): RefundRequestEligibilityError {
  const policySuffix = policyText?.trim()
    ? ` Policy: ${policyText.trim()}`
    : '';

  switch (code) {
    case 'POLICY_NOT_CONFIGURED':
      return new RefundRequestEligibilityError(
        code,
        `Refund policy is not configured for this event.${policySuffix}`,
      );
    case 'REFUNDS_DISABLED':
      return new RefundRequestEligibilityError(
        code,
        `Refund requests are disabled for this event.${policySuffix}`,
      );
    case 'REFUND_DEADLINE_EXPIRED':
      return new RefundRequestEligibilityError(
        code,
        `Refund request window closed on ${refundDeadline?.toISOString() ?? 'the configured deadline'}.${policySuffix}`,
      );
    case 'REGISTRATION_NOT_CONFIRMED':
      return new RefundRequestEligibilityError(
        code,
        'Refund requests are available only for confirmed registrations.',
      );
    case 'REFUND_ALREADY_PENDING':
      return new RefundRequestEligibilityError(
        code,
        'A refund request is already pending for this registration.',
      );
    default:
      return new RefundRequestEligibilityError(code, 'Refund request is not eligible.');
  }
}

function assertEligibleOrThrow(params: {
  registrationStatus: string;
  refundsAllowed: boolean;
  refundDeadline: Date | null;
  policyText: string | null;
  now: Date;
}) {
  if (!params.refundsAllowed) {
    throw toIneligibilityError('REFUNDS_DISABLED', params.policyText, params.refundDeadline);
  }

  if (params.registrationStatus !== 'confirmed') {
    throw toIneligibilityError('REGISTRATION_NOT_CONFIRMED', params.policyText, params.refundDeadline);
  }

  if (params.refundDeadline && params.now.getTime() > params.refundDeadline.getTime()) {
    throw toIneligibilityError('REFUND_DEADLINE_EXPIRED', params.policyText, params.refundDeadline);
  }
}

export async function submitAttendeeRefundRequest(params: {
  registrationId: string;
  attendeeUserId: string;
  reasonCode: RefundSubmissionReasonCode;
  reasonNote?: string | null;
  now?: Date;
}): Promise<SubmittedRefundRequest> {
  const now = params.now ?? new Date();

  const registration = await getRegistrationForOwnerOrThrow({
    registrationId: params.registrationId,
    userId: params.attendeeUserId,
  });

  const [editionContext] = await db
    .select({
      editionId: eventEditions.id,
      timezone: eventEditions.timezone,
      organizerId: eventSeries.organizationId,
      refundsAllowed: eventPolicyConfigs.refundsAllowed,
      refundPolicyText: eventPolicyConfigs.refundPolicyText,
      refundDeadline: eventPolicyConfigs.refundDeadline,
    })
    .from(eventEditions)
    .innerJoin(eventSeries, eq(eventSeries.id, eventEditions.seriesId))
    .leftJoin(eventPolicyConfigs, eq(eventPolicyConfigs.editionId, eventEditions.id))
    .where(
      and(
        eq(eventEditions.id, registration.editionId),
        isNull(eventEditions.deletedAt),
        isNull(eventSeries.deletedAt),
      ),
    )
    .limit(1);

  if (!editionContext) {
    throw toIneligibilityError('POLICY_NOT_CONFIGURED', null, null);
  }

  const policyConfig =
    editionContext.refundsAllowed == null
      ? null
      : {
          refundsAllowed: editionContext.refundsAllowed,
          refundPolicyText: editionContext.refundPolicyText,
          refundDeadline: editionContext.refundDeadline,
        };

  if (!policyConfig) {
    throw toIneligibilityError('POLICY_NOT_CONFIGURED', null, null);
  }

  assertEligibleOrThrow({
    registrationStatus: registration.status,
    refundsAllowed: policyConfig.refundsAllowed,
    refundDeadline: policyConfig.refundDeadline,
    policyText: policyConfig.refundPolicyText,
    now,
  });

  const existingPendingRequest = await db.query.refundRequests.findFirst({
    where: and(
      eq(refundRequests.registrationId, registration.id),
      eq(refundRequests.status, 'pending_organizer_decision'),
      isNull(refundRequests.deletedAt),
    ),
    columns: {
      id: true,
    },
  });

  if (existingPendingRequest) {
    throw toIneligibilityError(
      'REFUND_ALREADY_PENDING',
      policyConfig.refundPolicyText,
      policyConfig.refundDeadline,
    );
  }

  const serviceFeeMinor = toNonNegativeMinor(registration.feesCents);
  const fallbackTotalPaidMinor =
    toNonNegativeMinor(registration.basePriceCents) +
    serviceFeeMinor +
    toNonNegativeMinor(registration.taxCents);
  const totalPaidMinor =
    registration.totalCents == null
      ? fallbackTotalPaidMinor
      : toNonNegativeMinor(registration.totalCents);

  const eligibilitySnapshot: RefundRequestEligibilitySnapshot = {
    version: 'refund-request-eligibility-v1',
    evaluatedAt: now.toISOString(),
    decision: 'eligible',
    reasonCode: 'ELIGIBLE',
    baseline: 'registration_status_confirmed_only',
    deadlineRule: 'policy_deadline_if_configured_else_open',
    policy: {
      refundsAllowed: policyConfig.refundsAllowed,
      refundPolicyText: policyConfig.refundPolicyText,
      refundDeadline: policyConfig.refundDeadline?.toISOString() ?? null,
      timezone: editionContext.timezone,
    },
  };

  const financialSnapshot: RefundRequestFinancialSnapshot = {
    version: 'refund-request-financial-v1',
    currency: 'MXN',
    totalPaidMinor,
    nonRefundableServiceFeeMinor: serviceFeeMinor,
    maxRefundableToAttendeeMinor: Math.max(totalPaidMinor - serviceFeeMinor, 0),
    serviceFeePolicy: 'non_refundable_always',
  };

  const reasonNote = normalizeOptionalReasonNote(params.reasonNote);

  try {
    const [created] = await db
      .insert(refundRequests)
      .values({
        registrationId: registration.id,
        editionId: editionContext.editionId,
        organizerId: editionContext.organizerId,
        attendeeUserId: params.attendeeUserId,
        requestedByUserId: params.attendeeUserId,
        status: 'pending_organizer_decision',
        reasonCode: params.reasonCode,
        reasonNote,
        eligibilitySnapshotJson: eligibilitySnapshot,
        financialSnapshotJson: financialSnapshot,
        requestedAt: now,
      })
      .returning({
        id: refundRequests.id,
        registrationId: refundRequests.registrationId,
        editionId: refundRequests.editionId,
        organizerId: refundRequests.organizerId,
        attendeeUserId: refundRequests.attendeeUserId,
        status: refundRequests.status,
        reasonCode: refundRequests.reasonCode,
        reasonNote: refundRequests.reasonNote,
        requestedAt: refundRequests.requestedAt,
      });

    if (!created) {
      throw new Error('REFUND_REQUEST_INSERT_FAILED');
    }

    return {
      id: created.id,
      registrationId: created.registrationId,
      editionId: created.editionId,
      organizerId: created.organizerId,
      attendeeUserId: created.attendeeUserId,
      status: created.status as 'pending_organizer_decision',
      reasonCode: created.reasonCode as RefundSubmissionReasonCode,
      reasonNote: created.reasonNote,
      requestedAt: created.requestedAt,
      eligibilitySnapshot,
      financialSnapshot,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw toIneligibilityError(
        'REFUND_ALREADY_PENDING',
        policyConfig.refundPolicyText,
        policyConfig.refundDeadline,
      );
    }

    throw error;
  }
}
