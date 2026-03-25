import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsJsonBody,
  requireAuthenticatedPaymentsContext,
  requireOrganizerWriteAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import { escalateExpiredRefundRequests } from '@/lib/payments/refunds/escalation-and-goodwill';

const escalationSchema = z.object({
  organizationId: z.string().uuid(),
  requestedBefore: z.string().datetime(),
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

  const parseResult = escalationSchema.safeParse(payloadResult.payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid refund escalation payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, requestedBefore, limit } = parseResult.data;

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
  }

  try {
    const result = await escalateExpiredRefundRequests({
      organizerId: organizationId,
      actorUserId: authContext.user.id,
      requestedBefore: new Date(requestedBefore),
      limit,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          organizerId: result.organizerId,
          actorUserId: result.actorUserId,
          requestedBefore: result.requestedBefore.toISOString(),
          escalatedAt: result.escalatedAt.toISOString(),
          escalatedCount: result.escalatedCount,
          refundRequestIds: result.refundRequestIds,
        },
      }),
    );
  } catch (error) {
    console.error('[payments-refunds] Failed to escalate expired refund requests', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
