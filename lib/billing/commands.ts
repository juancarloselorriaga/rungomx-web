import { randomBytes } from 'crypto';
import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import { db } from '@/db';
import {
  billingEntitlementOverrides,
  billingPendingEntitlementGrants,
  billingPromotionRedemptions,
  billingPromotions,
  billingSubscriptions,
  billingTrialUses,
} from '@/db/schema';
import { safeRevalidateTag } from '@/lib/next-cache';

import { BILLING_ENTITLEMENT_KEY, BILLING_PLAN_KEY, BILLING_TRIAL_DAYS, PROMO_CODE_LENGTH } from './constants';
import { billingStatusTag } from './cache-tags';
import { sendCancelScheduledEmail, sendTrialStartedEmail } from './emails';
import { appendBillingEvent } from './events';
import {
  getLatestBillingHashSecret,
  getPromoCodePrefix,
  hashEmailAllVersions,
  hashPromoCode,
  hashPromoCodeAllVersions,
} from './hash';
import { computeGrantWindow } from './grants';
import { getProEntitlementForUser } from './entitlements';
import type { BillingEventType } from './types';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

const PROMO_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generatePromoCode(): string {
  const bytes = randomBytes(PROMO_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < bytes.length; i += 1) {
    code += PROMO_ALPHABET[bytes[i] % PROMO_ALPHABET.length];
  }
  return code;
}
const DAY_MS = 24 * 60 * 60 * 1000;

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string' &&
    (error as { code: string }).code === '23505'
  );
}

function revalidateBillingStatus(userId: string) {
  safeRevalidateTag(billingStatusTag(userId), { expire: 0 });
}

function isWithinWindow({
  now,
  startsAt,
  endsAt,
}: {
  now: Date;
  startsAt: Date | null;
  endsAt: Date | null;
}) {
  if (startsAt && now < startsAt) return false;
  if (endsAt && now >= endsAt) return false;
  return true;
}

export async function startTrialForUser({
  userId,
  isInternal,
  emailVerified,
  now = new Date(),
  trialDays = BILLING_TRIAL_DAYS,
}: {
  userId: string;
  isInternal: boolean;
  emailVerified: boolean;
  now?: Date;
  trialDays?: number;
}): Promise<ActionResult<{ subscriptionId: string; trialStartsAt: Date; trialEndsAt: Date }>> {
  if (!emailVerified) {
    return { ok: false, error: 'Email verification required', code: 'EMAIL_NOT_VERIFIED' };
  }

  const entitlement = await getProEntitlementForUser({ userId, isInternal, now });
  if (entitlement.isPro) {
    return { ok: false, error: 'User already has Pro access', code: 'ALREADY_PRO' };
  }

  const result = await db.transaction(async (tx) => {
    const [trialUse] = await tx
      .insert(billingTrialUses)
      .values({
        userId,
        usedAt: now,
        source: 'user',
        createdAt: now,
      })
      .onConflictDoNothing()
      .returning();

    if (!trialUse) {
      return { ok: false, error: 'Trial already used', code: 'TRIAL_ALREADY_USED' } as const;
    }

    const trialEndsAt = new Date(now.getTime() + trialDays * DAY_MS);

    const [subscription] = await tx
      .insert(billingSubscriptions)
      .values({
        userId,
        planKey: BILLING_PLAN_KEY,
        status: 'trialing',
        trialStartsAt: now,
        trialEndsAt,
        currentPeriodStartsAt: null,
        currentPeriodEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [billingSubscriptions.userId],
        set: {
          planKey: BILLING_PLAN_KEY,
          status: 'trialing',
          trialStartsAt: now,
          trialEndsAt,
          currentPeriodStartsAt: null,
          currentPeriodEndsAt: null,
          cancelAtPeriodEnd: false,
          canceledAt: null,
          endedAt: null,
          updatedAt: now,
        },
      })
      .returning({ id: billingSubscriptions.id });

    await appendBillingEvent(
      {
        source: 'system',
        type: 'trial_started',
        userId,
        entityType: 'subscription',
        entityId: subscription.id,
        payload: {
          trialEndsAt: trialEndsAt.toISOString(),
        },
      },
      tx,
    );

    return {
      ok: true,
      data: { subscriptionId: subscription.id, trialStartsAt: now, trialEndsAt },
    } as const;
  });

  if (result.ok) {
    revalidateBillingStatus(userId);
    sendTrialStartedEmail({ userId }).catch(() => {});
  }

  return result;
}

