import { and, eq, inArray, isNotNull, lte, or } from 'drizzle-orm';

import { db } from '@/db';
import { billingPendingEntitlementGrants, billingPromotions, billingSubscriptions } from '@/db/schema';

import { appendBillingEvent } from './events';

export async function finalizeExpiredSubscriptions(): Promise<number> {
  const now = new Date();
  const expired = await db.query.billingSubscriptions.findMany({
    where: or(
      and(
        eq(billingSubscriptions.status, 'trialing'),
        isNotNull(billingSubscriptions.trialEndsAt),
        lte(billingSubscriptions.trialEndsAt, now),
      ),
      and(
        eq(billingSubscriptions.status, 'active'),
        isNotNull(billingSubscriptions.currentPeriodEndsAt),
        lte(billingSubscriptions.currentPeriodEndsAt, now),
      ),
    ),
    columns: {
      id: true,
      userId: true,
      status: true,
      trialEndsAt: true,
      currentPeriodEndsAt: true,
    },
  });

  if (expired.length === 0) {
    return 0;
  }

  let endedCount = 0;

  await db.transaction(async (tx) => {
    for (const subscription of expired) {
      const endedAt = subscription.status === 'trialing'
        ? subscription.trialEndsAt ?? now
        : subscription.currentPeriodEndsAt ?? now;

      const [updated] = await tx
        .update(billingSubscriptions)
        .set({
          status: 'ended',
          endedAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(billingSubscriptions.id, subscription.id),
            inArray(billingSubscriptions.status, ['trialing', 'active']),
          ),
        )
        .returning({ id: billingSubscriptions.id });

      if (!updated) continue;

      endedCount += 1;

      await appendBillingEvent(
        {
          source: 'system',
          type: 'subscription_ended',
          userId: subscription.userId,
          entityType: 'subscription',
          entityId: subscription.id,
          payload: {
            endedAt: endedAt.toISOString(),
          },
        },
        tx,
      );
    }
  });

  return endedCount;
}

export async function disableExpiredPromotions(): Promise<number> {
  const now = new Date();
  const expired = await db.query.billingPromotions.findMany({
    where: and(
      eq(billingPromotions.isActive, true),
      isNotNull(billingPromotions.validTo),
      lte(billingPromotions.validTo, now),
    ),
    columns: { id: true },
  });

  if (expired.length === 0) return 0;

  let disabledCount = 0;

  await db.transaction(async (tx) => {
    for (const promo of expired) {
      const [updated] = await tx
        .update(billingPromotions)
        .set({ isActive: false, updatedAt: now })
        .where(eq(billingPromotions.id, promo.id))
        .returning({ id: billingPromotions.id });

      if (!updated) continue;
      disabledCount += 1;

      await appendBillingEvent(
        {
          source: 'system',
          type: 'promotion_disabled',
          userId: null,
          entityType: 'promotion',
          entityId: promo.id,
        },
        tx,
      );
    }
  });

  return disabledCount;
}

export async function disableExpiredPendingGrants(): Promise<number> {
  const now = new Date();
  const expired = await db.query.billingPendingEntitlementGrants.findMany({
    where: and(
      eq(billingPendingEntitlementGrants.isActive, true),
      isNotNull(billingPendingEntitlementGrants.claimValidTo),
      lte(billingPendingEntitlementGrants.claimValidTo, now),
    ),
    columns: { id: true },
  });

  if (expired.length === 0) return 0;

  let disabledCount = 0;

  await db.transaction(async (tx) => {
    for (const grant of expired) {
      const [updated] = await tx
        .update(billingPendingEntitlementGrants)
        .set({ isActive: false, updatedAt: now })
        .where(eq(billingPendingEntitlementGrants.id, grant.id))
        .returning({ id: billingPendingEntitlementGrants.id });

      if (!updated) continue;
      disabledCount += 1;

      await appendBillingEvent(
        {
          source: 'system',
          type: 'pending_grant_disabled',
          userId: null,
          entityType: 'pending_grant',
          entityId: grant.id,
        },
        tx,
      );
    }
  });

  return disabledCount;
}

export async function runBillingMaintenance(): Promise<{
  endedSubscriptions: number;
  disabledPromotions: number;
  disabledPendingGrants: number;
}> {
  const endedSubscriptions = await finalizeExpiredSubscriptions();
  const disabledPromotions = await disableExpiredPromotions();
  const disabledPendingGrants = await disableExpiredPendingGrants();

  return { endedSubscriptions, disabledPromotions, disabledPendingGrants };
}
