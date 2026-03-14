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
  createPayoutQuoteAndContract,
  PayoutQuoteContractError,
} from '@/lib/payments/payouts/quote-contract';

const createPayoutQuoteSchema = z.object({
  organizationId: z.string().uuid(),
  requestedAmountMinor: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(1).max(128),
  activeConflictPolicy: z.enum(['reject', 'queue']).optional(),
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

  const parseResult = createPayoutQuoteSchema.safeParse(payloadResult.payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'INVALID_PAYOUT_QUOTE_PAYLOAD',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, requestedAmountMinor, idempotencyKey, activeConflictPolicy } =
    parseResult.data;

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
  }

  try {
    const created = await createPayoutQuoteAndContract({
      organizerId: organizationId,
      requestedByUserId: authContext.user.id,
      requestedAmountMinor: requestedAmountMinor ?? null,
      idempotencyKey,
      activeConflictPolicy,
    });

    return withNoStore(
      NextResponse.json(
        {
          data: {
            payoutQuoteId: created.payoutQuoteId,
            payoutRequestId: created.payoutRequestId,
            payoutContractId: created.payoutContractId,
            organizerId: created.organizerId,
            quoteFingerprint: created.quoteFingerprint,
            currency: created.currency,
            includedAmountMinor: created.includedAmountMinor,
            deductionAmountMinor: created.deductionAmountMinor,
            maxWithdrawableAmountMinor: created.maxWithdrawableAmountMinor,
            requestedAmountMinor: created.requestedAmountMinor,
            traceId: created.traceId,
            idempotencyReused: created.idempotencyReused,
            ingressDeduplicated: created.ingressDeduplicated,
            requestedAt: created.requestedAt.toISOString(),
            eligibilitySnapshot: created.eligibilitySnapshot,
            componentBreakdown: created.componentBreakdown,
            contractBaseline: created.contractBaseline,
          },
        },
        {
          status: created.idempotencyReused ? 200 : 201,
        },
      ),
    );
  } catch (error) {
    if (error instanceof PayoutQuoteContractError) {
      if (
        error.code === 'PAYOUT_BASELINE_INCOMPLETE' ||
        error.code === 'PAYOUT_QUOTE_INSERT_FAILED' ||
        error.code === 'PAYOUT_REQUEST_INSERT_FAILED' ||
        error.code === 'PAYOUT_CONTRACT_INSERT_FAILED'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'PAYOUT_REQUEST_PERSIST_FAILED',
              code: error.code,
              reasonCode: error.code,
            },
            { status: 500 },
          ),
        );
      }

      if (
        error.code === 'PAYOUT_NOT_ELIGIBLE' ||
        error.code === 'PAYOUT_REQUEST_EXCEEDS_MAX_WITHDRAWABLE' ||
        error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED' ||
        error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'PAYOUT_REQUEST_CONFLICT',
              code: error.code,
              reasonCode: error.code,
              suggestedAction:
                error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED'
                  ? 'submit_queue_intent'
                  : undefined,
            },
            { status: 409 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'INVALID_PAYOUT_REQUEST',
            code: error.code,
            reasonCode: error.code,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-payouts] Failed to create payout quote and contract', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return paymentsServerErrorResponse();
  }
}
