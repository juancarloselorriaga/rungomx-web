import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsQuery,
  parsePaymentsRouteParams,
  requireAuthenticatedPaymentsContext,
  requireOrganizerWriteAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ payoutRequestId: string }> },
): Promise<NextResponse> {
  const authResult = await requireAuthenticatedPaymentsContext();

  if (!authResult.ok) {
    return authResult.response;
  }

  const authContext = authResult.context;

  const parsedParams = await parsePaymentsRouteParams(params, paramsSchema);
  if (!parsedParams.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'INVALID_PAYOUT_REQUEST_ID',
          details: parsedParams.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const parseResult = parsePaymentsQuery(request, querySchema, (searchParams) => ({
    organizationId: searchParams.get('organizationId'),
  }));

  if (!parseResult.success) {
    return withNoStore(
      NextResponse.json(
        {
          error: 'INVALID_ORGANIZATION_ID',
          details: parseResult.error.issues,
        },
        { status: 400 },
      ),
    );
  }

  const { organizationId } = parseResult.data;
  const { payoutRequestId } = parsedParams.data;

  const accessResult = await requireOrganizerWriteAccess(authContext, organizationId);
  if (!accessResult.ok) {
    return accessResult.response;
  }

  const organizationResult = await findActivePaymentsOrganization(organizationId);
  if (!organizationResult.ok) {
    return organizationResult.response;
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
              error: 'PAYOUT_STATEMENT_NOT_FOUND',
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
              error: 'PAYOUT_STATEMENT_UNAVAILABLE',
              code: error.code,
              reasonCode: error.code,
            },
            { status: 409 },
          ),
        );
      }

      if (error.code === 'PAYOUT_STATEMENT_BASELINE_INCOMPLETE') {
        return withNoStore(
          NextResponse.json(
            {
              error: 'PAYOUT_STATEMENT_BASELINE_UNAVAILABLE',
              code: error.code,
              reasonCode: error.code,
            },
            { status: 500 },
          ),
        );
      }

      return withNoStore(
        NextResponse.json(
          {
            error: 'INVALID_PAYOUT_STATEMENT_REQUEST',
            code: error.code,
            reasonCode: error.code,
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
    return withNoStore(NextResponse.json({ error: 'SERVER_ERROR' }, { status: 500 }));
  }
}
