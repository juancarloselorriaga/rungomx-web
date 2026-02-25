import { z } from 'zod';

export const canonicalMoneyEventNames = [
  'payment.captured',
  'refund.executed',
  'dispute.opened',
  'dispute.funds_released',
  'dispute.debt_posted',
  'debt_control.pause_required',
  'debt_control.resume_allowed',
  'payout.queued',
  'payout.requested',
  'payout.processing',
  'payout.paused',
  'payout.resumed',
  'payout.completed',
  'payout.failed',
  'payout.adjusted',
  'subscription.renewal_failed',
  'financial.adjustment_posted',
] as const;

export type CanonicalMoneyEventName = (typeof canonicalMoneyEventNames)[number];

export const canonicalMoneyEventNameSchema = z.enum(canonicalMoneyEventNames);

export const canonicalMoneyEntityTypes = [
  'registration',
  'refund',
  'dispute',
  'debt_policy',
  'payout',
  'subscription',
  'adjustment',
] as const;

export type CanonicalMoneyEntityType = (typeof canonicalMoneyEntityTypes)[number];

export const canonicalMoneyEntityTypeSchema = z.enum(canonicalMoneyEntityTypes);

const canonicalMoneyAmountSchema = z.object({
  amountMinor: z.number().int(),
  currency: z.string().length(3),
});

export const canonicalMoneyEventEnvelopeV1Schema = z.object({
  eventId: z.string().uuid(),
  traceId: z.string().min(1).max(128),
  occurredAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }).optional(),
  eventName: canonicalMoneyEventNameSchema,
  version: z.literal(1),
  entityType: canonicalMoneyEntityTypeSchema,
  entityId: z.string().min(1).max(128),
  source: z.enum(['api', 'worker', 'scheduler', 'admin']),
  idempotencyKey: z.string().min(1).max(128).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

function defineCanonicalMoneyEventV1Schema<
  TEventName extends CanonicalMoneyEventName,
  TEntityType extends CanonicalMoneyEntityType,
  TPayload extends z.ZodTypeAny,
>(eventName: TEventName, entityType: TEntityType, payload: TPayload) {
  return canonicalMoneyEventEnvelopeV1Schema.extend({
    eventName: z.literal(eventName),
    entityType: z.literal(entityType),
    payload,
  });
}

export const paymentCapturedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  registrationId: z.string().uuid(),
  orderId: z.string().uuid().optional(),
  grossAmount: canonicalMoneyAmountSchema,
  feeAmount: canonicalMoneyAmountSchema,
  netAmount: canonicalMoneyAmountSchema,
});

export const refundExecutedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  refundRequestId: z.string().uuid(),
  registrationId: z.string().uuid(),
  refundAmount: canonicalMoneyAmountSchema,
  refundableBalanceAfter: canonicalMoneyAmountSchema,
  reasonCode: z.string().min(1),
});

export const disputeOpenedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  registrationId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  disputeCaseId: z.string().uuid(),
  amountAtRisk: canonicalMoneyAmountSchema,
  evidenceDeadlineAt: z.string().datetime({ offset: true }),
}).refine(
  (payload) => Boolean(payload.registrationId || payload.orderId),
  {
    message: 'Dispute scope requires registrationId or orderId.',
    path: ['registrationId'],
  },
);

export const disputeFundsReleasedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  disputeCaseId: z.string().uuid(),
  registrationId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  outcomeStatus: z.enum(['won', 'lost']),
  amountReleased: canonicalMoneyAmountSchema,
  freezeLadderProfile: z.string().min(1),
  freezeLadderStage: z.string().min(1),
});

export const disputeDebtPostedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  disputeCaseId: z.string().uuid(),
  registrationId: z.string().uuid().optional(),
  orderId: z.string().uuid().optional(),
  outcomeStatus: z.literal('lost'),
  debtAmount: canonicalMoneyAmountSchema,
  debtCode: z.string().min(1),
  settlementComposition: z.string().min(1),
  freezeLadderProfile: z.string().min(1),
  freezeLadderStage: z.string().min(1),
});

export const payoutRequestedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  requestedAmount: canonicalMoneyAmountSchema,
});

export const payoutQueuedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutQueuedIntentId: z.string().uuid(),
  requestedAmount: canonicalMoneyAmountSchema,
  blockedReasonCode: z.string().min(1),
});

export const payoutProcessingPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  currentRequestedAmount: canonicalMoneyAmountSchema,
});

export const payoutPausedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  currentRequestedAmount: canonicalMoneyAmountSchema,
  reasonCode: z.string().min(1),
});

export const payoutResumedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  currentRequestedAmount: canonicalMoneyAmountSchema,
  reasonCode: z.string().min(1),
});

export const payoutCompletedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  settledAmount: canonicalMoneyAmountSchema,
});

export const payoutFailedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  failedAmount: canonicalMoneyAmountSchema,
  reasonCode: z.string().min(1),
});

export const payoutAdjustedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  payoutRequestId: z.string().uuid(),
  payoutQuoteId: z.string().uuid(),
  previousRequestedAmount: canonicalMoneyAmountSchema,
  adjustedRequestedAmount: canonicalMoneyAmountSchema,
  reasonCode: z.string().min(1),
});

const debtThresholdTransitionPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  policyCode: z.string().min(1),
  reasonCode: z.string().min(1),
  guidanceCode: z.string().min(1),
  debtAmount: canonicalMoneyAmountSchema,
  pauseThresholdAmount: canonicalMoneyAmountSchema,
  resumeThresholdAmount: canonicalMoneyAmountSchema,
  affectedEditionIds: z.array(z.string().uuid()).default([]),
  affectedPaidEditionCount: z.number().int().min(0),
  totalPaidEditionCount: z.number().int().min(0),
});

