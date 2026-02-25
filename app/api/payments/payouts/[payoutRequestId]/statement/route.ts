import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { db } from '@/db';
import { organizations } from '@/db/schema';
import { getAuthContext } from '@/lib/auth/server';
import { getOrgMembership, requireOrgPermission } from '@/lib/organizations/permissions';
import {
  generatePayoutStatementArtifact,
  PayoutStatementError,
} from '@/lib/payments/payouts/statements';

const paramsSchema = z.object({
  payoutRequestId: z.string().uuid(),
});

const querySchema = z.object({
  organizationId: z.string().uuid(),
});

function withNoStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ payoutRequestId: string }> },
): Promise<NextResponse> {
  const authContext = await getAuthContext();

  if (!authContext.user) {
    return withNoStore(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
  }

  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'Invalid payout request ID',
          details: parsedParams.error.issues,
        },
        { status: 400 },
      ),
    );
  }

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
  const { payoutRequestId } = parsedParams.data;

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
    const statement = await generatePayoutStatementArtifact({
      organizerId: organizationId,
      payoutRequestId,
    });

    return withNoStore(
      NextResponse.json({
        data: {
          payoutStatementId: statement.payoutStatementId,
          organizerId: statement.organizerId,
          payoutRequestId: statement.payoutRequestId,
          payoutQuoteId: statement.payoutQuoteId,
          payoutContractId: statement.payoutContractId,
          payoutStatus: statement.payoutStatus,
          traceId: statement.traceId,
          statementFingerprint: statement.statementFingerprint,
          quoteReference: {
            ...statement.quoteReference,
            requestedAt: statement.quoteReference.requestedAt.toISOString(),
          },
          componentBreakdown: statement.componentBreakdown,
          adjustmentLines: statement.adjustmentLines.map((line) => ({
            ...line,
            occurredAt: line.occurredAt.toISOString(),
          })),
          originalRequestedAmountMinor: statement.originalRequestedAmountMinor,
          currentRequestedAmountMinor: statement.currentRequestedAmountMinor,
          terminalAmountMinor: statement.terminalAmountMinor,
          adjustmentTotalMinor: statement.adjustmentTotalMinor,
          accessReference: statement.accessReference,
          deliveryReference: statement.deliveryReference,
          generatedAt: statement.generatedAt.toISOString(),
        },
      }),
    );
  } catch (error) {
    if (error instanceof PayoutStatementError) {
      if (error.code === 'PAYOUT_STATEMENT_NOT_FOUND') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Payout request not found',
              code: error.code,
            },
            { status: 404 },
          ),
        );
      }

      if (error.code === 'PAYOUT_STATEMENT_STATUS_NOT_TERMINAL') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Payout statement is not available for non-terminal payout status',
              code: error.code,
              reason: error.message,
            },
            { status: 409 },
          ),
        );
      }

      if (error.code === 'PAYOUT_STATEMENT_BASELINE_INCOMPLETE') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'Payout statement baseline could not be resolved',
              code: error.code,
              reason: error.message,
            },
            { status: 500 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'Invalid payout statement request',
            code: error.code,
            reason: error.message,
          },
          { status: 400 },
        ),
      );
    }

    console.error('[payments-payouts] Failed to resolve payout statement artifact', {
      organizationId,
      payoutRequestId,
      actorUserId: authContext.user.id,
      error,
    });
    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
