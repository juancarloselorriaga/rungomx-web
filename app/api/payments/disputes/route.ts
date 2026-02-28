import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import { DisputeLifecycleError, openDisputeCase } from '@/lib/payments/disputes/lifecycle';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const disputeIntakeSchema = z
  .object({
    organizationId: z.string().uuid(),
    registrationId: z.string().uuid().optional(),
    orderId: z.string().uuid().optional(),
    attendeeUserId: z.string().uuid().optional(),
    reasonCode: z.string().trim().min(1).max(64),
    reasonNote: z.string().trim().max(2000).optional(),
    amountAtRiskMinor: z.number().int().positive(),
    currency: z.string().length(3).optional(),
    evidenceDeadlineAt: z.string().datetime().optional(),
  })
  .refine((payload) => Boolean(payload.registrationId || payload.orderId), {
    message: 'Dispute intake requires `registrationId` or `orderId`.',
    path: ['registrationId'],
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

  const parseResult = disputeIntakeSchema.safeParse(payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid dispute intake payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const {
    organizationId,
    registrationId,
    orderId,
    attendeeUserId,
    reasonCode,
    reasonNote,
    amountAtRiskMinor,
    currency,
    evidenceDeadlineAt,
  } = parseResult.data;

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
    const disputeCase = await openDisputeCase({
      organizerId: organizationId,
      openedByUserId: authContext.user.id,
      registrationId,
      orderId,
      attendeeUserId,
      reasonCode,
      reasonNote,
      amountAtRiskMinor,
      currency,
      evidenceDeadlineAt: evidenceDeadlineAt ? new Date(evidenceDeadlineAt) : undefined,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          disputeCaseId: disputeCase.disputeCaseId,
          organizerId: disputeCase.organizerId,
          registrationId: disputeCase.registrationId,
          orderId: disputeCase.orderId,
          attendeeUserId: disputeCase.attendeeUserId,
          status: disputeCase.status,
          reasonCode: disputeCase.reasonCode,
          reasonNote: disputeCase.reasonNote,
          amountAtRiskMinor: disputeCase.amountAtRiskMinor,
          currency: disputeCase.currency,
          evidenceDeadlineAt: disputeCase.evidenceDeadlineAt.toISOString(),
          openedAt: disputeCase.openedAt.toISOString(),
          lastTransitionAt: disputeCase.lastTransitionAt.toISOString(),
          traceId: disputeCase.traceId,
          ingressDeduplicated: disputeCase.ingressDeduplicated,
          metadata: disputeCase.metadata,
        },
      }),
    );
  } catch (error) {
    if (error instanceof DisputeLifecycleError) {
      if (error.code === 'DISPUTE_INTAKE_REGISTRATION_NOT_FOUND') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Registration not found',
              code: error.code,
              reason: error.message,
            },
            { status: 404 },
          ),
        );
      }

      if (
        error.code === 'DISPUTE_INTAKE_REGISTRATION_ORGANIZER_MISMATCH' ||
        error.code === 'DISPUTE_INTAKE_INSERT_FAILED'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Dispute intake rejected',
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
            error: 'Invalid dispute intake request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-disputes] Failed to intake dispute case', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