export async function scheduleCancelAtPeriodEnd({
  userId,
  now = new Date(),
}: {
  userId: string;
  now?: Date;
}): Promise<
  ActionResult<{
    subscriptionId: string;
    cancelAtPeriodEnd: boolean;
    endsAt: Date;
    alreadyScheduled: boolean;
  }>
> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM ${billingSubscriptions} WHERE user_id = ${userId} FOR UPDATE`,
    );

    const subscription = await tx.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, userId),
    });

    if (!subscription) {
      return { ok: false, error: 'Subscription not found', code: 'NOT_FOUND' } as const;
    }

    if (subscription.status === 'ended') {
      return { ok: false, error: 'Subscription already ended', code: 'SUBSCRIPTION_ENDED' } as const;
    }

    const window =
      subscription.status === 'trialing'
        ? { type: 'trial', endsAt: subscription.trialEndsAt }
        : { type: 'paid', endsAt: subscription.currentPeriodEndsAt };

    if (!window.endsAt || now >= window.endsAt) {
      return { ok: false, error: 'Subscription is not active', code: 'NOT_ACTIVE' } as const;
    }

    const endsAt = window.endsAt;

    if (subscription.cancelAtPeriodEnd) {
      return {
        ok: true,
        data: {
          subscriptionId: subscription.id,
          cancelAtPeriodEnd: true,
          endsAt,
          alreadyScheduled: true,
        },
      } as const;
    }

    await tx
      .update(billingSubscriptions)
      .set({
        cancelAtPeriodEnd: true,
        canceledAt: subscription.canceledAt ?? now,
        updatedAt: now,
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    await appendBillingEvent(
      {
        source: 'system',
        type: 'cancel_scheduled',
        userId,
        entityType: 'subscription',
        entityId: subscription.id,
        payload: {
          window: window.type,
          endsAt: window.endsAt.toISOString(),
        },
      },
      tx,
    );

    return {
      ok: true,
      data: {
        subscriptionId: subscription.id,
        cancelAtPeriodEnd: true,
        endsAt,
        alreadyScheduled: false,
      },
    } as const;
  });

  if (result.ok) {
    revalidateBillingStatus(userId);
    if (!result.data.alreadyScheduled) {
      sendCancelScheduledEmail({ userId, endsAt: result.data.endsAt }).catch(() => {});
    }
  }

  return result;
}

export async function resumeSubscription({
  userId,
  now = new Date(),
}: {
  userId: string;
  now?: Date;
}): Promise<ActionResult<{ subscriptionId: string; cancelAtPeriodEnd: boolean }>> {
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT id FROM ${billingSubscriptions} WHERE user_id = ${userId} FOR UPDATE`,
    );

    const subscription = await tx.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, userId),
    });

    if (!subscription) {
      return { ok: false, error: 'Subscription not found', code: 'NOT_FOUND' } as const;
    }

    if (subscription.status === 'ended') {
      return { ok: false, error: 'Subscription already ended', code: 'SUBSCRIPTION_ENDED' } as const;
    }

    const windowEndsAt =
      subscription.status === 'trialing' ? subscription.trialEndsAt : subscription.currentPeriodEndsAt;

    if (!windowEndsAt || now >= windowEndsAt) {
      return { ok: false, error: 'Subscription is not active', code: 'NOT_ACTIVE' } as const;
    }

    if (!subscription.cancelAtPeriodEnd) {
      return {
        ok: true,
        data: { subscriptionId: subscription.id, cancelAtPeriodEnd: false },
      } as const;
    }

    await tx
      .update(billingSubscriptions)
      .set({
        cancelAtPeriodEnd: false,
        updatedAt: now,
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    await appendBillingEvent(
      {
        source: 'system',
        type: 'cancel_reverted',
        userId,
        entityType: 'subscription',
        entityId: subscription.id,
      },
      tx,
    );

    return {
      ok: true,
      data: { subscriptionId: subscription.id, cancelAtPeriodEnd: false },
    } as const;
  });

  if (result.ok) {
    revalidateBillingStatus(userId);
  }

  return result;
}

