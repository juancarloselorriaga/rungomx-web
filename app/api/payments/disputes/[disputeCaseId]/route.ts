import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import {
  DisputeLifecycleError,
  getDisputeEvidenceWindow,
} from '@/lib/payments/disputes/lifecycle';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const paramsSchema = z.object({
  disputeCaseId: z.string().uuid(),
});

const querySchema = z.object({
  organizationId: z.string().uuid(),
});

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(
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

  const parsedQuery = querySchema.safeParse({
    organizationId: new URL(request.url).searchParams.get('organizationId') ?? undefined,
  });
  if (!parsedQuery.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid dispute detail query',
          details: parsedQuery.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId } = parsedQuery.data;

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
    const evidenceWindow = await getDisputeEvidenceWindow({
      disputeCaseId: parsedParams.data.disputeCaseId,
      organizerId: organizationId,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          disputeCaseId: evidenceWindow.disputeCaseId,
          organizerId: evidenceWindow.organizerId,
          status: evidenceWindow.status,
          evidenceDeadlineAt: evidenceWindow.evidenceDeadlineAt.toISOString(),
          asOf: evidenceWindow.asOf.toISOString(),
          remainingSeconds: evidenceWindow.remainingSeconds,
          deadlineState: evidenceWindow.deadlineState,
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

      return withNoStore(
        NextResponse.json(
          {
            error: 'Invalid dispute detail request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-disputes] Failed to fetch dispute detail', {
      disputeCaseId: parsedParams.data.disputeCaseId,
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
