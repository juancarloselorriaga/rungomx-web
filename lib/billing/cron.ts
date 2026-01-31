import { and, eq, gte, inArray, isNotNull, isNull, lte, or } from 'drizzle-orm';

import { db } from '@/db';
import {
  billingEvents,
  billingPendingEntitlementGrants,
  billingPromotions,
  billingSubscriptions,
} from '@/db/schema';
import { safeRevalidateTag } from '@/lib/next-cache';

import { billingStatusTag } from './cache-tags';
import { BILLING_TRIAL_EXPIRING_SOON_DAYS } from './constants';
import { sendSubscriptionEndedEmail, sendTrialExpiringSoonEmail } from './emails';
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
  const affectedUserIds = new Set<string>();
  const endedNotifications = new Map<string, 'trial' | 'active'>();

  await db.transaction(async (tx) => {
    for (const subscription of expired) {
      const endedStatus = subscription.status === 'trialing' ? 'trial' : 'active';
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
      affectedUserIds.add(subscription.userId);
      endedNotifications.set(subscription.userId, endedStatus);

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

  for (const userId of affectedUserIds) {
    safeRevalidateTag(billingStatusTag(userId), { expire: 0 });
  }

  for (const [userId, endedStatus] of endedNotifications.entries()) {
    sendSubscriptionEndedEmail({ userId, endedStatus }).catch(() => {});
  }

  return endedCount;
}

export async function notifyExpiringTrials(): Promise<number> {
  const now = new Date();
  const windowEndsAt = new Date(
    now.getTime() + BILLING_TRIAL_EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000,
  );

  let notifiedCount = 0;
  const expiringSoon = await db
    .select({
      subscriptionId: billingSubscriptions.id,
      userId: billingSubscriptions.userId,
      trialEndsAt: billingSubscriptions.trialEndsAt,
    })
    .from(billingSubscriptions)
    .leftJoin(
      billingEvents,
      and(
        eq(billingEvents.entityType, 'subscription'),
        eq(billingEvents.entityId, billingSubscriptions.id),
        eq(billingEvents.type, 'trial_expiring_soon_notified'),
      ),
    )
    .where(
      and(
        eq(billingSubscriptions.status, 'trialing'),
        isNotNull(billingSubscriptions.trialEndsAt),
        gte(billingSubscriptions.trialEndsAt, now),
        lte(billingSubscriptions.trialEndsAt, windowEndsAt),
        eq(billingSubscriptions.cancelAtPeriodEnd, false),
        isNull(billingEvents.id),
      ),
    );

  if (expiringSoon.length === 0) {
    return 0;
  }

  for (const subscription of expiringSoon) {
    if (!subscription.trialEndsAt) continue;
    const externalEventId = `trial_expiring_soon_notified:${subscription.subscriptionId}`;

    const [event] = await db
      .insert(billingEvents)
      .values({
        provider: 'system',
        externalEventId,
        source: 'system',
        type: 'trial_expiring_soon_notified',
        userId: subscription.userId,
        entityType: 'subscription',
        entityId: subscription.subscriptionId,
        payloadJson: {
          trialEndsAt: subscription.trialEndsAt.toISOString(),
        },
      })
      .onConflictDoNothing({
        target: [billingEvents.provider, billingEvents.externalEventId],
      })
      .returning({ id: billingEvents.id });

    if (!event) continue;

    notifiedCount += 1;
    sendTrialExpiringSoonEmail({
      userId: subscription.userId,
      trialEndsAt: subscription.trialEndsAt,
    }).catch(() => {});
  }

  return notifiedCount;
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
  await notifyExpiringTrials();
  const disabledPromotions = await disableExpiredPromotions();
  const disabledPendingGrants = await disableExpiredPendingGrants();

  return { endedSubscriptions, disabledPromotions, disabledPendingGrants };
}