export async function redeemPromotionForUser({
  userId,
  promoCode,
  now = new Date(),
}: {
  userId: string;
  promoCode: string;
  now?: Date;
}): Promise<
  ActionResult<{
    promotionId: string;
    redemptionId?: string;
    overrideId?: string;
    startsAt?: Date;
    endsAt?: Date;
    noExtension?: boolean;
    alreadyRedeemed?: boolean;
  }>
> {
  const hashes = hashPromoCodeAllVersions(promoCode);

  const result = await db.transaction(async (tx) => {
    const hashValues = hashes.map((entry) => entry.hash);
    const hashList = sql.join(hashValues.map((hash) => sql`${hash}`), sql`, `);

    await tx.execute(sql`
      SELECT id FROM ${billingPromotions}
      WHERE ${billingPromotions.codeHash} IN (${hashList})
      FOR UPDATE
    `);

    const promotion = await tx.query.billingPromotions.findFirst({
      where: inArray(billingPromotions.codeHash, hashValues),
    });

    if (!promotion) {
      return { ok: false, error: 'Promotion not found', code: 'PROMO_NOT_FOUND' } as const;
    }

    if (!promotion.isActive || !isWithinWindow({ now, startsAt: promotion.validFrom, endsAt: promotion.validTo })) {
      return { ok: false, error: 'Promotion is not active', code: 'PROMO_INACTIVE' } as const;
    }

    if (promotion.maxRedemptions !== null && promotion.redemptionCount >= promotion.maxRedemptions) {
      return { ok: false, error: 'Promotion has reached its cap', code: 'PROMO_MAX_REDEMPTIONS' } as const;
    }

    const [redemption] = await tx
      .insert(billingPromotionRedemptions)
      .values({
        promotionId: promotion.id,
        userId,
        redeemedAt: now,
        createdAt: now,
      })
      .onConflictDoNothing({
        target: [billingPromotionRedemptions.promotionId, billingPromotionRedemptions.userId],
      })
      .returning({ id: billingPromotionRedemptions.id });

    if (!redemption) {
      return {
        ok: true,
        data: { promotionId: promotion.id, alreadyRedeemed: true },
      } as const;
    }

    await tx
      .update(billingPromotions)
      .set({
        redemptionCount: sql`${billingPromotions.redemptionCount} + 1`,
        updatedAt: now,
      })
      .where(eq(billingPromotions.id, promotion.id));

    const entitlement = await getProEntitlementForUser({
      userId,
      isInternal: false,
      now,
      tx,
    });

    const grantWindow = computeGrantWindow({
      now,
      currentProUntil: entitlement.proUntil,
      grantDurationDays: promotion.grantDurationDays,
      grantFixedEndsAt: promotion.grantFixedEndsAt,
    });

    if (grantWindow.noExtension) {
      await appendBillingEvent(
        {
          source: 'system',
          type: 'promotion_redeemed',
          userId,
          entityType: 'promotion',
          entityId: promotion.id,
          payload: {
            promotionId: promotion.id,
            redemptionId: redemption.id,
            noExtension: true,
          },
        },
        tx,
      );

      return {
        ok: true,
        data: {
          promotionId: promotion.id,
          redemptionId: redemption.id,
          noExtension: true,
        },
      } as const;
    }

    const [override] = await tx
      .insert(billingEntitlementOverrides)
      .values({
        userId,
        entitlementKey: BILLING_ENTITLEMENT_KEY,
        startsAt: grantWindow.startsAt,
        endsAt: grantWindow.endsAt,
        sourceType: 'promotion',
        sourceId: promotion.id,
        metadataJson: {
          promotionId: promotion.id,
          redemptionId: redemption.id,
        },
        createdAt: now,
      })
      .returning({ id: billingEntitlementOverrides.id });

    await appendBillingEvent(
      {
        source: 'system',
        type: 'promotion_redeemed',
        userId,
        entityType: 'promotion',
        entityId: promotion.id,
        payload: {
          promotionId: promotion.id,
          redemptionId: redemption.id,
          overrideId: override.id,
          startsAt: grantWindow.startsAt.toISOString(),
          endsAt: grantWindow.endsAt.toISOString(),
        },
      },
      tx,
    );

    return {
      ok: true,
      data: {
        promotionId: promotion.id,
        redemptionId: redemption.id,
        overrideId: override.id,
        startsAt: grantWindow.startsAt,
        endsAt: grantWindow.endsAt,
      },
    } as const;
  });

  if (result.ok) {
    revalidateBillingStatus(userId);
  }

  return result;
}

