import { randomUUID } from 'node:crypto';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import {
  moneyEvents,
  organizationMemberships,
  refundRequests,
  users,
} from '@/db/schema';
import { sendEmail } from '@/lib/email';
import { type CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import {
  ingestMoneyMutationFromApi,
  ingestMoneyMutationFromWorker,
} from '@/lib/payments/core/mutation-ingress-paths';
import {
  assertFinancialProcessorRuntime,
  type FinancialProcessorRuntime,
} from '@/lib/payments/core/replay';

const GOODWILL_REASON_CODE = 'goodwill_manual';
const REFUND_EXECUTION_TRACE_PREFIX = 'refund-execution:';
const REFUND_POLICY_WORDING_VERSION = 'refund-execution-policy-v1';
const REFUND_POLICY_WORDING =
  'Refund execution is limited by remaining refundable capacity, and service fees are non-refundable.';
const REFUND_NOTIFICATION_CHANNELS = ['in_app', 'email'] as const;
const ORGANIZER_NOTIFICATION_ROLES = ['owner', 'admin', 'editor'] as const;

export const refundExecutionModes = ['in_process', 'queued_worker'] as const;

export type RefundExecutionMode = (typeof refundExecutionModes)[number];

export const refundExecutionErrorCodes = [
  'INVALID_REQUESTED_AMOUNT',
  'INVALID_MAX_REFUNDABLE_PER_RUN',
  'REFUND_REQUEST_NOT_FOUND',
  'REFUND_REQUEST_NOT_EXECUTABLE',
  'REFUND_REQUEST_ALREADY_EXECUTED',
  'REFUND_MAX_REFUNDABLE_EXCEEDED',
  'REFUND_EXECUTION_MODE_BLOCKED',
  'REFUND_RUNTIME_BLOCKED',
  'REFUND_EXECUTION_UPDATE_FAILED',
  'ATTENDEE_NOTIFICATION_TARGET_MISSING',
  'ORGANIZER_NOTIFICATION_TARGET_MISSING',
] as const;

export type RefundExecutionErrorCode = (typeof refundExecutionErrorCodes)[number];

export class RefundExecutionError extends Error {
  public readonly code: RefundExecutionErrorCode;

  constructor(code: RefundExecutionErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

type RefundRecipient = {
  userId: string;
  email: string;
  name: string | null;
};

type RefundAudienceNotification = {
  userIds: string[];
  message: string;
  traceId: string;
  inAppStatus: 'persisted';
  emailStatus: 'sent' | 'failed' | 'skipped';
};

export type RefundExecutionNotifications = {
  channels: ReadonlyArray<(typeof REFUND_NOTIFICATION_CHANNELS)[number]>;
  policyWordingVersion: typeof REFUND_POLICY_WORDING_VERSION;
  policyWording: string;
  attendee: RefundAudienceNotification;
  organizer: RefundAudienceNotification;
};

export type ExecutedRefundResult = {
  refundRequestId: string;
  registrationId: string;
  organizerId: string;
  attendeeUserId: string;
  status: 'executed';
  reasonCode: string;
  requestedAmountMinor: number;
  maxRefundableToAttendeeMinorPerRun: number;
  effectiveMaxRefundableMinor: number;
  alreadyRefundedMinor: number;
  remainingRefundableBeforeMinor: number;
  remainingRefundableAfterMinor: number;
  executedAt: Date;
  executedByUserId: string;
  traceId: string;
  ingressDeduplicated: boolean;
  runtime: FinancialProcessorRuntime;
  executionMode: RefundExecutionMode;
  notifications: RefundExecutionNotifications;
};

function toError(code: RefundExecutionErrorCode, context?: { detail?: string }): RefundExecutionError {
  switch (code) {
    case 'INVALID_REQUESTED_AMOUNT':
      return new RefundExecutionError(
        code,
        'Requested refund amount must be a positive integer amount in minor units.',
      );
    case 'INVALID_MAX_REFUNDABLE_PER_RUN':
      return new RefundExecutionError(
        code,
        'Maximum refundable amount per run must be a non-negative integer amount in minor units.',
      );
    case 'REFUND_REQUEST_NOT_FOUND':
      return new RefundExecutionError(code, 'Refund request was not found.');
    case 'REFUND_REQUEST_NOT_EXECUTABLE':
      return new RefundExecutionError(
        code,
        `Refund request is not executable from current status ${context?.detail ?? 'unknown'}.`,
      );
    case 'REFUND_REQUEST_ALREADY_EXECUTED':
      return new RefundExecutionError(code, 'Refund request is already executed.');
    case 'REFUND_MAX_REFUNDABLE_EXCEEDED':
      return new RefundExecutionError(
        code,
        `Requested refund exceeds remaining refundable capacity (${context?.detail ?? '0'}).`,
      );
    case 'REFUND_EXECUTION_MODE_BLOCKED':
      return new RefundExecutionError(
        code,
        'in_process refund execution is blocked in production.',
      );
    case 'REFUND_RUNTIME_BLOCKED':
      return new RefundExecutionError(
        code,
        context?.detail ??
          'Refund execution processor must run on dedicated worker runtime in production.',
      );
    case 'REFUND_EXECUTION_UPDATE_FAILED':
      return new RefundExecutionError(
        code,
        'Refund execution status could not be persisted.',
      );
    case 'ATTENDEE_NOTIFICATION_TARGET_MISSING':
      return new RefundExecutionError(
        code,
        'Attendee notification target is missing for this refund request.',
      );
    case 'ORGANIZER_NOTIFICATION_TARGET_MISSING':
      return new RefundExecutionError(
        code,
        'Organizer notification target is missing for this refund request.',
      );
    default:
      return new RefundExecutionError(code, 'Refund execution failed.');
  }
}

function normalizeMinor(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  return value;
}

function toNonNegativeMinor(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.max(Math.trunc(value), 0);
}

function toRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function isGoodwillRequest(input: {
  reasonCode: string;
  eligibilitySnapshotJson: Record<string, unknown>;
}): boolean {
  if (input.reasonCode === GOODWILL_REASON_CODE) return true;

  const source = input.eligibilitySnapshotJson.source;
  return source === 'goodwill';
}

function assertExecutionModeAllowed(nodeEnv: string, mode: RefundExecutionMode): void {
  if (mode === 'in_process' && nodeEnv === 'production') {
    throw toError('REFUND_EXECUTION_MODE_BLOCKED');
  }
}

function formatMinorAsMxn(minor: number): string {
  return `MXN ${(minor / 100).toFixed(2)}`;
}

function buildAudienceMessages(params: {
  requestedAmountMinor: number;
  remainingAfterMinor: number;
  registrationId: string;
  traceId: string;
}) {
  const amountLabel = formatMinorAsMxn(params.requestedAmountMinor);
  const remainingLabel = formatMinorAsMxn(params.remainingAfterMinor);
  const traceLine = `Trace reference: ${params.traceId}.`;
  const policyLine = `Policy: ${REFUND_POLICY_WORDING}`;

  return {
    attendee: `Your refund of ${amountLabel} was executed. Remaining refundable capacity: ${remainingLabel}. ${policyLine} ${traceLine}`,
    organizer: `Refund for registration ${params.registrationId} executed for ${amountLabel}. Remaining refundable capacity: ${remainingLabel}. ${policyLine} ${traceLine}`,
  };
}

async function resolveAttendeeRecipient(attendeeUserId: string): Promise<RefundRecipient> {
  const attendee = await db.query.users.findFirst({
    where: and(eq(users.id, attendeeUserId), isNull(users.deletedAt)),
    columns: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (!attendee) {
    throw toError('ATTENDEE_NOTIFICATION_TARGET_MISSING');
  }

  return {
    userId: attendee.id,
    email: attendee.email,
    name: attendee.name,
  };
}

async function resolveOrganizerRecipients(params: {
  organizerId: string;
  fallbackUserId: string | null;
  attendeeUserId: string;
}): Promise<RefundRecipient[]> {
  const memberships = await db.query.organizationMemberships.findMany({
    where: and(
      eq(organizationMemberships.organizationId, params.organizerId),
      inArray(organizationMemberships.role, ORGANIZER_NOTIFICATION_ROLES),
      isNull(organizationMemberships.deletedAt),
    ),
    columns: {
      userId: true,
    },
  });

  const membershipUserIds = [...new Set(memberships.map((membership) => membership.userId))];
  const fallbackUserIds =
    membershipUserIds.length > 0 || !params.fallbackUserId
      ? []
      : [params.fallbackUserId];
  const candidateUserIds = [...new Set([...membershipUserIds, ...fallbackUserIds])].filter(
    (userId) => userId !== params.attendeeUserId,
  );

  if (candidateUserIds.length === 0) {
    throw toError('ORGANIZER_NOTIFICATION_TARGET_MISSING');
  }

  const recipients = await db.query.users.findMany({
    where: and(inArray(users.id, candidateUserIds), isNull(users.deletedAt)),
    columns: {
      id: true,
      email: true,
      name: true,
    },
  });

  if (recipients.length === 0) {
    throw toError('ORGANIZER_NOTIFICATION_TARGET_MISSING');
  }

  return recipients.map((recipient) => ({
    userId: recipient.id,
    email: recipient.email,
    name: recipient.name,
  }));
}

type EmailDeliveryStatus = RefundAudienceNotification['emailStatus'];

async function sendAudienceEmail(params: {
  recipients: RefundRecipient[];
  subject: string;
  message: string;
}): Promise<EmailDeliveryStatus> {
  if (params.recipients.length === 0) {
    return 'skipped';
  }

  const textContent = params.message;
  const htmlContent = `<p>${params.message.replaceAll('\n', '<br />')}</p>`;

  try {
    await sendEmail({
      to: params.recipients.map((recipient) => ({
        email: recipient.email,
        name: recipient.name?.trim() || undefined,
      })),
      subject: params.subject,
      htmlContent,
      textContent,
    });
    return 'sent';
  } catch (error) {
    console.error('[payments-refunds] Email notification delivery failed', {
      recipientUserIds: params.recipients.map((recipient) => recipient.userId),
      error,
    });
    return 'failed';
  }
}

export async function executeRefundRequest(params: {
  refundRequestId: string;
  organizerId: string;
  executedByUserId: string;
  requestedAmountMinor: number;
  maxRefundableToAttendeeMinorPerRun: number;
  runtime: FinancialProcessorRuntime;
  executionMode: RefundExecutionMode;
  now?: Date;
  nodeEnv?: string;
}): Promise<ExecutedRefundResult> {
  const now = params.now ?? new Date();
  const nodeEnv = params.nodeEnv ?? process.env.NODE_ENV ?? 'development';
  const requestedAmountMinor = normalizeMinor(params.requestedAmountMinor);
  const maxRefundableToAttendeeMinorPerRun = normalizeMinor(
    params.maxRefundableToAttendeeMinorPerRun,
  );

  if (requestedAmountMinor == null || requestedAmountMinor <= 0) {
    throw toError('INVALID_REQUESTED_AMOUNT');
  }

  if (maxRefundableToAttendeeMinorPerRun == null || maxRefundableToAttendeeMinorPerRun < 0) {
    throw toError('INVALID_MAX_REFUNDABLE_PER_RUN');
  }

  assertExecutionModeAllowed(nodeEnv, params.executionMode);

  try {
    assertFinancialProcessorRuntime({
      nodeEnv,
      runtime: params.runtime,
      processorName: 'refund_execution_processor',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    throw toError('REFUND_RUNTIME_BLOCKED', { detail });
  }

  const refundRequest = await db.query.refundRequests.findFirst({
    where: and(
      eq(refundRequests.id, params.refundRequestId),
      eq(refundRequests.organizerId, params.organizerId),
      isNull(refundRequests.deletedAt),
    ),
    columns: {
      id: true,
      registrationId: true,
      organizerId: true,
      attendeeUserId: true,
      status: true,
      reasonCode: true,
      eligibilitySnapshotJson: true,
      financialSnapshotJson: true,
      decidedByUserId: true,
    },
  });

  if (!refundRequest) {
    throw toError('REFUND_REQUEST_NOT_FOUND');
  }

  const eligibilitySnapshotJson = toRecord(refundRequest.eligibilitySnapshotJson);
  const isGoodwill = isGoodwillRequest({
    reasonCode: refundRequest.reasonCode,
    eligibilitySnapshotJson,
  });

  const isApproved = refundRequest.status === 'approved';
  const isGoodwillQueued =
    refundRequest.status === 'escalated_admin_review' && isGoodwill;

  if (refundRequest.status === 'executed') {
    throw toError('REFUND_REQUEST_ALREADY_EXECUTED');
  }

  if (!isApproved && !isGoodwillQueued) {
    throw toError('REFUND_REQUEST_NOT_EXECUTABLE', { detail: refundRequest.status });
  }

  const financialSnapshotJson = toRecord(refundRequest.financialSnapshotJson);
  const requestSnapshotMax = normalizeMinor(financialSnapshotJson.maxRefundableToAttendeeMinor);
  const effectiveMaxRefundableMinor =
    requestSnapshotMax == null
      ? maxRefundableToAttendeeMinorPerRun
      : Math.min(maxRefundableToAttendeeMinorPerRun, requestSnapshotMax);

  const priorRefundEvents = await db.query.moneyEvents.findMany({
    where: and(
      eq(moneyEvents.organizerId, refundRequest.organizerId),
      eq(moneyEvents.eventName, 'refund.executed'),
    ),
    columns: {
      payloadJson: true,
    },
  });

  const alreadyRefundedMinor = priorRefundEvents.reduce((total, event) => {
    const payload = toRecord(event.payloadJson);
    if (payload.registrationId !== refundRequest.registrationId) return total;
    const refundAmount = toRecord(payload.refundAmount);
    const amountMinor = toNonNegativeMinor(refundAmount.amountMinor);
    return total + amountMinor;
  }, 0);

  const remainingRefundableBeforeMinor = Math.max(
    effectiveMaxRefundableMinor - alreadyRefundedMinor,
    0,
  );

  if (requestedAmountMinor > remainingRefundableBeforeMinor) {
    throw toError('REFUND_MAX_REFUNDABLE_EXCEEDED', {
      detail: String(remainingRefundableBeforeMinor),
    });
  }

  const remainingRefundableAfterMinor = remainingRefundableBeforeMinor - requestedAmountMinor;
  const traceId = `${REFUND_EXECUTION_TRACE_PREFIX}${refundRequest.id}`;
  const source = params.runtime === 'worker' ? 'worker' : 'api';

  const attendeeRecipient = await resolveAttendeeRecipient(refundRequest.attendeeUserId);
  const organizerRecipients = await resolveOrganizerRecipients({
    organizerId: refundRequest.organizerId,
    fallbackUserId: refundRequest.decidedByUserId ?? params.executedByUserId,
    attendeeUserId: refundRequest.attendeeUserId,
  });

  const messages = buildAudienceMessages({
    requestedAmountMinor,
    remainingAfterMinor: remainingRefundableAfterMinor,
    registrationId: refundRequest.registrationId,
    traceId,
  });

  const executionEvent: CanonicalMoneyEventV1 = {
    eventId: randomUUID(),
    traceId,
    occurredAt: now.toISOString(),
    eventName: 'refund.executed',
    version: 1,
    entityType: 'refund',
    entityId: refundRequest.id,
    source,
    idempotencyKey: traceId,
    metadata: {
      executionMode: params.executionMode,
      executionRuntime: params.runtime,
      policyWordingVersion: REFUND_POLICY_WORDING_VERSION,
    },
    payload: {
      organizerId: refundRequest.organizerId,
      refundRequestId: refundRequest.id,
      registrationId: refundRequest.registrationId,
      refundAmount: {
        amountMinor: requestedAmountMinor,
        currency: 'MXN',
      },
      refundableBalanceAfter: {
        amountMinor: remainingRefundableAfterMinor,
        currency: 'MXN',
      },
      reasonCode: refundRequest.reasonCode || (isGoodwill ? GOODWILL_REASON_CODE : 'approved'),
    },
  };

  const ingressInput = {
    traceId,
    organizerId: refundRequest.organizerId,
    idempotencyKey: traceId,
    events: [executionEvent],
  };

  const ingressResult =
    params.runtime === 'worker'
      ? await ingestMoneyMutationFromWorker(ingressInput)
      : await ingestMoneyMutationFromApi(ingressInput);

  const executionSnapshot = {
    version: 'refund-execution-v1',
    traceId,
    executedAt: now.toISOString(),
    executedByUserId: params.executedByUserId,
    requestedAmountMinor,
    maxRefundableToAttendeeMinorPerRun,
    effectiveMaxRefundableMinor,
    alreadyRefundedMinor,
    remainingRefundableBeforeMinor,
    remainingRefundableAfterMinor,
    runtime: params.runtime,
    executionMode: params.executionMode,
    notificationChannels: [...REFUND_NOTIFICATION_CHANNELS],
    notificationAudience: {
      attendeeUserId: attendeeRecipient.userId,
      organizerUserIds: organizerRecipients.map((recipient) => recipient.userId),
    },
    notificationMessages: {
      attendee: messages.attendee,
      organizer: messages.organizer,
      traceId,
    },
    policyWordingVersion: REFUND_POLICY_WORDING_VERSION,
    policyWording: REFUND_POLICY_WORDING,
  };

  const nextFinancialSnapshotJson = {
    ...financialSnapshotJson,
    execution: executionSnapshot,
  };

  const [updatedRequest] = await db
    .update(refundRequests)
    .set({
      status: 'executed',
      executedAt: now,
      financialSnapshotJson: nextFinancialSnapshotJson,
    })
    .where(
      and(
        eq(refundRequests.id, refundRequest.id),
        eq(refundRequests.organizerId, refundRequest.organizerId),
        inArray(refundRequests.status, ['approved', 'escalated_admin_review']),
        isNull(refundRequests.deletedAt),
      ),
    )
    .returning({
      id: refundRequests.id,
      registrationId: refundRequests.registrationId,
      organizerId: refundRequests.organizerId,
      attendeeUserId: refundRequests.attendeeUserId,
      status: refundRequests.status,
      reasonCode: refundRequests.reasonCode,
      executedAt: refundRequests.executedAt,
    });

  if (!updatedRequest?.executedAt) {
    const latestRequest = await db.query.refundRequests.findFirst({
      where: and(
        eq(refundRequests.id, refundRequest.id),
        eq(refundRequests.organizerId, refundRequest.organizerId),
        isNull(refundRequests.deletedAt),
      ),
      columns: {
        status: true,
      },
    });

    if (latestRequest?.status === 'executed') {
      throw toError('REFUND_REQUEST_ALREADY_EXECUTED');
    }

    throw toError('REFUND_EXECUTION_UPDATE_FAILED');
  }

  const attendeeEmailStatus = await sendAudienceEmail({
    recipients: [attendeeRecipient],
    subject: 'Your refund has been processed',
    message: messages.attendee,
  });

  const organizerEmailStatus = await sendAudienceEmail({
    recipients: organizerRecipients,
    subject: 'Refund execution completed',
    message: messages.organizer,
  });

  const notifications: RefundExecutionNotifications = {
    channels: [...REFUND_NOTIFICATION_CHANNELS],
    policyWordingVersion: REFUND_POLICY_WORDING_VERSION,
    policyWording: REFUND_POLICY_WORDING,
    attendee: {
      userIds: [attendeeRecipient.userId],
      message: messages.attendee,
      traceId,
      inAppStatus: 'persisted',
      emailStatus: attendeeEmailStatus,
    },
    organizer: {
      userIds: organizerRecipients.map((recipient) => recipient.userId),
      message: messages.organizer,
      traceId,
      inAppStatus: 'persisted',
      emailStatus: organizerEmailStatus,
    },
  };

  return {
    refundRequestId: updatedRequest.id,
    registrationId: updatedRequest.registrationId,
    organizerId: updatedRequest.organizerId,
    attendeeUserId: updatedRequest.attendeeUserId,
    status: 'executed',
    reasonCode: updatedRequest.reasonCode,
    requestedAmountMinor,
    maxRefundableToAttendeeMinorPerRun,
    effectiveMaxRefundableMinor,
    alreadyRefundedMinor,
    remainingRefundableBeforeMinor,
    remainingRefundableAfterMinor,
    executedAt: updatedRequest.executedAt,
    executedByUserId: params.executedByUserId,
    traceId,
    ingressDeduplicated: ingressResult.deduplicated,
    runtime: params.runtime,
    executionMode: params.executionMode,
    notifications,
  };
}
