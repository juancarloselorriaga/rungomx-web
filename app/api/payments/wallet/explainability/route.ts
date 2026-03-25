import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsQuery,
  requireAuthenticatedPaymentsContext,
  requireOrganizerReadAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import { getOrganizerWalletExplainability } from '@/lib/payments/wallet/explainability';

const querySchema = z.object({
  organizationId: z.string().uuid(),
  eventId: z.string().uuid(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const authResult = await requireAuthenticatedPaymentsContext();

  if (!authResult.ok) {
    return authResult.response;
  }

  const authContext = authResult.context;

  const parseResult = parsePaymentsQuery(request, querySchema, (searchParams) => ({
    organizationId: searchParams.get('organizationId'),
    eventId: searchParams.get('eventId'),
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

  const { organizationId, eventId } = parseResult.data;

  const accessResult = await requireOrganizerReadAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
  }

  try {
    const explainability = await getOrganizerWalletExplainability({
      organizerId: organizationId,
      eventId,
    });

    if (!explainability) {
      return withNoStore(NextResponse.json({ error: 'Timeline event not found' }, { status: 404 }));
    }

    const response = NextResponse.json({
      data: explainability,
      meta: {
        eventId,
        organizationId,
      },
    });

    response.headers.set('Cache-Control', 'no-store');

    return response;
  } catch (error) {
    console.error('[payments-wallet-explainability] Failed to resolve explainability payload', {
      organizationId,
      eventId,
      error,
    });

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