export async function createPromotion({
  createdByUserId,
  name,
  description,
  grantDurationDays,
  grantFixedEndsAt,
  validFrom,
  validTo,
  maxRedemptions,
  perUserMaxRedemptions = 1,
  isActive = true,
  now = new Date(),
}: {
  createdByUserId: string;
  name?: string | null;
  description?: string | null;
  grantDurationDays?: number | null;
  grantFixedEndsAt?: Date | null;
  validFrom?: Date | null;
  validTo?: Date | null;
  maxRedemptions?: number | null;
  perUserMaxRedemptions?: number | null;
  isActive?: boolean;
  now?: Date;
}): Promise<ActionResult<{ promotionId: string; code: string }>> {
  if (perUserMaxRedemptions !== 1) {
    return {
      ok: false,
      error: 'Per-user max redemptions must be 1 in V1',
      code: 'INVALID_PER_USER_LIMIT',
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generatePromoCode();
    const { hash, version } = hashPromoCode(code);
    const codePrefix = getPromoCodePrefix(code);

    try {
      const promotion = await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(billingPromotions)
          .values({
            hashVersion: version,
            codeHash: hash,
            codePrefix,
            name: name ?? null,
            description: description ?? null,
            entitlementKey: BILLING_ENTITLEMENT_KEY,
            grantDurationDays: grantDurationDays ?? null,
            grantFixedEndsAt: grantFixedEndsAt ?? null,
            isActive,
            validFrom: validFrom ?? null,
            validTo: validTo ?? null,
            maxRedemptions: maxRedemptions ?? null,
            perUserMaxRedemptions,
            redemptionCount: 0,
            createdByUserId,
            createdAt: now,
            updatedAt: now,
          })
          .returning({ id: billingPromotions.id });

        await appendBillingEvent(
          {
            source: 'admin',
            type: 'promotion_created',
            userId: createdByUserId,
            entityType: 'promotion',
            entityId: created.id,
            payload: {
              promotionId: created.id,
              createdByUserId,
              codePrefix,
              hashVersion: version,
              grantDurationDays: grantDurationDays ?? null,
              grantFixedEndsAt: grantFixedEndsAt ? grantFixedEndsAt.toISOString() : null,
              validFrom: validFrom ? validFrom.toISOString() : null,
              validTo: validTo ? validTo.toISOString() : null,
              maxRedemptions: maxRedemptions ?? null,
              isActive,
            },
          },
          tx,
        );

        return created;
      });

      return { ok: true, data: { promotionId: promotion.id, code } };
    } catch (error) {
      if (isUniqueViolation(error) && attempt < 4) {
        continue;
      }
      throw error;
    }
  }

  return { ok: false, error: 'Failed to generate promo code', code: 'CODE_GENERATION_FAILED' };
}

export async function disablePromotion({
  promotionId,
  disabledByUserId,
  now = new Date(),
}: {
  promotionId: string;
  disabledByUserId: string;
  now?: Date;
}): Promise<ActionResult<{ promotionId: string; alreadyDisabled: boolean }>> {
  return db.transaction(async (tx) => {
    const promotion = await tx.query.billingPromotions.findFirst({
      where: eq(billingPromotions.id, promotionId),
    });

    if (!promotion) {
      return { ok: false, error: 'Promotion not found', code: 'NOT_FOUND' } as const;
    }

    if (!promotion.isActive) {
      return { ok: true, data: { promotionId, alreadyDisabled: true } } as const;
    }

    await tx
      .update(billingPromotions)
      .set({ isActive: false, updatedAt: now })
      .where(eq(billingPromotions.id, promotionId));

    await appendBillingEvent(
      {
        source: 'admin',
        type: 'promotion_disabled',
        userId: disabledByUserId,
        entityType: 'promotion',
        entityId: promotionId,
        payload: {
          promotionId,
          disabledByUserId,
        },
      },
      tx,
    );

    return { ok: true, data: { promotionId, alreadyDisabled: false } } as const;
  });
}

