import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsJsonBody,
  requireAuthenticatedPaymentsContext,
  requireInternalStaffAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import { sweepQueuedPayoutIntentActivations } from '@/lib/payments/payouts/queue-intents';

const sweepActivationsSchema = z.object({
  organizationId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
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

  const parseResult = sweepActivationsSchema.safeParse(payloadResult.payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid queued payout activation sweep payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, limit } = parseResult.data;

  const accessResult = await requireInternalStaffAccess(authContext);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  // organizationId is optional: when provided, scope the sweep to that
  // organizer (and validate it exists/is active first); when omitted, run a
  // global sweep across all queued intents.
  if (organizationId) {
    const organizationResult = await findActivePaymentsOrganization(organizationId);
    if (!organizationResult.ok) {
      return organizationResult.response;
    }
  }

  try {
    const result = await sweepQueuedPayoutIntentActivations({
      activatedByUserId: authContext.user.id,
      organizerId: organizationId,
      limit,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          organizerId: organizationId ?? null,
          scannedCount: result.scannedCount,
          activatedCount: result.activatedCount,
          results: result.results,
        },
      }),
    );
  } catch (error) {
    console.error('[payments-payouts] Failed to sweep queued payout intent activations', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
