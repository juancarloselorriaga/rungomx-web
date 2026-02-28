import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import { getOrgMembership } from '@/lib/organizations/permissions';
import { getOrganizerWalletIssueActivity } from '@/lib/payments/wallet/issue-activity';

const querySchema = z.object({
  organizationId: z.string().uuid(),
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
  });

  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid organizationId',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId } = parseResult.data;

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    if (!membership) {
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
    const activity = await getOrganizerWalletIssueActivity({
      organizerId: organizationId,
    });

    const response = NextResponse.json({
      data: {
        organizerId: activity.organizerId,
        asOf: activity.asOf.toISOString(),
        actionNeeded: activity.actionNeeded,
        inProgress: activity.inProgress,
      },
      meta: {
        actionNeededCount: activity.actionNeededCount,
        inProgressCount: activity.inProgressCount,
        semantics: {
          actionNeededLabel: 'Action Needed',
          inProgressLabel: 'In Progress',
        },
      },
    });

    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    console.error('[payments-wallet-issues] Failed to resolve issue activity', {
      organizationId,
      error,
    });

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