export async function enablePromotion({
  promotionId,
  enabledByUserId,
  now = new Date(),
}: {
  promotionId: string;
  enabledByUserId: string;
  now?: Date;
}): Promise<ActionResult<{ promotionId: string; alreadyEnabled: boolean }>> {
  return db.transaction(async (tx) => {
    const promotion = await tx.query.billingPromotions.findFirst({
      where: eq(billingPromotions.id, promotionId),
    });

    if (!promotion) {
      return { ok: false, error: 'Promotion not found', code: 'NOT_FOUND' } as const;
    }

    if (promotion.isActive) {
      return { ok: true, data: { promotionId, alreadyEnabled: true } } as const;
    }

    await tx
      .update(billingPromotions)
      .set({ isActive: true, updatedAt: now })
      .where(eq(billingPromotions.id, promotionId));

    await appendBillingEvent(
      {
        source: 'admin',
        type: 'promotion_enabled',
        userId: enabledByUserId,
        entityType: 'promotion',
        entityId: promotionId,
        payload: {
          promotionId,
          enabledByUserId,
        },
      },
      tx,
    );

    return { ok: true, data: { promotionId, alreadyEnabled: false } } as const;
  });
}

export async function createPendingEntitlementGrant({
  email,
  createdByUserId,
  grantDurationDays,
  grantFixedEndsAt,
  claimValidFrom,
  claimValidTo,
  isActive = true,
  now = new Date(),
}: {
  email: string;
  createdByUserId: string;
  grantDurationDays?: number | null;
  grantFixedEndsAt?: Date | null;
  claimValidFrom?: Date | null;
  claimValidTo?: Date | null;
  isActive?: boolean;
  now?: Date;
}): Promise<ActionResult<{ pendingGrantId: string }>> {
  const latest = getLatestBillingHashSecret();
  const hashes = hashEmailAllVersions(email);
  const current = hashes.find((entry) => entry.version === latest.version);

  if (!current) {
    return { ok: false, error: 'Billing hash secret missing', code: 'HASH_SECRET_MISSING' };
  }

  return db.transaction(async (tx) => {
    const [pendingGrant] = await tx
      .insert(billingPendingEntitlementGrants)
      .values({
        hashVersion: current.version,
        emailHash: current.hash,
        entitlementKey: BILLING_ENTITLEMENT_KEY,
        grantDurationDays: grantDurationDays ?? null,
        grantFixedEndsAt: grantFixedEndsAt ?? null,
        isActive,
        claimValidFrom: claimValidFrom ?? null,
        claimValidTo: claimValidTo ?? null,
        createdByUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: billingPendingEntitlementGrants.id });

    await appendBillingEvent(
      {
        source: 'admin',
        type: 'pending_grant_created',
        userId: createdByUserId,
        entityType: 'pending_grant',
        entityId: pendingGrant.id,
        payload: {
          pendingGrantId: pendingGrant.id,
          createdByUserId,
          hashVersion: current.version,
          grantDurationDays: grantDurationDays ?? null,
          grantFixedEndsAt: grantFixedEndsAt ? grantFixedEndsAt.toISOString() : null,
          claimValidFrom: claimValidFrom ? claimValidFrom.toISOString() : null,
          claimValidTo: claimValidTo ? claimValidTo.toISOString() : null,
          isActive,
        },
      },
      tx,
    );

    return { ok: true, data: { pendingGrantId: pendingGrant.id } } as const;
  });
}

