import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import {
  executeRefundRequest,
  RefundExecutionError,
} from '@/lib/payments/refunds/refund-execution';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const paramsSchema = z.object({
  refundRequestId: z.string().uuid(),
});

const executionSchema = z.object({
  organizationId: z.string().uuid(),
  requestedAmountMinor: z.number().int().positive(),
  maxRefundableToAttendeeMinorPerRun: z.number().int().nonnegative(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ refundRequestId: string }> },
): Promise<NextResponse> {
  const authResult = await requireAuthenticatedPaymentsContext();

  if (!authResult.ok) {
    return authResult.response;
  }

  const authContext = authResult.context;

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
    return withNoStore(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const parseResult = executionSchema.safeParse(payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid refund execution payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, requestedAmountMinor, maxRefundableToAttendeeMinorPerRun } =
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
    const execution = await executeRefundRequest({
      refundRequestId: parsedParams.data.refundRequestId,
      organizerId: organizationId,
      executedByUserId: authContext.user.id,
      requestedAmountMinor,
      maxRefundableToAttendeeMinorPerRun,
      runtime: 'web',
      executionMode: 'in_process',
    });

    return withNoStore(
      NextResponse.json({
        data: {
          refundRequestId: execution.refundRequestId,
          registrationId: execution.registrationId,
          organizerId: execution.organizerId,
          attendeeUserId: execution.attendeeUserId,
          status: execution.status,
          reasonCode: execution.reasonCode,
          requestedAmountMinor: execution.requestedAmountMinor,
          maxRefundableToAttendeeMinorPerRun: execution.maxRefundableToAttendeeMinorPerRun,
          effectiveMaxRefundableMinor: execution.effectiveMaxRefundableMinor,
          alreadyRefundedMinor: execution.alreadyRefundedMinor,
          remainingRefundableBeforeMinor: execution.remainingRefundableBeforeMinor,
          remainingRefundableAfterMinor: execution.remainingRefundableAfterMinor,
          executedAt: execution.executedAt.toISOString(),
          executedByUserId: execution.executedByUserId,
          traceId: execution.traceId,
          ingressDeduplicated: execution.ingressDeduplicated,
          runtime: execution.runtime,
          executionMode: execution.executionMode,
          notifications: execution.notifications,
        },
      }),
    );
  } catch (error) {
    if (error instanceof RefundExecutionError) {
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

      if (
        error.code === 'REFUND_MAX_REFUNDABLE_EXCEEDED' ||
        error.code === 'REFUND_REQUEST_NOT_EXECUTABLE' ||
        error.code === 'REFUND_REQUEST_ALREADY_EXECUTED' ||
        error.code === 'REFUND_EXECUTION_UPDATE_FAILED' ||
        error.code === 'ATTENDEE_NOTIFICATION_TARGET_MISSING' ||
        error.code === 'ORGANIZER_NOTIFICATION_TARGET_MISSING'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Refund execution rejected',
              code: error.code,
              reason: error.message,
            },
            { status: 409 },
          ),
        );
      }

      if (
        error.code === 'REFUND_EXECUTION_MODE_BLOCKED' ||
        error.code === 'REFUND_RUNTIME_BLOCKED'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Refund execution processor unavailable on this runtime',
              code: error.code,
              reason: error.message,
            },
            { status: 503 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'Invalid refund execution request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-refunds] Failed to execute refund request', {
      refundRequestId: parsedParams.data.refundRequestId,
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
