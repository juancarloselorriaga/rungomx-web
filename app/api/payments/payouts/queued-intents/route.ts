import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import {
  createQueuedPayoutIntent,
  PayoutQueueIntentError,
} from '@/lib/payments/payouts/queue-intents';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const createQueuedIntentSchema = z.object({
  organizationId: z.string().uuid(),
  requestedAmountMinor: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(128),
});

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withNoStore(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const parseResult = createQueuedIntentSchema.safeParse(payload);
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

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