export async function disablePendingEntitlementGrant({
  pendingGrantId,
  disabledByUserId,
  now = new Date(),
}: {
  pendingGrantId: string;
  disabledByUserId: string;
  now?: Date;
}): Promise<ActionResult<{ pendingGrantId: string; alreadyDisabled: boolean }>> {
  return db.transaction(async (tx) => {
    const pendingGrant = await tx.query.billingPendingEntitlementGrants.findFirst({
      where: eq(billingPendingEntitlementGrants.id, pendingGrantId),
    });

    if (!pendingGrant) {
      return { ok: false, error: 'Pending grant not found', code: 'NOT_FOUND' } as const;
    }

    if (!pendingGrant.isActive) {
      return { ok: true, data: { pendingGrantId, alreadyDisabled: true } } as const;
    }

    await tx
      .update(billingPendingEntitlementGrants)
      .set({ isActive: false, updatedAt: now })
      .where(eq(billingPendingEntitlementGrants.id, pendingGrantId));

    await appendBillingEvent(
      {
        source: 'admin',
        type: 'pending_grant_disabled',
        userId: disabledByUserId,
        entityType: 'pending_grant',
        entityId: pendingGrantId,
        payload: {
          pendingGrantId,
          disabledByUserId,
        },
      },
      tx,
    );

    return { ok: true, data: { pendingGrantId, alreadyDisabled: false } } as const;
  });
}

export async function enablePendingEntitlementGrant({
  pendingGrantId,
  enabledByUserId,
  now = new Date(),
}: {
  pendingGrantId: string;
  enabledByUserId: string;
  now?: Date;
}): Promise<ActionResult<{ pendingGrantId: string; alreadyEnabled: boolean }>> {
  return db.transaction(async (tx) => {
    const pendingGrant = await tx.query.billingPendingEntitlementGrants.findFirst({
      where: eq(billingPendingEntitlementGrants.id, pendingGrantId),
    });

    if (!pendingGrant) {
      return { ok: false, error: 'Pending grant not found', code: 'NOT_FOUND' } as const;
    }

    if (pendingGrant.isActive) {
      return { ok: true, data: { pendingGrantId, alreadyEnabled: true } } as const;
    }

    await tx
      .update(billingPendingEntitlementGrants)
      .set({ isActive: true, updatedAt: now })
      .where(eq(billingPendingEntitlementGrants.id, pendingGrantId));

    await appendBillingEvent(
      {
        source: 'admin',
        type: 'pending_grant_enabled',
        userId: enabledByUserId,
        entityType: 'pending_grant',
        entityId: pendingGrantId,
        payload: {
          pendingGrantId,
          enabledByUserId,
        },
      },
      tx,
    );

    return { ok: true, data: { pendingGrantId, alreadyEnabled: false } } as const;
  });
}

export async function claimPendingEntitlementGrantsForUser({
  userId,
  email,
  claimSource,
  now = new Date(),
}: {
  userId: string;
  email: string;
  claimSource: 'auto_on_verified_session' | 'manual_claim';
  now?: Date;
}): Promise<
  ActionResult<{
    claimedCount: number;
    overridesCreated: number;
    noExtensionCount: number;
  }>
