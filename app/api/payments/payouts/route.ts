import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import {
  createPayoutQuoteAndContract,
  PayoutQuoteContractError,
} from '@/lib/payments/payouts/quote-contract';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withNoStore(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const parseResult = createPayoutQuoteSchema.safeParse(payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid payout quote payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, requestedAmountMinor, idempotencyKey, activeConflictPolicy } =
    parseResult.data;

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    try {
      requireOrgPermission(membership, 'canEditRegistrationSettings');
    } catch {
      return withNoStore(NextResponse.json({ error: 'Permission denied' }, { status: 403 }));
    }
  }

  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
    columns: { id: true },
  });

  if (!organization) {
    return withNoStore(NextResponse.json({ error: 'Organization not found' }, { status: 404 }));
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
              error: 'Payout quote could not be persisted',
              code: error.code,
              reason: error.message,
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
              error:
                error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED'
                  ? 'Payout request conflicts with active lifecycle and should be queued'
                  : error.code === 'PAYOUT_REQUEST_ACTIVE_CONFLICT_REJECTED'
                    ? 'Payout request conflicts with active payout lifecycle'
                    : 'Payout quote request is not eligible',
              code: error.code,
              reason: error.message,
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
            error: 'Invalid payout quote request',
            code: error.code,
            reason: error.message,
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
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
