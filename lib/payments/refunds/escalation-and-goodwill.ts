import { and, asc, eq, inArray, isNull, lte } from 'drizzle-orm';

import { db } from '@/db';
import {
  eventEditions,
  refundRequests,
  registrations,
} from '@/db/schema';

const REFUND_ESCALATION_DECISION_REASON = 'Escalated after organizer decision SLA expiry.';
const REVIEW_QUEUE_STATUS = 'escalated_admin_review';
const GOODWILL_REASON_CODE = 'goodwill_manual';

export const refundEscalationGoodwillErrorCodes = [
  'GOODWILL_REASON_REQUIRED',
  'GOODWILL_TARGET_NOT_FOUND',
  'GOODWILL_ATTENDEE_MISSING',
  'GOODWILL_ALREADY_OPEN',
  'GOODWILL_INSERT_FAILED',
] as const;

export type RefundEscalationGoodwillErrorCode =
  (typeof refundEscalationGoodwillErrorCodes)[number];

export class RefundEscalationGoodwillError extends Error {
  public readonly code: RefundEscalationGoodwillErrorCode;

  constructor(code: RefundEscalationGoodwillErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type ReviewQueueSource = 'escalation' | 'goodwill';

type GoodwillEligibilitySnapshot = {
  version: 'refund-goodwill-initiation-v1';
  source: 'goodwill';
  initiatedAt: string;
  initiatedByUserId: string;
  trigger: 'authorized_manual_goodwill';
  refundsAllowedAtInitiation: boolean | null;
  refundPolicyTextAtInitiation: string | null;
  refundDeadlineAtInitiation: string | null;
};

type GoodwillFinancialSnapshot = {
  version: 'refund-goodwill-financial-v1';
  currency: 'MXN';
  totalPaidMinor: number;
  nonRefundableServiceFeeMinor: number;
  maxRefundableToAttendeeMinor: number;
  serviceFeePolicy: 'non_refundable_always';
};

export type EscalatedRefundBatch = {
  organizerId: string;
  actorUserId: string;
  requestedBefore: Date;
  escalatedAt: Date;
  escalatedCount: number;
  refundRequestIds: string[];
};

export type GoodwillRefundInitiation = {
  refundRequestId: string;
  registrationId: string;
  organizerId: string;
  attendeeUserId: string;
  status: 'escalated_admin_review';
  reasonCode: string;
  reasonNote: string;
  requestedByUserId: string;
  requestedAt: Date;
  escalatedAt: Date;
  eligibilitySnapshot: GoodwillEligibilitySnapshot;
  financialSnapshot: GoodwillFinancialSnapshot;
};

export type RefundAdminReviewQueueItem = {
  refundRequestId: string;
  registrationId: string;
  organizerId: string;
  attendeeUserId: string;
  requestedByUserId: string;
  status: 'escalated_admin_review';
  reasonCode: string;
  reasonNote: string | null;
  requestedAt: Date;
  escalatedAt: Date | null;
  queueSource: ReviewQueueSource;
};

function toNonNegativeMinor(value: number | null | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(Math.trunc(value), 0);
}

function normalizeGoodwillReason(reasonNote: string | null | undefined): string | null {
  if (typeof reasonNote !== 'string') return null;
  const trimmed = reasonNote.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toError(code: RefundEscalationGoodwillErrorCode): RefundEscalationGoodwillError {
  switch (code) {
    case 'GOODWILL_REASON_REQUIRED':
      return new RefundEscalationGoodwillError(
        code,
        'Goodwill initiation reason is required.',
      );
    case 'GOODWILL_TARGET_NOT_FOUND':
      return new RefundEscalationGoodwillError(
        code,
        'Registration context was not found for goodwill initiation.',
      );
    case 'GOODWILL_ATTENDEE_MISSING':
      return new RefundEscalationGoodwillError(
        code,
        'Goodwill initiation requires an attendee user linked to the registration.',
      );
    case 'GOODWILL_ALREADY_OPEN':
      return new RefundEscalationGoodwillError(
        code,
        'An open refund workflow already exists for this registration.',
      );
    case 'GOODWILL_INSERT_FAILED':
      return new RefundEscalationGoodwillError(
        code,
        'Goodwill refund request could not be created.',
      );
    default:
      return new RefundEscalationGoodwillError(
        code,
        'Unable to process refund escalation or goodwill request.',
      );
  }
}

export async function escalateExpiredRefundRequests(params: {
  organizerId: string;
  actorUserId: string;
  requestedBefore: Date;
  limit?: number;
  now?: Date;
}): Promise<EscalatedRefundBatch> {
  const now = params.now ?? new Date();
  const limit = Math.max(1, Math.min(params.limit ?? 100, 200));

  const pendingRequests = await db.query.refundRequests.findMany({
    where: and(
      eq(refundRequests.organizerId, params.organizerId),
      eq(refundRequests.status, 'pending_organizer_decision'),
      isNull(refundRequests.deletedAt),
      lte(refundRequests.requestedAt, params.requestedBefore),
    ),
    columns: {
      id: true,
    },
    orderBy: [asc(refundRequests.requestedAt)],
    limit,
  });

  if (pendingRequests.length === 0) {
    return {
      organizerId: params.organizerId,
      actorUserId: params.actorUserId,
      requestedBefore: params.requestedBefore,
      escalatedAt: now,
      escalatedCount: 0,
      refundRequestIds: [],
    };
  }

  const candidateIds = pendingRequests.map((request) => request.id);

  const updatedRows = await db
    .update(refundRequests)
    .set({
      status: REVIEW_QUEUE_STATUS,
      escalatedAt: now,
      decidedByUserId: params.actorUserId,
      decisionReason: REFUND_ESCALATION_DECISION_REASON,
    })
    .where(
      and(
        eq(refundRequests.organizerId, params.organizerId),
        eq(refundRequests.status, 'pending_organizer_decision'),
        isNull(refundRequests.deletedAt),
        inArray(refundRequests.id, candidateIds),
      ),
    )
    .returning({
      id: refundRequests.id,
    });

  return {
    organizerId: params.organizerId,
    actorUserId: params.actorUserId,
    requestedBefore: params.requestedBefore,
    escalatedAt: now,
    escalatedCount: updatedRows.length,
    refundRequestIds: updatedRows.map((row) => row.id),
  };
}

export async function initiateGoodwillRefundRequest(params: {
  organizerId: string;
  actorUserId: string;
  registrationId: string;
  reasonNote: string;
  now?: Date;
}): Promise<GoodwillRefundInitiation> {
  const now = params.now ?? new Date();
  const reasonNote = normalizeGoodwillReason(params.reasonNote);

  if (!reasonNote) {
    throw toError('GOODWILL_REASON_REQUIRED');
  }

  const registration = await db.query.registrations.findFirst({
    where: and(
      eq(registrations.id, params.registrationId),
      isNull(registrations.deletedAt),
    ),
    columns: {
      id: true,
      editionId: true,
      buyerUserId: true,
      basePriceCents: true,
      feesCents: true,
      taxCents: true,
      totalCents: true,
    },
  });

  if (!registration) {
    throw toError('GOODWILL_TARGET_NOT_FOUND');
  }

  if (!registration.buyerUserId) {
    throw toError('GOODWILL_ATTENDEE_MISSING');
  }

  const editionContext = await db.query.eventEditions.findFirst({
    where: and(
      eq(eventEditions.id, registration.editionId),
      isNull(eventEditions.deletedAt),
    ),
    columns: {
      id: true,
      timezone: true,
    },
    with: {
      series: {
        columns: {
          organizationId: true,
          deletedAt: true,
        },
      },
      policyConfig: {
        columns: {
          refundsAllowed: true,
          refundPolicyText: true,
          refundDeadline: true,
        },
      },
    },
  });

  if (
    !editionContext?.series ||
    editionContext.series.deletedAt ||
    editionContext.series.organizationId !== params.organizerId
  ) {
    throw toError('GOODWILL_TARGET_NOT_FOUND');
  }

  const existingOpenRequest = await db.query.refundRequests.findFirst({
    where: and(
      eq(refundRequests.registrationId, registration.id),
      eq(refundRequests.organizerId, params.organizerId),
      inArray(refundRequests.status, [
        'pending_organizer_decision',
        'escalated_admin_review',
      ]),
      isNull(refundRequests.deletedAt),
    ),
    columns: {
      id: true,
    },
  });

  if (existingOpenRequest) {
    throw toError('GOODWILL_ALREADY_OPEN');
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

  const eligibilitySnapshot: GoodwillEligibilitySnapshot = {
    version: 'refund-goodwill-initiation-v1',
    source: 'goodwill',
    initiatedAt: now.toISOString(),
    initiatedByUserId: params.actorUserId,
    trigger: 'authorized_manual_goodwill',
    refundsAllowedAtInitiation: editionContext.policyConfig?.refundsAllowed ?? null,
    refundPolicyTextAtInitiation: editionContext.policyConfig?.refundPolicyText ?? null,
    refundDeadlineAtInitiation:
      editionContext.policyConfig?.refundDeadline?.toISOString() ?? null,
  };

  const financialSnapshot: GoodwillFinancialSnapshot = {
    version: 'refund-goodwill-financial-v1',
    currency: 'MXN',
    totalPaidMinor,
    nonRefundableServiceFeeMinor: serviceFeeMinor,
    maxRefundableToAttendeeMinor: Math.max(totalPaidMinor - serviceFeeMinor, 0),
    serviceFeePolicy: 'non_refundable_always',
  };

  const [created] = await db
    .insert(refundRequests)
    .values({
      registrationId: registration.id,
      editionId: editionContext.id,
      organizerId: params.organizerId,
      attendeeUserId: registration.buyerUserId,
      requestedByUserId: params.actorUserId,
      status: REVIEW_QUEUE_STATUS,
      reasonCode: GOODWILL_REASON_CODE,
      reasonNote,
      eligibilitySnapshotJson: eligibilitySnapshot,
      financialSnapshotJson: financialSnapshot,
      requestedAt: now,
      escalatedAt: now,
      decidedByUserId: params.actorUserId,
      decisionReason: `Goodwill initiation: ${reasonNote}`,
    })
    .returning({
      refundRequestId: refundRequests.id,
      registrationId: refundRequests.registrationId,
      organizerId: refundRequests.organizerId,
      attendeeUserId: refundRequests.attendeeUserId,
      status: refundRequests.status,
      reasonCode: refundRequests.reasonCode,
      reasonNote: refundRequests.reasonNote,
      requestedByUserId: refundRequests.requestedByUserId,
      requestedAt: refundRequests.requestedAt,
      escalatedAt: refundRequests.escalatedAt,
    });

  if (!created || !created.reasonNote || !created.escalatedAt) {
    throw toError('GOODWILL_INSERT_FAILED');
  }

  return {
    refundRequestId: created.refundRequestId,
    registrationId: created.registrationId,
    organizerId: created.organizerId,
    attendeeUserId: created.attendeeUserId,
    status: created.status as 'escalated_admin_review',
    reasonCode: created.reasonCode,
    reasonNote: created.reasonNote,
    requestedByUserId: created.requestedByUserId,
    requestedAt: created.requestedAt,
    escalatedAt: created.escalatedAt,
    eligibilitySnapshot,
    financialSnapshot,
  };
}

export async function listRefundAdminReviewQueue(params: {
  organizerId: string;
  limit?: number;
}): Promise<RefundAdminReviewQueueItem[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 100, 200));

  const rows = await db.query.refundRequests.findMany({
    where: and(
      eq(refundRequests.organizerId, params.organizerId),
      eq(refundRequests.status, REVIEW_QUEUE_STATUS),
      isNull(refundRequests.deletedAt),
    ),
    columns: {
      id: true,
      registrationId: true,
      organizerId: true,
      attendeeUserId: true,
      requestedByUserId: true,
      status: true,
      reasonCode: true,
      reasonNote: true,
      requestedAt: true,
      escalatedAt: true,
      eligibilitySnapshotJson: true,
    },
    orderBy: [asc(refundRequests.requestedAt)],
    limit,
  });

  return rows.map((row) => {
    const snapshotSource =
      typeof row.eligibilitySnapshotJson?.source === 'string'
        ? row.eligibilitySnapshotJson.source
        : null;
    const queueSource: ReviewQueueSource =
      row.reasonCode === GOODWILL_REASON_CODE || snapshotSource === 'goodwill'
        ? 'goodwill'
        : 'escalation';

    return {
      refundRequestId: row.id,
      registrationId: row.registrationId,
      organizerId: row.organizerId,
      attendeeUserId: row.attendeeUserId,
      requestedByUserId: row.requestedByUserId,
      status: row.status as 'escalated_admin_review',
      reasonCode: row.reasonCode,
      reasonNote: row.reasonNote,
      requestedAt: row.requestedAt,
      escalatedAt: row.escalatedAt,
      queueSource,
    };
  });
}
