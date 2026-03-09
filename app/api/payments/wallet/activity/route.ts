import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsQuery,
  requireAuthenticatedPaymentsContext,
  requireOrganizerReadAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
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

  const parseResult = parsePaymentsQuery(request, querySchema, (searchParams) => ({
    organizationId: searchParams.get('organizationId'),
    scope: searchParams.get('scope') ?? undefined,
  }));

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

  const accessResult = await requireOrganizerReadAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
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
