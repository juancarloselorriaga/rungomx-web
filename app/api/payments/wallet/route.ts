import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  findActivePaymentsOrganization,
  parsePaymentsQuery,
  requireAuthenticatedPaymentsContext,
  requireOrganizerReadAccess,
  withNoStore,
} from '@/app/api/payments/_shared';
import { recordWalletPerformanceSample } from '@/lib/payments/wallet/performance-budget';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

const querySchema = z.object({
  organizationId: z.string().uuid(),
});

const WALLET_OVERVIEW_P95_TARGET_MS = 2000;
const HIGH_HISTORY_EVENT_COUNT_THRESHOLD = 500;
const WALLET_SUSTAINED_DRIFT_THRESHOLD = 3;

export async function GET(request: Request): Promise<NextResponse> {
  const startedAt = Date.now();
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
    const snapshot = await getOrganizerWalletBucketSnapshot({
      organizerId: organizationId,
    });

    const durationMs = Date.now() - startedAt;
    const performanceEvidence = recordWalletPerformanceSample({
      queryDurationMs: snapshot.queryDurationMs,
      budgetMs: WALLET_OVERVIEW_P95_TARGET_MS,
      sustainedDriftThreshold: WALLET_SUSTAINED_DRIFT_THRESHOLD,
    });
    const historyWindow =
      snapshot.historyEventCount > HIGH_HISTORY_EVENT_COUNT_THRESHOLD ? 'growth' : 'baseline';

    if (performanceEvidence.sustainedDrift) {
      console.warn('[payments-wallet] Sustained p95 budget drift detected', {
        organizerId: organizationId,
        p95TargetMs: WALLET_OVERVIEW_P95_TARGET_MS,
        p95ObservedMs: performanceEvidence.p95QueryDurationMs,
        overBudgetSampleCount: performanceEvidence.overBudgetSampleCount,
        sampleCount: performanceEvidence.sampleCount,
        historyEventCount: snapshot.historyEventCount,
      });
    }

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
        p95ObservedMs: performanceEvidence.p95QueryDurationMs,
        sampleCount: performanceEvidence.sampleCount,
        overBudgetSampleCount: performanceEvidence.overBudgetSampleCount,
        sustainedDriftAlert: performanceEvidence.sustainedDrift,
        historyEventCount: snapshot.historyEventCount,
        historyWindow,
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

    return withNoStore(NextResponse.json({ error: 'Server error' }, { status: 500 }));
  }
}
