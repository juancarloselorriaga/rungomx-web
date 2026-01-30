import { eq } from 'drizzle-orm';

import { db } from '@/db';
import { billingSubscriptions, billingTrialUses } from '@/db/schema';

import { getProEntitlementForUser } from './entitlements';
import type { BillingSubscriptionStatus, EntitlementEvaluationResult } from './types';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type DbClient = typeof db | DbTransaction;

export type BillingSubscriptionSnapshot = {
  id: string;
  status: BillingSubscriptionStatus;
  planKey: string;
  cancelAtPeriodEnd: boolean;
  trialStartsAt: Date | null;
  trialEndsAt: Date | null;
  currentPeriodStartsAt: Date | null;
  currentPeriodEndsAt: Date | null;
  canceledAt: Date | null;
  endedAt: Date | null;
};

export type BillingStatus = EntitlementEvaluationResult & {
  subscription: BillingSubscriptionSnapshot | null;
  trialEligible: boolean;
};

export async function getBillingStatusForUser({
  userId,
  isInternal,
  now = new Date(),
  tx = db,
}: {
  userId: string;
  isInternal: boolean;
  now?: Date;
  tx?: DbClient;
}): Promise<BillingStatus> {
  const [subscription, trialUse, entitlement] = await Promise.all([
    tx.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, userId),
      columns: {
        id: true,
        status: true,
        planKey: true,
        cancelAtPeriodEnd: true,
        trialStartsAt: true,
        trialEndsAt: true,
        currentPeriodStartsAt: true,
        currentPeriodEndsAt: true,
        canceledAt: true,
        endedAt: true,
      },
    }),
    tx.query.billingTrialUses.findFirst({
      where: eq(billingTrialUses.userId, userId),
      columns: { userId: true },
    }),
    getProEntitlementForUser({ userId, isInternal, now, tx }),
  ]);

  const subscriptionSnapshot = subscription
    ? {
        id: subscription.id,
        status: subscription.status as BillingSubscriptionStatus,
        planKey: subscription.planKey,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        trialStartsAt: subscription.trialStartsAt,
        trialEndsAt: subscription.trialEndsAt,
        currentPeriodStartsAt: subscription.currentPeriodStartsAt,
        currentPeriodEndsAt: subscription.currentPeriodEndsAt,
        canceledAt: subscription.canceledAt,
        endedAt: subscription.endedAt,
      }
    : null;

  return {
    ...entitlement,
    subscription: subscriptionSnapshot,
    trialEligible: !trialUse && !entitlement.isPro,
  };
}
