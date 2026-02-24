import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import { getOrgMembership } from '@/lib/organizations/permissions';
import { getOrganizerWalletExplainability } from '@/lib/payments/wallet/explainability';

const querySchema = z.object({
  organizationId: z.string().uuid(),
  eventId: z.string().uuid(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const parseResult = querySchema.safeParse({
    organizationId: url.searchParams.get('organizationId'),
    eventId: url.searchParams.get('eventId'),
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid query parameters',
        details: parseResult.error.issues,
      },
      { status: 400 },
    );
  }

  const { organizationId, eventId } = parseResult.data;

  if (!authContext.permissions.canManageEvents) {
    const membership = await getOrgMembership(authContext.user.id, organizationId);
    if (!membership) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }
  }

  const organization = await db.query.organizations.findFirst({
    where: and(eq(organizations.id, organizationId), isNull(organizations.deletedAt)),
    columns: { id: true },
  });

  if (!organization) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  try {
    const explainability = await getOrganizerWalletExplainability({
      organizerId: organizationId,
      eventId,
    });

    if (!explainability) {
      return NextResponse.json({ error: 'Timeline event not found' }, { status: 404 });
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

    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
