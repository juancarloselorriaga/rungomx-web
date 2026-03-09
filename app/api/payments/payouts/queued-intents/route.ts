import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsJsonBody,
  paymentsServerErrorResponse,
  requireOrganizerWriteAccess,
  requireAuthenticatedPaymentsContext,
  withNoStore,
} from '@/app/api/payments/_shared';
import {
  createQueuedPayoutIntent,
  PayoutQueueIntentError,
} from '@/lib/payments/payouts/queue-intents';

const createQueuedIntentSchema = z.object({
  organizationId: z.string().uuid(),
  requestedAmountMinor: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(128),
});

export async function POST(request: Request): Promise<NextResponse> {
  const authResult = await requireAuthenticatedPaymentsContext();

  if (!authResult.ok) {
    return authResult.response;
  }

  const authContext = authResult.context;

  const payloadResult = await parsePaymentsJsonBody(request);
  if (!payloadResult.ok) {
    return payloadResult.response;
  }

  const parseResult = createQueuedIntentSchema.safeParse(payloadResult.payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid queued payout payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, requestedAmountMinor, idempotencyKey } = parseResult.data;

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
  }

  try {
    const queuedIntent = await createQueuedPayoutIntent({
      organizerId: organizationId,
      createdByUserId: authContext.user.id,
      requestedAmountMinor,
      idempotencyKey,
    });

    return withNoStore(
      NextResponse.json(
        {
          data: {
            payoutQueuedIntentId: queuedIntent.payoutQueuedIntentId,
            organizerId: queuedIntent.organizerId,
            status: queuedIntent.status,
            requestedAmountMinor: queuedIntent.requestedAmountMinor,
            currency: queuedIntent.currency,
            blockedReasonCode: queuedIntent.blockedReasonCode,
            criteriaFingerprint: queuedIntent.criteriaFingerprint,
            queueTraceId: queuedIntent.queueTraceId,
            createdAt: queuedIntent.createdAt.toISOString(),
            idempotencyReused: queuedIntent.idempotencyReused,
            ingressDeduplicated: queuedIntent.ingressDeduplicated,
            eligibilityCriteria: queuedIntent.eligibilityCriteria,
          },
        },
        {
          status: queuedIntent.idempotencyReused ? 200 : 201,
        },
      ),
    );
  } catch (error) {
    if (error instanceof PayoutQueueIntentError) {
      if (
        error.code === 'PAYOUT_QUEUE_ELIGIBLE_FOR_IMMEDIATE' ||
        error.code === 'PAYOUT_QUEUE_ALREADY_ACTIVE'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error:
                error.code === 'PAYOUT_QUEUE_ALREADY_ACTIVE'
                  ? 'Queued payout intent already exists for organizer'
                  : 'Queued payout intent is not required',
              code: error.code,
              reason: error.message,
            },
            { status: 409 },
          ),
        );
      }

      if (
        error.code === 'PAYOUT_QUEUE_INSERT_FAILED' ||
        error.code === 'PAYOUT_QUEUE_UPDATE_FAILED'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Queued payout intent could not be persisted',
              code: error.code,
              reason: error.message,
            },
            { status: 500 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'Invalid queued payout request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-payouts] Failed to create queued payout intent', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });

    return paymentsServerErrorResponse();
  }
}
