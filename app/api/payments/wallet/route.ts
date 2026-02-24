import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import { getOrgMembership } from '@/lib/organizations/permissions';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

const querySchema = z.object({
  organizationId: z.string().uuid(),
});

const WALLET_OVERVIEW_P95_TARGET_MS = 2000;

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);

  const parseResult = querySchema.safeParse({
    organizationId: url.searchParams.get('organizationId'),
  });

  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: 'Invalid organizationId',
        details: parseResult.error.issues,
      },
      { status: 400 },
    );
  }

  const { organizationId } = parseResult.data;

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
    const snapshot = await getOrganizerWalletBucketSnapshot({
      organizerId: organizationId,
    });

    const durationMs = Date.now() - startedAt;

    const response = NextResponse.json({
      data: {
        organizerId: snapshot.organizerId,
        asOf: snapshot.asOf.toISOString(),
        buckets: snapshot.buckets,
        debt: snapshot.debt,
      },
      meta: {
        queryDurationMs: snapshot.queryDurationMs,
        durationMs,
        p95TargetMs: WALLET_OVERVIEW_P95_TARGET_MS,
      },
    });

    response.headers.set('Cache-Control', 'no-store');
    response.headers.set('Server-Timing', `wallet-db;dur=${snapshot.queryDurationMs}`);

    return response;
  } catch (error) {
    console.error('[payments-wallet] Failed to resolve wallet snapshot', {
      organizationId,
      error,
    });

    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
