import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import { listRefundAdminReviewQueue } from '@/lib/payments/refunds/escalation-and-goodwill';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

const querySchema = z.object({
  organizationId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const authResult = await requireAuthenticatedPaymentsContext();

  if (!authResult.ok) {
    return authResult.response;
  }

  const authContext = authResult.context;

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    organizationId: url.searchParams.get('organizationId'),
    limit: url.searchParams.get('limit') ?? undefined,
  });

  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid admin review queue query',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, limit } = parseResult.data;

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
    const queueItems = await listRefundAdminReviewQueue({
      organizerId: organizationId,
      limit,
    });

    return withNoStore(
      NextResponse.json({
        data: queueItems.map((item) => ({
          refundRequestId: item.refundRequestId,
          registrationId: item.registrationId,
          organizerId: item.organizerId,
          attendeeUserId: item.attendeeUserId,
          requestedByUserId: item.requestedByUserId,
          status: item.status,
          reasonCode: item.reasonCode,
          reasonNote: item.reasonNote,
          requestedAt: item.requestedAt.toISOString(),
          escalatedAt: item.escalatedAt?.toISOString() ?? null,
          queueSource: item.queueSource,
        })),
        meta: {
          count: queueItems.length,
          organizationId,
        },
      }),
    );
  } catch (error) {
    console.error('[payments-refunds] Failed to load admin review queue', {
      organizationId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