> {
  const hashes = hashEmailAllVersions(email);
  const hashValues = hashes.map((entry) => entry.hash);

  const result = await db.transaction(async (tx) => {
    const hashList = sql.join(hashValues.map((hash) => sql`${hash}`), sql`, `);

    await tx.execute(sql`
      SELECT id FROM ${billingPendingEntitlementGrants}
      WHERE ${billingPendingEntitlementGrants.emailHash} IN (${hashList})
        AND ${billingPendingEntitlementGrants.isActive} = true
        AND ${billingPendingEntitlementGrants.claimedAt} IS NULL
      FOR UPDATE
    `);

    const pendingGrants = await tx.query.billingPendingEntitlementGrants.findMany({
      where: and(
        inArray(billingPendingEntitlementGrants.emailHash, hashValues),
        eq(billingPendingEntitlementGrants.isActive, true),
        isNull(billingPendingEntitlementGrants.claimedAt),
        eq(billingPendingEntitlementGrants.entitlementKey, BILLING_ENTITLEMENT_KEY),
        or(
          isNull(billingPendingEntitlementGrants.claimValidFrom),
          lt(billingPendingEntitlementGrants.claimValidFrom, now),
          eq(billingPendingEntitlementGrants.claimValidFrom, now),
        ),
        or(
          isNull(billingPendingEntitlementGrants.claimValidTo),
          gt(billingPendingEntitlementGrants.claimValidTo, now),
        ),
      ),
      orderBy: (table, { asc }) => [asc(table.createdAt)],
    });

    if (pendingGrants.length === 0) {
      return { ok: true, data: { claimedCount: 0, overridesCreated: 0, noExtensionCount: 0 } } as const;
    }

    let claimedCount = 0;
    let overridesCreated = 0;
    let noExtensionCount = 0;

    let currentProUntil = (await getProEntitlementForUser({
      userId,
      isInternal: false,
      now,
      tx,
    })).proUntil;

    for (const grant of pendingGrants) {
      const [updated] = await tx
        .update(billingPendingEntitlementGrants)
        .set({
          claimedAt: now,
          claimedByUserId: userId,
          claimSource,
          updatedAt: now,
        })
        .where(
          and(
            eq(billingPendingEntitlementGrants.id, grant.id),
            isNull(billingPendingEntitlementGrants.claimedAt),
          ),
        )
        .returning({ id: billingPendingEntitlementGrants.id });

      if (!updated) {
        continue;
      }

      claimedCount += 1;

      const grantWindow = computeGrantWindow({
        now,
        currentProUntil,
        grantDurationDays: grant.grantDurationDays,
        grantFixedEndsAt: grant.grantFixedEndsAt,
      });

      if (grantWindow.noExtension) {
        noExtensionCount += 1;
        await appendBillingEvent(
          {
            source: 'system',
            type: 'pending_grant_claimed',
            userId,
            entityType: 'pending_grant',
            entityId: grant.id,
            payload: {
              pendingGrantId: grant.id,
              noExtension: true,
            },
          },
          tx,
        );
        continue;
      }

      const [override] = await tx
        .insert(billingEntitlementOverrides)
        .values({
          userId,
          entitlementKey: BILLING_ENTITLEMENT_KEY,
          startsAt: grantWindow.startsAt,
          endsAt: grantWindow.endsAt,
          sourceType: 'pending_grant',
          sourceId: grant.id,
          metadataJson: {
            pendingGrantId: grant.id,
          },
          createdAt: now,
        })
        .returning({ id: billingEntitlementOverrides.id });

      overridesCreated += 1;
      if (!currentProUntil || grantWindow.endsAt > currentProUntil) {
        currentProUntil = grantWindow.endsAt;
      }

      await appendBillingEvent(
        {
          source: 'system',
          type: 'pending_grant_claimed',
          userId,
          entityType: 'pending_grant',
          entityId: grant.id,
          payload: {
            pendingGrantId: grant.id,
            overrideId: override.id,
            startsAt: grantWindow.startsAt.toISOString(),
            endsAt: grantWindow.endsAt.toISOString(),
          },
        },
        tx,
      );
    }

    return { ok: true, data: { claimedCount, overridesCreated, noExtensionCount } } as const;
  });

  if (result.ok && result.data.claimedCount > 0) {
    revalidateBillingStatus(userId);
  }

  return result;
}

