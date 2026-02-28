import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import { getOrgMembership } from '@/lib/organizations/permissions';
import {
  getOrganizerWalletActivityTimeline,
  walletActivityScopes,
} from '@/lib/payments/wallet/activity-timeline';

const querySchema = z.object({
  organizationId: z.string().uuid(),
  scope: z.enum(walletActivityScopes).optional(),
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
    scope: url.searchParams.get('scope') ?? undefined,
  });

  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid query parameters',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId, scope } = parseResult.data;

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
    const timeline = await getOrganizerWalletActivityTimeline({
      organizerId: organizationId,
      scope,
    });

    const response = NextResponse.json({
      data: {
        organizerId: timeline.organizerId,
        asOf: timeline.asOf.toISOString(),
        totals: timeline.totals,
        debt: timeline.debt,
        dayGroups: timeline.dayGroups,
      },
      meta: {
        scope: timeline.scope,
        dayGroupingTimezone: 'UTC',
        entryCount: timeline.entryCount,
        filteredEntryCount: timeline.filteredEntryCount,
        queryDurationMs: timeline.queryDurationMs,
      },
    });

    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Server-Timing', `wallet-activity-db;dur=${timeline.queryDurationMs}`);

    return response;
  } catch (error) {
    console.error('[payments-wallet-activity] Failed to resolve organizer activity timeline', {
      organizationId,
      scope,
      error,
    });

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
