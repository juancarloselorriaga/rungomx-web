import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/db';
import { billingSubscriptions } from '@/db/schema';
import { safeRevalidateTag } from '@/lib/next-cache';
import type { CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';

import { billingStatusTag } from './cache-tags';

const DAY_MS = 24 * 60 * 60 * 1000;
export const BILLING_GRACE_PERIOD_DAYS = 7;

type TransitionResult<T> =
  | { ok: true; data: T }
  | {
      ok: false;
      code:
        | 'INVALID_RENEWAL_ATTEMPT'
        | 'INVALID_GRACE_WINDOW'
        | 'SUBSCRIPTION_NOT_FOUND'
        | 'SUBSCRIPTION_NOT_ELIGIBLE_FOR_GRACE'
        | 'GRACE_TRANSITION_PERSIST_FAILED';
      error: string;
    };

export type GraceWindow = {
  graceStartedAt: Date;
  graceEndsAt: Date;
};

export type GraceTransitionResult = {
  subscriptionId: string;
  userId: string;
  previousStatus: 'active' | 'grace';
  status: 'grace';
  graceStartedAt: Date;
  graceEndsAt: Date;
  renewalAttempt: number;
  applied: boolean;
};

function normalizeRenewalAttempt(renewalAttempt: number): number | null {
  if (!Number.isInteger(renewalAttempt)) return null;
  return renewalAttempt > 0 ? renewalAttempt : null;
}

function revalidateBillingStatus(userId: string) {
  safeRevalidateTag(billingStatusTag(userId), { expire: 0 });
}

export function deriveRenewalFailureGraceWindow(params: {
  occurredAt: Date;
  gracePeriodDays?: number;
}): GraceWindow {
  const gracePeriodDays =
    params.gracePeriodDays && params.gracePeriodDays > 0
      ? Math.trunc(params.gracePeriodDays)
      : BILLING_GRACE_PERIOD_DAYS;
  const graceStartedAt = new Date(params.occurredAt.getTime());
  const graceEndsAt = new Date(graceStartedAt.getTime() + gracePeriodDays * DAY_MS);
  return { graceStartedAt, graceEndsAt };
}

export async function transitionSubscriptionToGraceOnRenewalFailure(params: {
  userId: string;
  subscriptionId: string;
  renewalAttempt: number;
  graceEndsAt: Date;
  now?: Date;
}): Promise<TransitionResult<GraceTransitionResult>> {
  const renewalAttempt = normalizeRenewalAttempt(params.renewalAttempt);
  if (!renewalAttempt) {
    return {
      ok: false,
      code: 'INVALID_RENEWAL_ATTEMPT',
      error: 'Renewal attempt must be an integer greater than zero.',
    };
  }

  const now = params.now ?? new Date();
  const incomingGraceEndsAt = new Date(params.graceEndsAt.getTime());
  if (!Number.isFinite(incomingGraceEndsAt.getTime()) || incomingGraceEndsAt <= now) {
    return {
      ok: false,
      code: 'INVALID_GRACE_WINDOW',
      error: 'Grace expiration must be a valid timestamp after transition time.',
    };
  }

  const result = await db.transaction(async (tx): Promise<TransitionResult<GraceTransitionResult>> => {
    await tx.execute(
      sql`SELECT id FROM ${billingSubscriptions} WHERE id = ${params.subscriptionId} FOR UPDATE`,
    );

    const subscription = await tx.query.billingSubscriptions.findFirst({
      where: and(
        eq(billingSubscriptions.id, params.subscriptionId),
        eq(billingSubscriptions.userId, params.userId),
      ),
      columns: {
        id: true,
        userId: true,
        status: true,
        currentPeriodStartsAt: true,
        currentPeriodEndsAt: true,
      },
    });

    if (!subscription) {
      return {
        ok: false as const,
        code: 'SUBSCRIPTION_NOT_FOUND' as const,
        error: 'Subscription not found for renewal failure transition.',
      };
    }

    if (subscription.status !== 'active' && subscription.status !== 'grace') {
      return {
        ok: false as const,
        code: 'SUBSCRIPTION_NOT_ELIGIBLE_FOR_GRACE' as const,
        error: 'Only active or grace subscriptions can process renewal failure transitions.',
      };
    }

    const previousStatus = subscription.status;
    const existingGraceStartedAt = subscription.currentPeriodStartsAt;
    const existingGraceEndsAt = subscription.currentPeriodEndsAt;

    if (
      previousStatus === 'grace' &&
      existingGraceStartedAt &&
      existingGraceEndsAt &&
      existingGraceEndsAt.getTime() >= incomingGraceEndsAt.getTime()
    ) {
      return {
        ok: true as const,
        data: {
          subscriptionId: subscription.id,
          userId: subscription.userId,
          previousStatus,
          status: 'grace' as const,
          graceStartedAt: existingGraceStartedAt,
          graceEndsAt: existingGraceEndsAt,
          renewalAttempt,
          applied: false,
        },
      };
    }

    const graceStartedAt =
      previousStatus === 'grace' && existingGraceStartedAt ? existingGraceStartedAt : now;
    const graceEndsAt =
      previousStatus === 'grace' && existingGraceEndsAt && existingGraceEndsAt > incomingGraceEndsAt
        ? existingGraceEndsAt
        : incomingGraceEndsAt;

    const [updated] = await tx
      .update(billingSubscriptions)
      .set({
        status: 'grace',
        currentPeriodStartsAt: graceStartedAt,
        currentPeriodEndsAt: graceEndsAt,
        endedAt: null,
        updatedAt: now,
      })
      .where(eq(billingSubscriptions.id, subscription.id))
      .returning({
        id: billingSubscriptions.id,
        userId: billingSubscriptions.userId,
        status: billingSubscriptions.status,
        currentPeriodStartsAt: billingSubscriptions.currentPeriodStartsAt,
        currentPeriodEndsAt: billingSubscriptions.currentPeriodEndsAt,
      });

    if (!updated || updated.status !== 'grace' || !updated.currentPeriodStartsAt || !updated.currentPeriodEndsAt) {
      return {
        ok: false as const,
        code: 'GRACE_TRANSITION_PERSIST_FAILED' as const,
        error: 'Grace transition failed to persist deterministic window metadata.',
      };
    }

    return {
      ok: true as const,
      data: {
        subscriptionId: updated.id,
        userId: updated.userId,
        previousStatus,
        status: 'grace' as const,
        graceStartedAt: updated.currentPeriodStartsAt,
        graceEndsAt: updated.currentPeriodEndsAt,
        renewalAttempt,
        applied: true,
      },
    };
  });

  if (result.ok && result.data.applied) {
    revalidateBillingStatus(result.data.userId);
  }

  return result;
}

export async function transitionSubscriptionToGraceFromRenewalFailedEvent(params: {
  event: Extract<CanonicalMoneyEventV1, { eventName: 'subscription.renewal_failed' }>;
  now?: Date;
}): Promise<TransitionResult<GraceTransitionResult>> {
  const occurredAt = new Date(params.event.occurredAt);
  const graceEndsAt = new Date(params.event.payload.graceEndsAt);

  if (!Number.isFinite(occurredAt.getTime()) || !Number.isFinite(graceEndsAt.getTime())) {
    return {
      ok: false,
      code: 'INVALID_GRACE_WINDOW',
      error: 'Renewal-failed event must include valid occurredAt and graceEndsAt timestamps.',
    };
  }

  return transitionSubscriptionToGraceOnRenewalFailure({
    userId: params.event.payload.organizerId,
    subscriptionId: params.event.payload.subscriptionId,
    renewalAttempt: params.event.payload.renewalAttempt,
    graceEndsAt,
    now: params.now ?? occurredAt,
  });
}