async function upsertAdminOverride({
  userId,
  grantedByUserId,
  grantDurationDays,
  grantFixedEndsAt,
  reason,
  eventType,
  now,
}: {
  userId: string;
  grantedByUserId: string;
  grantDurationDays?: number | null;
  grantFixedEndsAt?: Date | null;
  reason: string;
  eventType: BillingEventType;
  now: Date;
}): Promise<ActionResult<{ overrideId?: string; startsAt?: Date; endsAt?: Date; noExtension?: boolean }>> {
  const result = await db.transaction(async (tx) => {
    const entitlement = await getProEntitlementForUser({
      userId,
      isInternal: false,
      now,
      tx,
    });

    const grantWindow = computeGrantWindow({
      now,
      currentProUntil: entitlement.proUntil,
      grantDurationDays,
      grantFixedEndsAt,
    });

    if (grantWindow.noExtension) {
      await appendBillingEvent(
        {
          source: 'admin',
          type: eventType,
          userId,
          entityType: 'override',
          entityId: null,
          payload: {
            noExtension: true,
            grantedByUserId,
            reason,
            grantDurationDays: grantDurationDays ?? null,
            grantFixedEndsAt: grantFixedEndsAt ? grantFixedEndsAt.toISOString() : null,
            startsAt: grantWindow.startsAt.toISOString(),
            endsAt: grantWindow.endsAt.toISOString(),
          },
        },
        tx,
      );
      return { ok: true, data: { noExtension: true } } as const;
    }

    const [override] = await tx
      .insert(billingEntitlementOverrides)
      .values({
        userId,
        entitlementKey: BILLING_ENTITLEMENT_KEY,
        startsAt: grantWindow.startsAt,
        endsAt: grantWindow.endsAt,
        sourceType: 'admin',
        sourceId: null,
        reason,
        grantedByUserId,
        metadataJson: { reason },
        createdAt: now,
      })
      .returning({ id: billingEntitlementOverrides.id });

    await appendBillingEvent(
      {
        source: 'admin',
        type: eventType,
        userId,
        entityType: 'override',
        entityId: override.id,
        payload: {
          overrideId: override.id,
          grantedByUserId,
          reason,
          grantDurationDays: grantDurationDays ?? null,
          grantFixedEndsAt: grantFixedEndsAt ? grantFixedEndsAt.toISOString() : null,
          startsAt: grantWindow.startsAt.toISOString(),
          endsAt: grantWindow.endsAt.toISOString(),
        },
      },
      tx,
    );

    return {
      ok: true,
      data: { overrideId: override.id, startsAt: grantWindow.startsAt, endsAt: grantWindow.endsAt },
    } as const;
  });

  if (result.ok) {
    revalidateBillingStatus(userId);
  }

  return result;
}

export async function grantAdminOverride(params: {
  userId: string;
  grantedByUserId: string;
  grantDurationDays?: number | null;
  grantFixedEndsAt?: Date | null;
  reason: string;
  now?: Date;
}) {
  return upsertAdminOverride({ ...params, eventType: 'override_granted', now: params.now ?? new Date() });
}

export async function extendAdminOverride(params: {
  userId: string;
  grantedByUserId: string;
  grantDurationDays?: number | null;
  grantFixedEndsAt?: Date | null;
  reason: string;
  now?: Date;
}) {
  return upsertAdminOverride({ ...params, eventType: 'override_extended', now: params.now ?? new Date() });
}

export async function revokeAdminOverride({
  overrideId,
  revokedByUserId,
  now = new Date(),
}: {
  overrideId: string;
  revokedByUserId: string;
  now?: Date;
}): Promise<ActionResult<{ overrideId: string; alreadyRevoked: boolean }>> {
  let affectedUserId: string | null = null;

  const result = await db.transaction(async (tx) => {
    const override = await tx.query.billingEntitlementOverrides.findFirst({
      where: eq(billingEntitlementOverrides.id, overrideId),
    });

    if (!override) {
      return { ok: false, error: 'Override not found', code: 'NOT_FOUND' } as const;
    }

    affectedUserId = override.userId;
    const previousEndsAt = override.endsAt;
    const previousStartsAt = override.startsAt;

    if (override.endsAt <= now) {
      return { ok: true, data: { overrideId, alreadyRevoked: true } } as const;
    }

    if (override.startsAt >= now) {
      return { ok: false, error: 'Override has not started yet', code: 'INVALID_STATE' } as const;
    }

    await tx
      .update(billingEntitlementOverrides)
      .set({ endsAt: now })
      .where(eq(billingEntitlementOverrides.id, overrideId));

    await appendBillingEvent(
      {
        source: 'admin',
        type: 'override_revoked',
        userId: override.userId,
        entityType: 'override',
        entityId: overrideId,
        payload: {
          overrideId,
          revokedByUserId,
          startsAt: previousStartsAt.toISOString(),
          previousEndsAt: previousEndsAt.toISOString(),
          endsAt: now.toISOString(),
        },
      },
      tx,
    );

    return { ok: true, data: { overrideId, alreadyRevoked: false } } as const;
  });

  if (result.ok && affectedUserId) {
    revalidateBillingStatus(affectedUserId);
  }

  return result;
}
