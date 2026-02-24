import { and, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { refundRequests } from '@/db/schema';

export const organizerRefundDecisionValues = ['approve', 'deny'] as const;

export type OrganizerRefundDecision = (typeof organizerRefundDecisionValues)[number];

const refundDecisionStatusByAction: Record<OrganizerRefundDecision, 'approved' | 'denied'> = {
  approve: 'approved',
  deny: 'denied',
};

export const refundDecisionErrorCodes = [
  'REFUND_DECISION_REASON_REQUIRED',
  'REFUND_DECISION_REASON_TOO_LONG',
  'REFUND_REQUEST_NOT_FOUND',
  'REFUND_REQUEST_NOT_PENDING',
] as const;

export type RefundDecisionErrorCode = (typeof refundDecisionErrorCodes)[number];

export class RefundDecisionSubmissionError extends Error {
  public readonly code: RefundDecisionErrorCode;

  constructor(code: RefundDecisionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const REFUND_DECISION_REASON_MAX_LENGTH = 2000;

function normalizeDecisionReason(reason: string | null | undefined): string | null {
  if (typeof reason !== 'string') return null;
  const trimmed = reason.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDecisionError(
  code: RefundDecisionErrorCode,
  currentStatus?: string,
): RefundDecisionSubmissionError {
  switch (code) {
    case 'REFUND_DECISION_REASON_REQUIRED':
      return new RefundDecisionSubmissionError(
        code,
        'Decision rationale is required for organizer refund decisions.',
      );
    case 'REFUND_DECISION_REASON_TOO_LONG':
      return new RefundDecisionSubmissionError(
        code,
        `Decision rationale must be ${REFUND_DECISION_REASON_MAX_LENGTH} characters or fewer.`,
      );
    case 'REFUND_REQUEST_NOT_FOUND':
      return new RefundDecisionSubmissionError(code, 'Refund request was not found.');
    case 'REFUND_REQUEST_NOT_PENDING':
      return new RefundDecisionSubmissionError(
        code,
        `Refund request cannot be decided because it is already ${currentStatus ?? 'processed'}.`,
      );
    default:
      return new RefundDecisionSubmissionError(code, 'Unable to submit refund decision.');
  }
}

export type SubmittedOrganizerRefundDecision = {
  refundRequestId: string;
  registrationId: string;
  organizerId: string;
  attendeeUserId: string;
  decision: OrganizerRefundDecision;
  status: 'approved' | 'denied';
  decisionReason: string;
  decisionAt: Date;
  decidedByUserId: string;
  requestedAt: Date;
};

export async function submitOrganizerRefundDecision(params: {
  refundRequestId: string;
  organizerId: string;
  decidedByUserId: string;
  decision: OrganizerRefundDecision;
  decisionReason: string;
  now?: Date;
}): Promise<SubmittedOrganizerRefundDecision> {
  const now = params.now ?? new Date();
  const decisionReason = normalizeDecisionReason(params.decisionReason);

  if (!decisionReason) {
    throw toDecisionError('REFUND_DECISION_REASON_REQUIRED');
  }
  if (decisionReason.length > REFUND_DECISION_REASON_MAX_LENGTH) {
    throw toDecisionError('REFUND_DECISION_REASON_TOO_LONG');
  }

  const nextStatus = refundDecisionStatusByAction[params.decision];

  const [updatedDecision] = await db
    .update(refundRequests)
    .set({
      status: nextStatus,
      decisionAt: now,
      decidedByUserId: params.decidedByUserId,
      decisionReason,
    })
    .where(
      and(
        eq(refundRequests.id, params.refundRequestId),
        eq(refundRequests.organizerId, params.organizerId),
        eq(refundRequests.status, 'pending_organizer_decision'),
        isNull(refundRequests.deletedAt),
      ),
    )
    .returning({
      refundRequestId: refundRequests.id,
      registrationId: refundRequests.registrationId,
      organizerId: refundRequests.organizerId,
      attendeeUserId: refundRequests.attendeeUserId,
      status: refundRequests.status,
      decisionReason: refundRequests.decisionReason,
      decisionAt: refundRequests.decisionAt,
      decidedByUserId: refundRequests.decidedByUserId,
      requestedAt: refundRequests.requestedAt,
    });

  if (updatedDecision?.decisionAt && updatedDecision.decidedByUserId && updatedDecision.decisionReason) {
    return {
      refundRequestId: updatedDecision.refundRequestId,
      registrationId: updatedDecision.registrationId,
      organizerId: updatedDecision.organizerId,
      attendeeUserId: updatedDecision.attendeeUserId,
      decision: params.decision,
      status: updatedDecision.status as 'approved' | 'denied',
      decisionReason: updatedDecision.decisionReason,
      decisionAt: updatedDecision.decisionAt,
      decidedByUserId: updatedDecision.decidedByUserId,
      requestedAt: updatedDecision.requestedAt,
    };
  }

  const existingRequest = await db.query.refundRequests.findFirst({
    where: and(
      eq(refundRequests.id, params.refundRequestId),
      eq(refundRequests.organizerId, params.organizerId),
      isNull(refundRequests.deletedAt),
    ),
    columns: {
      status: true,
    },
  });

  if (!existingRequest) {
    throw toDecisionError('REFUND_REQUEST_NOT_FOUND');
  }

  throw toDecisionError('REFUND_REQUEST_NOT_PENDING', existingRequest.status);
}
