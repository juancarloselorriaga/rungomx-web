import { and, eq, gt } from 'drizzle-orm';

import { db } from '@/db';
import { billingEntitlementOverrides, billingSubscriptions } from '@/db/schema';

import { BILLING_ENTITLEMENT_KEY } from './constants';
import type {
  BillingSubscriptionStatus,
  EntitlementEvaluationResult,
  EntitlementInterval,
  EntitlementSource,
} from './types';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

const SOURCE_PRIORITY: Record<EntitlementSource, number> = {
  internal_bypass: 0,
  subscription: 1,
  trial: 2,
  admin_override: 3,
  pending_grant: 4,
  promotion: 5,
  system: 6,
  migration: 7,
};

function mapOverrideSource(sourceType: string): EntitlementSource {
  switch (sourceType) {
    case 'admin':
      return 'admin_override';
    case 'promotion':
      return 'promotion';
    case 'pending_grant':
      return 'pending_grant';
    case 'migration':
      return 'migration';
    case 'system':
    default:
      return 'system';
  }
}

function compareIntervals(a: EntitlementInterval, b: EntitlementInterval) {
  const startDiff = a.startsAt.getTime() - b.startsAt.getTime();
  if (startDiff !== 0) return startDiff;
  return a.endsAt.getTime() - b.endsAt.getTime();
}

function buildIntervals({
  subscription,
  overrides,
}: {
  subscription:
    | {
        id: string;
        status: BillingSubscriptionStatus;
        trialStartsAt: Date | null;
        trialEndsAt: Date | null;
        currentPeriodStartsAt: Date | null;
        currentPeriodEndsAt: Date | null;
      }
    | null;
  overrides: Array<{
    id: string;
    startsAt: Date;
    endsAt: Date;
    sourceType: string;
    sourceId: string | null;
    createdAt: Date;
  }>;
}): EntitlementInterval[] {
  const intervals: EntitlementInterval[] = [];

  if (subscription) {
    if (subscription.status === 'trialing' && subscription.trialStartsAt && subscription.trialEndsAt) {
      intervals.push({
        source: 'trial',
        startsAt: subscription.trialStartsAt,
        endsAt: subscription.trialEndsAt,
        sourceId: subscription.id,
        meta: { subscriptionId: subscription.id },
      });
    }

    if (
      subscription.status === 'active' &&
      subscription.currentPeriodStartsAt &&
      subscription.currentPeriodEndsAt
    ) {
      intervals.push({
        source: 'subscription',
        startsAt: subscription.currentPeriodStartsAt,
        endsAt: subscription.currentPeriodEndsAt,
        sourceId: subscription.id,
        meta: { subscriptionId: subscription.id },
      });
    }
  }

  overrides.forEach((override) => {
    intervals.push({
      source: mapOverrideSource(override.sourceType),
      startsAt: override.startsAt,
      endsAt: override.endsAt,
      sourceId: override.id,
      createdAt: override.createdAt,
      meta: {
        overrideId: override.id,
        sourceType: override.sourceType,
        sourceId: override.sourceId,
      },
    });
  });

  return intervals;
}

export function evaluateProEntitlement({
  now,
  isInternal,
  intervals,
}: {
  now: Date;
  isInternal: boolean;
  intervals: EntitlementInterval[];
}): EntitlementEvaluationResult {
  if (isInternal) {
    return {
      isPro: true,
      proUntil: null,
      effectiveSource: 'internal_bypass',
      sources: [],
      nextProStartsAt: null,
    };
  }

  const activeIntervals = intervals.filter((interval) => interval.endsAt.getTime() > now.getTime());
  activeIntervals.sort(compareIntervals);

  const merged: Array<{ startsAt: Date; endsAt: Date }> = [];

  for (const interval of activeIntervals) {
    const last = merged[merged.length - 1];
    if (!last || interval.startsAt.getTime() > last.endsAt.getTime()) {
      merged.push({ startsAt: interval.startsAt, endsAt: interval.endsAt });
      continue;
    }

    if (interval.endsAt.getTime() > last.endsAt.getTime()) {
      last.endsAt = interval.endsAt;
    }
  }

  const current = merged.find(
    (interval) => interval.startsAt.getTime() <= now.getTime() && now.getTime() < interval.endsAt.getTime(),
  );

  if (!current) {
    const next = merged.find((interval) => interval.startsAt.getTime() > now.getTime());
    return {
      isPro: false,
      proUntil: null,
      effectiveSource: null,
      sources: activeIntervals,
      nextProStartsAt: next?.startsAt ?? null,
    };
  }

  const currentEnd = current.endsAt.getTime();
  const overlapping = activeIntervals.filter(
    (interval) =>
      interval.startsAt.getTime() <= current.endsAt.getTime() &&
      interval.endsAt.getTime() >= current.startsAt.getTime() &&
      interval.endsAt.getTime() === currentEnd,
  );

  const sortedByPriority = overlapping.sort((a, b) => {
    const priorityDiff = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    if (priorityDiff !== 0) return priorityDiff;
    const endDiff = a.endsAt.getTime() - b.endsAt.getTime();
    if (endDiff !== 0) return endDiff;
    if (a.createdAt && b.createdAt) {
      return a.createdAt.getTime() - b.createdAt.getTime();
    }
    if (a.sourceId && b.sourceId) {
      return a.sourceId.localeCompare(b.sourceId);
    }
    return 0;
  });

  return {
    isPro: true,
    proUntil: current.endsAt,
    effectiveSource: sortedByPriority[0]?.source ?? null,
    sources: activeIntervals,
    nextProStartsAt: null,
  };
}

export async function getProEntitlementForUser({
  userId,
  isInternal,
  now = new Date(),
  tx = db,
}: {
  userId: string;
  isInternal: boolean;
  now?: Date;
  tx?: DbClient;
}): Promise<EntitlementEvaluationResult> {
  const [subscription, overrides] = await Promise.all([
    tx.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, userId),
      columns: {
        id: true,
        status: true,
        trialStartsAt: true,
        trialEndsAt: true,
        currentPeriodStartsAt: true,
        currentPeriodEndsAt: true,
      },
    }),
    tx.query.billingEntitlementOverrides.findMany({
      where: and(
        eq(billingEntitlementOverrides.userId, userId),
        eq(billingEntitlementOverrides.entitlementKey, BILLING_ENTITLEMENT_KEY),
        gt(billingEntitlementOverrides.endsAt, now),
      ),
      columns: {
        id: true,
        startsAt: true,
        endsAt: true,
        sourceType: true,
        sourceId: true,
        createdAt: true,
      },
    }),
  ]);

  const intervals = buildIntervals({
    subscription: subscription
      ? {
          id: subscription.id,
          status: subscription.status as BillingSubscriptionStatus,
          trialStartsAt: subscription.trialStartsAt,
          trialEndsAt: subscription.trialEndsAt,
          currentPeriodStartsAt: subscription.currentPeriodStartsAt,
          currentPeriodEndsAt: subscription.currentPeriodEndsAt,
        }
      : null,
    overrides,
  });

  return evaluateProEntitlement({ now, isInternal, intervals });
}
