import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsQuery,
  requireAuthenticatedPaymentsContext,
  requireOrganizerReadAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
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

  const parseResult = parsePaymentsQuery(request, querySchema, (searchParams) => ({
    organizationId: searchParams.get('organizationId'),
  }));

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

  const accessResult = await requireOrganizerReadAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
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
