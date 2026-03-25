import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsJsonBody,
  requireAuthenticatedPaymentsContext,
  requireOrganizerWriteAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import {
  initiateGoodwillRefundRequest,
  RefundEscalationGoodwillError,
} from '@/lib/payments/refunds/escalation-and-goodwill';

const goodwillSchema = z.object({
  organizationId: z.string().uuid(),
  registrationId: z.string().uuid(),
  reasonNote: z.string().trim().min(1).max(2000),
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

  const parseResult = goodwillSchema.safeParse(payloadResult.payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid goodwill initiation payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, registrationId, reasonNote } = parseResult.data;

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
  }

  try {
    const created = await initiateGoodwillRefundRequest({
      organizerId: organizationId,
      actorUserId: authContext.user.id,
      registrationId,
      reasonNote,
    });

    return withNoStore(
      NextResponse.json(
        {
          data: {
            refundRequestId: created.refundRequestId,
            registrationId: created.registrationId,
            organizerId: created.organizerId,
            attendeeUserId: created.attendeeUserId,
            status: created.status,
            reasonCode: created.reasonCode,
            reasonNote: created.reasonNote,
            requestedByUserId: created.requestedByUserId,
            requestedAt: created.requestedAt.toISOString(),
            escalatedAt: created.escalatedAt.toISOString(),
            eligibilitySnapshot: created.eligibilitySnapshot,
            financialSnapshot: created.financialSnapshot,
          },
        },
        { status: 201 },
      ),
    );
  } catch (error) {
    if (error instanceof RefundEscalationGoodwillError) {
      if (error.code === 'GOODWILL_TARGET_NOT_FOUND') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Goodwill target not found',
              code: error.code,
            },
            { status: 404 },
          ),
        );
      }

      if (error.code === 'GOODWILL_ALREADY_OPEN' || error.code === 'GOODWILL_ATTENDEE_MISSING') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Goodwill request cannot be created',
              code: error.code,
              reason: error.message,
            },
            { status: 409 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'Invalid goodwill request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-refunds] Failed to initiate goodwill refund request', {
      organizationId,
      registrationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