export const debtControlPauseRequiredPayloadV1Schema = debtThresholdTransitionPayloadV1Schema;
export const debtControlResumeAllowedPayloadV1Schema = debtThresholdTransitionPayloadV1Schema;

export const subscriptionRenewalFailedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  renewalAttempt: z.number().int().min(1),
  graceEndsAt: z.string().datetime({ offset: true }),
  reasonCode: z.string().min(1),
});

export const financialAdjustmentPostedPayloadV1Schema = z.object({
  organizerId: z.string().uuid(),
  adjustmentId: z.string().uuid(),
  adjustmentCode: z.string().min(1),
  amount: canonicalMoneyAmountSchema,
  reason: z.string().min(1),
});

export const paymentCapturedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payment.captured',
  'registration',
  paymentCapturedPayloadV1Schema,
);

export const refundExecutedV1Schema = defineCanonicalMoneyEventV1Schema(
  'refund.executed',
  'refund',
  refundExecutedPayloadV1Schema,
);

export const disputeOpenedV1Schema = defineCanonicalMoneyEventV1Schema(
  'dispute.opened',
  'dispute',
  disputeOpenedPayloadV1Schema,
);

export const disputeFundsReleasedV1Schema = defineCanonicalMoneyEventV1Schema(
  'dispute.funds_released',
  'dispute',
  disputeFundsReleasedPayloadV1Schema,
);

export const disputeDebtPostedV1Schema = defineCanonicalMoneyEventV1Schema(
  'dispute.debt_posted',
  'dispute',
  disputeDebtPostedPayloadV1Schema,
);

export const payoutRequestedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.requested',
  'payout',
  payoutRequestedPayloadV1Schema,
);

export const payoutQueuedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.queued',
  'payout',
  payoutQueuedPayloadV1Schema,
);

export const payoutProcessingV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.processing',
  'payout',
  payoutProcessingPayloadV1Schema,
);

export const payoutPausedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.paused',
  'payout',
  payoutPausedPayloadV1Schema,
);

export const payoutResumedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.resumed',
  'payout',
  payoutResumedPayloadV1Schema,
);

export const payoutCompletedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.completed',
  'payout',
  payoutCompletedPayloadV1Schema,
);

export const payoutFailedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.failed',
  'payout',
  payoutFailedPayloadV1Schema,
);

export const payoutAdjustedV1Schema = defineCanonicalMoneyEventV1Schema(
  'payout.adjusted',
  'payout',
  payoutAdjustedPayloadV1Schema,
);

export const debtControlPauseRequiredV1Schema = defineCanonicalMoneyEventV1Schema(
  'debt_control.pause_required',
  'debt_policy',
  debtControlPauseRequiredPayloadV1Schema,
);

export const debtControlResumeAllowedV1Schema = defineCanonicalMoneyEventV1Schema(
  'debt_control.resume_allowed',
  'debt_policy',
  debtControlResumeAllowedPayloadV1Schema,
);

export const subscriptionRenewalFailedV1Schema = defineCanonicalMoneyEventV1Schema(
  'subscription.renewal_failed',
  'subscription',
  subscriptionRenewalFailedPayloadV1Schema,
);

export const financialAdjustmentPostedV1Schema = defineCanonicalMoneyEventV1Schema(
  'financial.adjustment_posted',
  'adjustment',
  financialAdjustmentPostedPayloadV1Schema,
);

export const canonicalMoneyEventSchemaByNameV1 = {
  'payment.captured': paymentCapturedV1Schema,
  'refund.executed': refundExecutedV1Schema,
  'dispute.opened': disputeOpenedV1Schema,
  'dispute.funds_released': disputeFundsReleasedV1Schema,
  'dispute.debt_posted': disputeDebtPostedV1Schema,
  'debt_control.pause_required': debtControlPauseRequiredV1Schema,
  'debt_control.resume_allowed': debtControlResumeAllowedV1Schema,
  'payout.queued': payoutQueuedV1Schema,
  'payout.requested': payoutRequestedV1Schema,
  'payout.processing': payoutProcessingV1Schema,
  'payout.paused': payoutPausedV1Schema,
  'payout.resumed': payoutResumedV1Schema,
  'payout.completed': payoutCompletedV1Schema,
  'payout.failed': payoutFailedV1Schema,
  'payout.adjusted': payoutAdjustedV1Schema,
  'subscription.renewal_failed': subscriptionRenewalFailedV1Schema,
  'financial.adjustment_posted': financialAdjustmentPostedV1Schema,
} as const satisfies Record<CanonicalMoneyEventName, z.ZodTypeAny>;

export const canonicalMoneyEventSchemaV1 = z.discriminatedUnion('eventName', [
  paymentCapturedV1Schema,
  refundExecutedV1Schema,
  disputeOpenedV1Schema,
  disputeFundsReleasedV1Schema,
  disputeDebtPostedV1Schema,
  debtControlPauseRequiredV1Schema,
  debtControlResumeAllowedV1Schema,
  payoutQueuedV1Schema,
  payoutRequestedV1Schema,
  payoutProcessingV1Schema,
  payoutPausedV1Schema,
  payoutResumedV1Schema,
  payoutCompletedV1Schema,
  payoutFailedV1Schema,
  payoutAdjustedV1Schema,
  subscriptionRenewalFailedV1Schema,
  financialAdjustmentPostedV1Schema,
]);

export type CanonicalMoneyEventV1 = z.infer<typeof canonicalMoneyEventSchemaV1>;
