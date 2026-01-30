'use server';

import { headers } from 'next/headers';
import { z } from 'zod';

import { getRequestContext } from '@/lib/audit';
import { withAuthenticatedUser } from '@/lib/auth/action-wrapper';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import {
  redeemPromotionForUser,
  resumeSubscription,
  scheduleCancelAtPeriodEnd,
  startTrialForUser,
} from '@/lib/billing/commands';
import { getBillingStatusForUser } from '@/lib/billing/queries';
import type { SerializableBillingStatus } from '@/lib/billing/serialization';
import { serializeBillingStatus } from '@/lib/billing/serialization';
import { type FormActionResult, validateInput } from '@/lib/forms';
import { checkRateLimit } from '@/lib/rate-limit';

type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type SerializedBillingStatus = SerializableBillingStatus;

export const getBillingStatusAction = withAuthenticatedUser<ActionResult<SerializedBillingStatus>>({
  unauthenticated: () => ({
    ok: false,
    error: 'Authentication required',
    code: 'UNAUTHENTICATED',
  }),
})(async (authContext) => {
  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' };
  }

  const status = await getBillingStatusForUser({
    userId: user.id,
    isInternal: authContext.isInternal,
  });

  return { ok: true, data: serializeBillingStatus(status) };
});

export const startTrialAction = withAuthenticatedUser<ActionResult<{ trialEndsAt: string }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext) => {
  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' };
  }

  if (authContext.isInternal) {
    return { ok: false, error: 'Internal accounts are not eligible for trials', code: 'FORBIDDEN' };
  }

  const result = await startTrialForUser({
    userId: user.id,
    isInternal: authContext.isInternal,
    emailVerified: user.emailVerified,
  });

  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  return { ok: true, data: { trialEndsAt: result.data.trialEndsAt.toISOString() } };
});

export const scheduleCancelAtPeriodEndAction = withAuthenticatedUser<ActionResult<null>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext) => {
  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' };
  }

  if (authContext.isInternal) {
    return {
      ok: false,
      error: 'Internal accounts cannot manage subscriptions',
      code: 'FORBIDDEN',
    };
  }

  const result = await scheduleCancelAtPeriodEnd({ userId: user.id });
  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  return { ok: true, data: null };
});

export const resumeSubscriptionAction = withAuthenticatedUser<ActionResult<null>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext) => {
  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' };
  }

  if (authContext.isInternal) {
    return {
      ok: false,
      error: 'Internal accounts cannot manage subscriptions',
      code: 'FORBIDDEN',
    };
  }

  const result = await resumeSubscription({ userId: user.id });
  if (!result.ok) {
    return { ok: false, error: result.error, code: result.code };
  }

  return { ok: true, data: null };
});

const redeemPromoSchema = z.object({
  code: z.string().min(1).max(64),
});

type RedeemPromoSuccess = {
  promotionId: string;
  redemptionId?: string;
  overrideId?: string;
  endsAt?: string;
  noExtension?: boolean;
  alreadyRedeemed?: boolean;
};

export const redeemPromoCodeAction = withAuthenticatedUser<FormActionResult<RedeemPromoSuccess>>({
  unauthenticated: () => ({ ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' }),
})(async (authContext, input: unknown) => {
  const validation = validateInput(redeemPromoSchema, input);
  if (!validation.success) {
    return validation.error;
  }

  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'UNAUTHENTICATED', message: 'UNAUTHENTICATED' };
  }

  if (authContext.isInternal) {
    return { ok: false, error: 'FORBIDDEN', message: 'FORBIDDEN' };
  }

  const requestContext = await getRequestContext(await headers());
  const ip = requestContext.ipAddress ?? 'unknown';

  const ipLimit = await checkRateLimit(ip, 'ip', {
    action: 'billing_promo_redeem_ip',
    maxRequests: 10,
    windowMs: 60 * 1000,
  });

  if (!ipLimit.allowed) {
    return { ok: false, error: 'RATE_LIMITED', message: 'RATE_LIMITED' };
  }

  const userLimit = await checkRateLimit(user.id, 'user', {
    action: 'billing_promo_redeem_user',
    maxRequests: 10,
    windowMs: 60 * 1000,
  });

  if (!userLimit.allowed) {
    return { ok: false, error: 'RATE_LIMITED', message: 'RATE_LIMITED' };
  }

  const result = await redeemPromotionForUser({
    userId: user.id,
    promoCode: validation.data.code,
  });

  if (!result.ok) {
    const message =
      result.code === 'PROMO_NOT_FOUND'
        ? 'PROMO_NOT_FOUND'
        : result.code === 'PROMO_INACTIVE'
          ? 'PROMO_INACTIVE'
          : result.code === 'PROMO_MAX_REDEMPTIONS'
            ? 'PROMO_MAX_REDEMPTIONS'
            : 'SERVER_ERROR';

    return {
      ok: false,
      error: result.code,
      fieldErrors: { code: [message] },
      message,
    };
  }

  return {
    ok: true,
    data: {
      promotionId: result.data.promotionId,
      redemptionId: result.data.redemptionId,
      overrideId: result.data.overrideId,
      endsAt: result.data.endsAt ? result.data.endsAt.toISOString() : undefined,
      noExtension: result.data.noExtension,
      alreadyRedeemed: result.data.alreadyRedeemed,
    },
  };
});

export const getProEntitlementAction = withAuthenticatedUser<ActionResult<{ isPro: boolean }>>({
  unauthenticated: () => ({ ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' }),
})(async (authContext) => {
  const user = authContext.user;
  if (!user) {
    return { ok: false, error: 'Authentication required', code: 'UNAUTHENTICATED' };
  }

  // Internal accounts have Pro access via bypass for feature access, but should never be treated
  // as "Pro members" for UI/billing branding.
  if (authContext.isInternal) {
    return { ok: true, data: { isPro: false } };
  }

  const entitlement = await getProEntitlementForUser({
    userId: user.id,
    isInternal: authContext.isInternal,
  });

  return { ok: true, data: { isPro: entitlement.isPro } };
});
