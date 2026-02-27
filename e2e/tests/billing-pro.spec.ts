import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestProfile,
  getUserByEmail,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsUser } from '../utils/helpers';
import { createPendingEntitlementGrant, createPromotion } from '@/lib/billing/commands';
import { runGraceReminderCadenceAndExpiryDowngrade } from '@/lib/billing/cron';
import {
  restoreSubscriptionOnRecoveryPayment,
  transitionSubscriptionToGraceOnRenewalFailure,
} from '@/lib/billing/lifecycle';
import { billingEvents, billingSubscriptions } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

let trialCreds: { email: string; password: string; name: string };
let promoCreds: { email: string; password: string; name: string };
let pendingCreds: { email: string; password: string; name: string };
let recoveryCreds: { email: string; password: string; name: string };
let promoCode = '';

async function runWithNodeEnvTest<T>(operation: () => Promise<T>): Promise<T> {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';

  try {
    return await operation();
  } finally {
    if (typeof previousNodeEnv === 'undefined') {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousNodeEnv;
    }
  }
}

test.describe('Billing Pro flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    trialCreds = await signUpTestUser(page, 'athlete-billing-trial-', {
      name: 'Billing Trial Athlete',
    });
    promoCreds = await signUpTestUser(page, 'athlete-billing-promo-', {
      name: 'Billing Promo Athlete',
    });
    pendingCreds = await signUpTestUser(page, 'athlete-billing-pending-', {
      name: 'Billing Pending Athlete',
    });
    recoveryCreds = await signUpTestUser(page, 'athlete-billing-recovery-', {
      name: 'Billing Recovery Athlete',
    });

    await Promise.all([
      setUserVerified(db, trialCreds.email),
      setUserVerified(db, promoCreds.email),
      setUserVerified(db, pendingCreds.email),
      setUserVerified(db, recoveryCreds.email),
    ]);

    const [trialUser, promoUser, pendingUser, recoveryUser] = await Promise.all([
      getUserByEmail(db, trialCreds.email),
      getUserByEmail(db, promoCreds.email),
      getUserByEmail(db, pendingCreds.email),
      getUserByEmail(db, recoveryCreds.email),
    ]);

    if (!trialUser || !promoUser || !pendingUser || !recoveryUser) {
      throw new Error('Failed to seed billing test users.');
    }

    await Promise.all([
      createTestProfile(db, trialUser.id, {
        dateOfBirth: new Date('1995-08-20'),
        gender: 'female',
        phone: '+523312300001',
        city: 'Mexico City',
        state: 'CDMX',
        emergencyContactName: 'Trial Contact',
        emergencyContactPhone: '+523312300002',
        bloodType: 'O+',
        shirtSize: 'M',
      }),
      createTestProfile(db, promoUser.id, {
        dateOfBirth: new Date('1995-08-20'),
        gender: 'female',
        phone: '+523312300101',
        city: 'Mexico City',
        state: 'CDMX',
        emergencyContactName: 'Promo Contact',
        emergencyContactPhone: '+523312300102',
        bloodType: 'O+',
        shirtSize: 'M',
      }),
      createTestProfile(db, pendingUser.id, {
        dateOfBirth: new Date('1995-08-20'),
        gender: 'female',
        phone: '+523312300201',
        city: 'Mexico City',
        state: 'CDMX',
        emergencyContactName: 'Pending Contact',
        emergencyContactPhone: '+523312300202',
        bloodType: 'O+',
        shirtSize: 'M',
      }),
      createTestProfile(db, recoveryUser.id, {
        dateOfBirth: new Date('1995-08-20'),
        gender: 'female',
        phone: '+523312300301',
        city: 'Mexico City',
        state: 'CDMX',
        emergencyContactName: 'Recovery Contact',
        emergencyContactPhone: '+523312300302',
        bloodType: 'O+',
        shirtSize: 'M',
      }),
      assignExternalRole(db, trialUser.id, 'athlete'),
      assignExternalRole(db, promoUser.id, 'athlete'),
      assignExternalRole(db, pendingUser.id, 'athlete'),
      assignExternalRole(db, recoveryUser.id, 'athlete'),
    ]);

    const promotion = await createPromotion({
      createdByUserId: trialUser.id,
      grantDurationDays: 14,
      grantFixedEndsAt: null,
      validFrom: null,
      validTo: null,
      maxRedemptions: 50,
      isActive: true,
      name: 'E2E Promo',
      description: null,
    });

    if (!promotion.ok) {
      throw new Error(promotion.error);
    }

    promoCode = promotion.data.code;

    const pendingGrant = await createPendingEntitlementGrant({
      email: pendingUser.email,
      createdByUserId: trialUser.id,
      grantDurationDays: 7,
      grantFixedEndsAt: null,
      claimValidFrom: null,
      claimValidTo: null,
      isActive: true,
    });

    if (!pendingGrant.ok) {
      throw new Error(pendingGrant.error);
    }

    await db.insert(billingSubscriptions).values({
      userId: recoveryUser.id,
      planKey: 'pro',
      status: 'active',
      trialStartsAt: null,
      trialEndsAt: null,
      currentPeriodStartsAt: new Date(Date.now() - 60 * 60 * 1000),
      currentPeriodEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      canceledAt: null,
      endedAt: null,
    });

    await context.close();
  });

  test('trial can be started, canceled, and expires after end date', async ({ page }) => {
    const db = getTestDb();

    await signInAsUser(page, trialCreds, { role: 'athlete' });
    await page.goto('/en/settings/billing');

    await page.getByTestId('billing-start-trial').click();
    await expect(page.getByTestId('billing-pro-badge')).toContainText('Pro');

    await page.getByTestId('billing-cancel-subscription').click();
    await expect(page.getByText('Canceling at period end')).toBeVisible();

    const trialUser = await getUserByEmail(db, trialCreds.email);
    if (!trialUser) {
      throw new Error('Missing trial user.');
    }

    const expiredTrialEndsAt = new Date(Date.now() - 60 * 1000);
    const expiredTrialStartsAt = new Date(expiredTrialEndsAt.getTime() - 2 * 60 * 1000);

    await db
      .update(billingSubscriptions)
      .set({ trialStartsAt: expiredTrialStartsAt, trialEndsAt: expiredTrialEndsAt })
      .where(eq(billingSubscriptions.userId, trialUser.id));

    await page.reload();
    await expect(page.getByTestId('billing-pro-badge')).toContainText('Free');
  });

  test('promo redemption extends Pro beyond trial', async ({ page }) => {
    await signInAsUser(page, promoCreds, { role: 'athlete' });
    await page.goto('/en/settings/billing');

    await page.getByTestId('billing-start-trial').click();
    await expect(page.getByTestId('billing-pro-badge')).toContainText('Pro');

    const trialUntil = await page.getByTestId('billing-pro-until').textContent();

    await page.getByTestId('billing-promo-code').fill(promoCode);
    await page.getByTestId('billing-redeem-promo').click();

    await expect(page.getByTestId('billing-pro-until')).not.toHaveText(trialUntil ?? '');
  });

  test('pending grant auto-claims after verification', async ({ page }) => {
    await signInAsUser(page, pendingCreds, { role: 'athlete' });
    await page.goto('/en/settings/billing');

    await expect(page.getByTestId('billing-pro-badge')).toContainText('Pro');
    await expect(page.getByTestId('billing-effective-source')).toContainText('Pending grant');
  });

  test('6.1-E2E-001 renewal failures transition subscriptions to grace while preserving Pro access', async ({
    page,
  }) => {
    const db = getTestDb();
    const recoveryUser = await getUserByEmail(db, recoveryCreds.email);
    if (!recoveryUser) {
      throw new Error('Missing recovery user.');
    }

    const subscription = await db.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, recoveryUser.id),
      columns: { id: true },
    });
    if (!subscription) {
      throw new Error('Missing recovery subscription.');
    }

    const transitionNow = new Date();
    const graceEndsAt = new Date(transitionNow.getTime() + 7 * 24 * 60 * 60 * 1000);
    const transition = await runWithNodeEnvTest(() =>
      transitionSubscriptionToGraceOnRenewalFailure({
        userId: recoveryUser.id,
        subscriptionId: subscription.id,
        renewalAttempt: 1,
        graceEndsAt,
        now: transitionNow,
      }),
    );

    if (!transition.ok) {
      throw new Error(`Expected grace transition, received ${transition.code}`);
    }

    expect(transition.data.status).toBe('grace');
    expect(transition.data.applied).toBe(true);
    expect(transition.data.graceStartedAt.toISOString()).toBe(transitionNow.toISOString());
    expect(transition.data.graceEndsAt.toISOString()).toBe(graceEndsAt.toISOString());

    await signInAsUser(page, recoveryCreds, { role: 'athlete' });
    await page.goto('/en/settings/billing');

    await expect(page.getByTestId('billing-pro-badge')).toContainText('Pro');
    await expect(page.getByTestId('billing-effective-source')).toContainText('Subscription');
    await expect(page.getByText('Grace', { exact: true })).toBeVisible();
  });

  test('6.2-E2E-001 grace reminders and expiry downgrades stay traceable and idempotent', async ({
    page,
  }) => {
    const db = getTestDb();
    const recoveryUser = await getUserByEmail(db, recoveryCreds.email);
    if (!recoveryUser) {
      throw new Error('Missing recovery user.');
    }

    const subscription = await db.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, recoveryUser.id),
      columns: { id: true },
    });
    if (!subscription) {
      throw new Error('Missing recovery subscription.');
    }

    const reminderNow = new Date();
    const reminderGraceEndsAt = new Date(reminderNow.getTime() + 3 * 24 * 60 * 60 * 1000);
    await db
      .update(billingSubscriptions)
      .set({
        status: 'grace',
        currentPeriodStartsAt: new Date(reminderNow.getTime() - 4 * 24 * 60 * 60 * 1000),
        currentPeriodEndsAt: reminderGraceEndsAt,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    const [firstReminder, secondReminder] = await runWithNodeEnvTest(async () => {
      const first = await runGraceReminderCadenceAndExpiryDowngrade({
        now: reminderNow,
        reminderCadenceDays: [5, 2, 1],
      });
      const second = await runGraceReminderCadenceAndExpiryDowngrade({
        now: reminderNow,
        reminderCadenceDays: [5, 2, 1],
      });
      return [first, second] as const;
    });

    expect(firstReminder).toEqual({ remindersSent: 1, downgradedSubscriptions: 0 });
    expect(secondReminder).toEqual({ remindersSent: 0, downgradedSubscriptions: 0 });

    const reminderEvents = await db
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(
        and(
          eq(billingEvents.entityId, subscription.id),
          eq(billingEvents.type, 'grace_reminder_notified'),
        ),
      );
    expect(reminderEvents).toHaveLength(1);

    const downgradeNow = new Date(reminderNow.getTime() + 5 * 24 * 60 * 60 * 1000);
    const expiredGraceEndsAt = new Date(downgradeNow.getTime() - 60 * 1000);
    await db
      .update(billingSubscriptions)
      .set({
        status: 'grace',
        currentPeriodStartsAt: new Date(expiredGraceEndsAt.getTime() - 7 * 24 * 60 * 60 * 1000),
        currentPeriodEndsAt: expiredGraceEndsAt,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
      })
      .where(eq(billingSubscriptions.id, subscription.id));

    const [firstDowngrade, secondDowngrade] = await runWithNodeEnvTest(async () => {
      const first = await runGraceReminderCadenceAndExpiryDowngrade({
        now: downgradeNow,
      });
      const second = await runGraceReminderCadenceAndExpiryDowngrade({
        now: downgradeNow,
      });
      return [first, second] as const;
    });

    expect(firstDowngrade).toEqual({ remindersSent: 0, downgradedSubscriptions: 1 });
    expect(secondDowngrade).toEqual({ remindersSent: 0, downgradedSubscriptions: 0 });

    const downgradeEvents = await db
      .select({ id: billingEvents.id })
      .from(billingEvents)
      .where(
        and(
          eq(billingEvents.entityId, subscription.id),
          eq(billingEvents.type, 'grace_expired_downgraded'),
        ),
      );
    expect(downgradeEvents).toHaveLength(1);

    await signInAsUser(page, recoveryCreds, { role: 'athlete' });
    await page.goto('/en/settings/billing');
    await expect(page.getByTestId('billing-pro-badge')).toContainText('Free');
  });

  test('6.3-E2E-001 recovery payments reactivate subscriptions and immediately restore Pro visibility', async ({
    page,
  }) => {
    const db = getTestDb();
    const recoveryUser = await getUserByEmail(db, recoveryCreds.email);
    if (!recoveryUser) {
      throw new Error('Missing recovery user.');
    }

    const subscription = await db.query.billingSubscriptions.findFirst({
      where: eq(billingSubscriptions.userId, recoveryUser.id),
      columns: { id: true },
    });
    if (!subscription) {
      throw new Error('Missing recovery subscription.');
    }

    const recoveryNow = new Date();
    const recoveredPeriodStartsAt = new Date(recoveryNow.getTime() - 10 * 60 * 1000);
    const recoveredPeriodEndsAt = new Date(recoveryNow.getTime() + 30 * 24 * 60 * 60 * 1000);

    const recovery = await runWithNodeEnvTest(() =>
      restoreSubscriptionOnRecoveryPayment({
        userId: recoveryUser.id,
        subscriptionId: subscription.id,
        paymentConfirmationId: `payment-confirmed-${Date.now()}`,
        recoveredPeriodStartsAt,
        recoveredPeriodEndsAt,
        now: recoveryNow,
      }),
    );

    if (!recovery.ok) {
      throw new Error(`Expected recovery transition, received ${recovery.code}`);
    }

    expect(recovery.data.status).toBe('active');
    expect(recovery.data.applied).toBe(true);
    expect(recovery.data.reExposedLockedData).toBe(true);

    await signInAsUser(page, recoveryCreds, { role: 'athlete' });
    await page.goto('/en/settings/billing');

    await expect(page.getByTestId('billing-pro-badge')).toContainText('Pro');
    await expect(page.getByTestId('billing-effective-source')).toContainText('Subscription');
  });
});
