import { eq } from 'drizzle-orm';

import { billingSubscriptions } from '@/db/schema';
import { transitionSubscriptionToGraceOnRenewalFailure } from '@/lib/billing/lifecycle';
import { getBillingStatusForUser } from '@/lib/billing/queries';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';

describe('billing lifecycle renewal failure transition (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  it('persists grace start/end timestamps and keeps Pro access active during grace', async () => {
    const now = new Date('2026-02-25T20:00:00.000Z');
    const graceEndsAt = new Date('2026-03-04T20:00:00.000Z');
    const user = await createTestUser(testDb, { emailVerified: true });

    const [subscription] = await testDb
      .insert(billingSubscriptions)
      .values({
        userId: user.id,
        planKey: 'pro',
        status: 'active',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStartsAt: new Date('2026-01-25T20:00:00.000Z'),
        currentPeriodEndsAt: new Date('2026-02-25T19:59:59.000Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        createdAt: new Date('2026-01-25T20:00:00.000Z'),
        updatedAt: new Date('2026-01-25T20:00:00.000Z'),
      })
      .returning({ id: billingSubscriptions.id });

    const transition = await transitionSubscriptionToGraceOnRenewalFailure({
      userId: user.id,
      subscriptionId: subscription.id,
      renewalAttempt: 1,
      graceEndsAt,
      now,
    });

    if (!transition.ok) {
      throw new Error(`Expected successful grace transition, got ${transition.code}`);
    }

    expect(transition.data.applied).toBe(true);
    expect(transition.data.status).toBe('grace');
    expect(transition.data.graceStartedAt.toISOString()).toBe(now.toISOString());
    expect(transition.data.graceEndsAt.toISOString()).toBe(graceEndsAt.toISOString());

    const [row] = await testDb
      .select({
        status: billingSubscriptions.status,
        currentPeriodStartsAt: billingSubscriptions.currentPeriodStartsAt,
        currentPeriodEndsAt: billingSubscriptions.currentPeriodEndsAt,
        endedAt: billingSubscriptions.endedAt,
      })
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.id, subscription.id));

    expect(row?.status).toBe('grace');
    expect(row?.currentPeriodStartsAt?.toISOString()).toBe(now.toISOString());
    expect(row?.currentPeriodEndsAt?.toISOString()).toBe(graceEndsAt.toISOString());
    expect(row?.endedAt).toBeNull();

    const entitlementNow = new Date('2026-02-26T08:00:00.000Z');
    const billingStatus = await getBillingStatusForUser({
      userId: user.id,
      isInternal: false,
      now: entitlementNow,
    });

    expect(billingStatus.isPro).toBe(true);
    expect(billingStatus.effectiveSource).toBe('subscription');
    expect(billingStatus.subscription?.status).toBe('grace');
    expect(billingStatus.proUntil?.toISOString()).toBe(graceEndsAt.toISOString());
  });

  it('handles repeated renewal-failure transitions idempotently for the same grace window', async () => {
    const now = new Date('2026-02-25T20:00:00.000Z');
    const graceEndsAt = new Date('2026-03-04T20:00:00.000Z');
    const user = await createTestUser(testDb, { emailVerified: true });

    const [subscription] = await testDb
      .insert(billingSubscriptions)
      .values({
        userId: user.id,
        planKey: 'pro',
        status: 'active',
        trialStartsAt: null,
        trialEndsAt: null,
        currentPeriodStartsAt: new Date('2026-01-25T20:00:00.000Z'),
        currentPeriodEndsAt: new Date('2026-02-25T19:59:59.000Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
      })
      .returning({ id: billingSubscriptions.id });

    const first = await transitionSubscriptionToGraceOnRenewalFailure({
      userId: user.id,
      subscriptionId: subscription.id,
      renewalAttempt: 1,
      graceEndsAt,
      now,
    });

    if (!first.ok) {
      throw new Error(`Expected first transition to succeed, got ${first.code}`);
    }

    const second = await transitionSubscriptionToGraceOnRenewalFailure({
      userId: user.id,
      subscriptionId: subscription.id,
      renewalAttempt: 2,
      graceEndsAt: new Date('2026-03-04T18:00:00.000Z'),
      now: new Date('2026-02-25T20:10:00.000Z'),
    });

    if (!second.ok) {
      throw new Error(`Expected idempotent duplicate transition, got ${second.code}`);
    }

    expect(first.data.applied).toBe(true);
    expect(second.data.applied).toBe(false);
    expect(second.data.status).toBe('grace');
    expect(second.data.graceEndsAt.toISOString()).toBe(graceEndsAt.toISOString());
  });
});
