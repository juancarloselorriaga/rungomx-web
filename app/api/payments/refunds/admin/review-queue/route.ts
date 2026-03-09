import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsQuery,
  requireAuthenticatedPaymentsContext,
  requireOrganizerWriteAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import { listRefundAdminReviewQueue } from '@/lib/payments/refunds/escalation-and-goodwill';

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

  const parseResult = parsePaymentsQuery(request, querySchema, (searchParams) => ({
    organizationId: searchParams.get('organizationId'),
    limit: searchParams.get('limit') ?? undefined,
  }));

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

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
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
