import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import { escalateExpiredRefundRequests } from '@/lib/payments/refunds/escalation-and-goodwill';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';

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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return withNoStore(NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }));
  }

  const parseResult = escalationSchema.safeParse(payload);
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
