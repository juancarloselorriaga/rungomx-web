import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import {
  disputeLifecycleStatuses,
  DisputeLifecycleError,
  transitionDisputeCase,
} from '@/lib/payments/disputes/lifecycle';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const paramsSchema = z.object({
  disputeCaseId: z.string().uuid(),
});

const transitionSchema = z.object({
  organizationId: z.string().uuid(),
  toStatus: z.enum(disputeLifecycleStatuses),
  reasonCode: z.string().trim().min(1).max(64).optional(),
  reasonNote: z.string().trim().max(2000).optional(),
});

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ disputeCaseId: string }> },
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
          error: 'Invalid dispute case ID',
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

  const parseResult = transitionSchema.safeParse(payload);
  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid dispute transition payload',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, toStatus, reasonCode, reasonNote } = parseResult.data;

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
    const transition = await transitionDisputeCase({
      disputeCaseId: parsedParams.data.disputeCaseId,
      organizerId: organizationId,
      actorUserId: authContext.user.id,
      toStatus,
      reasonCode,
      reasonNote,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          disputeCaseId: transition.disputeCaseId,
          organizerId: transition.organizerId,
          fromStatus: transition.fromStatus,
          toStatus: transition.toStatus,
          reasonCode: transition.reasonCode,
          reasonNote: transition.reasonNote,
          transitionedAt: transition.transitionedAt.toISOString(),
          closedAt: transition.closedAt?.toISOString() ?? null,
          latestTransitionByUserId: transition.latestTransitionByUserId,
          settlement: transition.settlement,
          metadata: transition.metadata,
        },
      }),
    );
  } catch (error) {
    if (error instanceof DisputeLifecycleError) {
      if (error.code === 'DISPUTE_CASE_NOT_FOUND') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Dispute case not found',
              code: error.code,
            },
            { status: 404 },
          ),
        );
      }

      if (
        error.code === 'DISPUTE_TRANSITION_NOT_ALLOWED' ||
        error.code === 'DISPUTE_TRANSITION_UPDATE_FAILED' ||
        error.code === 'DISPUTE_SETTLEMENT_MODE_BLOCKED' ||
        error.code === 'DISPUTE_SETTLEMENT_RUNTIME_BLOCKED' ||
        error.code === 'DISPUTE_SETTLEMENT_AMOUNT_INVALID'
      ) {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Dispute transition rejected',
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
            error: 'Invalid dispute transition request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-disputes] Failed to transition dispute case', {
      disputeCaseId: parsedParams.data.disputeCaseId,
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
