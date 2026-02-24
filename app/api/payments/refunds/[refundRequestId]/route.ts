import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import {
  organizerRefundDecisionValues,
  RefundDecisionSubmissionError,
  submitOrganizerRefundDecision,
} from '@/lib/payments/refunds/decision-submission';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const paramsSchema = z.object({
  refundRequestId: z.string().uuid(),
});

const decisionSchema = z.object({
  organizationId: z.string().uuid(),
  decision: z.enum(organizerRefundDecisionValues),
  decisionReason: z.string().trim().min(1).max(2000),
});

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ refundRequestId: string }> },
): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid refund request ID',
          details: parsedParams.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid JSON body',
        },
        { status: 400 },
      ),
    );
  }

  const parseResult = decisionSchema.safeParse(payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid refund decision payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, decision, decisionReason } = parseResult.data;

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
    const submitted = await submitOrganizerRefundDecision({
      refundRequestId: parsedParams.data.refundRequestId,
      organizerId: organizationId,
      decidedByUserId: authContext.user.id,
      decision,
      decisionReason,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          refundRequestId: submitted.refundRequestId,
          registrationId: submitted.registrationId,
          organizerId: submitted.organizerId,
          attendeeUserId: submitted.attendeeUserId,
          decision: submitted.decision,
          status: submitted.status,
          decisionReason: submitted.decisionReason,
          decisionAt: submitted.decisionAt.toISOString(),
          decidedByUserId: submitted.decidedByUserId,
          requestedAt: submitted.requestedAt.toISOString(),
        },
      }),
    );
  } catch (error) {
    if (error instanceof RefundDecisionSubmissionError) {
      if (error.code === 'REFUND_REQUEST_NOT_FOUND') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Refund request not found',
              code: error.code,
            },
            { status: 404 },
          ),
        );
      }

      if (error.code === 'REFUND_REQUEST_NOT_PENDING') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Refund request cannot be decided',
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
            error: 'Invalid refund decision',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-refunds] Failed to submit organizer refund decision', {
      refundRequestId: parsedParams.data.refundRequestId,
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
