import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { requireAuthenticatedPaymentsContext, withNoStore } from '@/app/api/payments/_shared';
import { getOrgMembership } from '@/lib/organizations/permissions';
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

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    organizationId: url.searchParams.get('organizationId'),
    eventId: url.searchParams.get('eventId'),
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

  const { organizationId, eventId } = parseResult.data;

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
