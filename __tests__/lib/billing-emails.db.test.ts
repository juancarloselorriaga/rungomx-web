/** @jest-environment node */
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.test') });

jest.mock('@/config/url', () => ({
  siteUrl: 'http://localhost:3000',
}));

jest.mock('@/i18n/routing', () => ({
  routing: {
    locales: ['en', 'es'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed',
    pathnames: {},
  },
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(),
}));

jest.mock('@/lib/email', () => ({
  sendEmail: jest.fn(),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(() => (key: string, params?: Record<string, unknown>) => {
    if (params) {
      return `[${key}]:${JSON.stringify(params)}`;
    }
    return `[${key}]`;
  }),
}));

import { eq } from 'drizzle-orm';
import { billingEvents, billingSubscriptions } from '@/db/schema';
import {
  BILLING_PLAN_KEY,
  BILLING_TRIAL_EXPIRING_SOON_DAYS,
} from '@/lib/billing/constants';
import { scheduleCancelAtPeriodEnd } from '@/lib/billing/commands';
import {
  sendCancelScheduledEmail,
  sendSubscriptionEndedEmail,
  sendTrialExpiringSoonEmail,
  sendTrialStartedEmail,
} from '@/lib/billing/emails';
import { notifyExpiringTrials } from '@/lib/billing/cron';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestProfile, createTestUser } from '@/tests/helpers/fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;
const testDb = getTestDb();
const waitForMockCallCount = async (mockFn: jest.Mock, count: number) => {
  const timeoutMs = 2000;
  const start = Date.now();

  while (mockFn.mock.calls.length < count) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for mock to be called ${count} times.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};
const getEmailMocks = () => {
  const { sendEmail } = require('@/lib/email') as {
    sendEmail: jest.Mock;
  };
  const { getPathname } = require('@/i18n/navigation') as {
    getPathname: jest.Mock;
  };
  const { getTranslations } = require('next-intl/server') as {
    getTranslations: jest.Mock;
  };

  return { sendEmail, getPathname, getTranslations };
};

describe('Billing email helpers', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    const { sendEmail, getPathname } = getEmailMocks();
    sendEmail.mockResolvedValue({ body: { messageId: 'test-message-id' } });
    getPathname.mockReturnValue('/settings/billing');
    await cleanDatabase(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
  });

  it('sends trial started email with expected content', async () => {
    const user = await createTestUser(testDb, {
      email: 'trial@example.com',
      name: 'Trial User',
      emailVerified: true,
    });
    await createTestProfile(testDb, user.id, { locale: 'en' });

    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 3 * DAY_MS);

    await testDb.insert(billingSubscriptions).values({
      userId: user.id,
      planKey: BILLING_PLAN_KEY,
      status: 'trialing',
      trialStartsAt: now,
      trialEndsAt,
      cancelAtPeriodEnd: false,
    });

    await sendTrialStartedEmail({ userId: user.id });

    const { sendEmail } = getEmailMocks();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[trialStarted.subject]',
        htmlContent: expect.stringContaining('trialStarted.message'),
      }),
    );
  });

  it('sends trial expiring soon email with expected content', async () => {
    const user = await createTestUser(testDb, {
      email: 'expiring@example.com',
      name: 'Soon User',
      emailVerified: true,
    });
    await createTestProfile(testDb, user.id, { locale: 'en' });

    const trialEndsAt = new Date(Date.now() + DAY_MS);
    await sendTrialExpiringSoonEmail({ userId: user.id, trialEndsAt });

    const { sendEmail } = getEmailMocks();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[trialExpiringSoon.subject]',
        htmlContent: expect.stringContaining('trialExpiringSoon.message'),
      }),
    );
  });

  it('sends subscription ended email with status-specific messaging', async () => {
    const user = await createTestUser(testDb, {
      email: 'ended@example.com',
      name: 'Ended User',
      emailVerified: true,
    });
    await createTestProfile(testDb, user.id, { locale: 'en' });

    await sendSubscriptionEndedEmail({ userId: user.id, endedStatus: 'trial' });

    const { sendEmail } = getEmailMocks();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[subscriptionEnded.subject]',
        htmlContent: expect.stringContaining('subscriptionEnded.messageTrial'),
      }),
    );
  });

  it('sends cancel scheduled email with revert messaging', async () => {
    const user = await createTestUser(testDb, {
      email: 'cancel@example.com',
      name: 'Cancel User',
      emailVerified: true,
    });
    await createTestProfile(testDb, user.id, { locale: 'en' });

    await sendCancelScheduledEmail({
      userId: user.id,
      endsAt: new Date(Date.now() + DAY_MS),
    });

    const { sendEmail } = getEmailMocks();

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: '[cancelScheduled.subject]',
        htmlContent: expect.stringContaining('cancelScheduled.revertMessage'),
      }),
    );
  });

  it('falls back to Spanish locale when profile locale is missing', async () => {
    const user = await createTestUser(testDb, {
      email: 'locale@example.com',
      name: 'Locale User',
      emailVerified: true,
    });

    const now = new Date();
    await testDb.insert(billingSubscriptions).values({
      userId: user.id,
      planKey: BILLING_PLAN_KEY,
      status: 'trialing',
      trialStartsAt: now,
      trialEndsAt: new Date(now.getTime() + DAY_MS),
      cancelAtPeriodEnd: false,
    });

    await sendTrialStartedEmail({ userId: user.id });

    const { getTranslations } = getEmailMocks();

    expect(getTranslations).toHaveBeenCalledWith({
      locale: 'es',
      namespace: 'emails.billing',
    });
  });

  it('notifies expiring trials and records billing events', async () => {
    const now = new Date();
    const userA = await createTestUser(testDb, { emailVerified: true });
    const userB = await createTestUser(testDb, { emailVerified: true });

    await testDb.insert(billingSubscriptions).values([
      {
        userId: userA.id,
        planKey: BILLING_PLAN_KEY,
        status: 'trialing',
        trialStartsAt: now,
        trialEndsAt: new Date(now.getTime() + (BILLING_TRIAL_EXPIRING_SOON_DAYS - 1) * DAY_MS),
        cancelAtPeriodEnd: false,
      },
      {
        userId: userB.id,
        planKey: BILLING_PLAN_KEY,
        status: 'trialing',
        trialStartsAt: now,
        trialEndsAt: new Date(now.getTime() + (BILLING_TRIAL_EXPIRING_SOON_DAYS + 3) * DAY_MS),
        cancelAtPeriodEnd: false,
      },
    ]);

    const notifiedCount = await notifyExpiringTrials();

    expect(notifiedCount).toBe(1);
    const { sendEmail } = getEmailMocks();
    await waitForMockCallCount(sendEmail, 1);
    expect(sendEmail).toHaveBeenCalledTimes(1);

    const events = await testDb
      .select()
      .from(billingEvents)
      .where(eq(billingEvents.type, 'trial_expiring_soon_notified'));

    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userA.id);
  });

  it('does not send duplicate expiring trial emails', async () => {
    const now = new Date();
    const user = await createTestUser(testDb, { emailVerified: true });

    await testDb.insert(billingSubscriptions).values({
      userId: user.id,
      planKey: BILLING_PLAN_KEY,
      status: 'trialing',
      trialStartsAt: now,
      trialEndsAt: new Date(now.getTime() + (BILLING_TRIAL_EXPIRING_SOON_DAYS - 1) * DAY_MS),
      cancelAtPeriodEnd: false,
    });

    await notifyExpiringTrials();
    await notifyExpiringTrials();

    const { sendEmail } = getEmailMocks();
    await waitForMockCallCount(sendEmail, 1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('does not throw when sendEmail fails', async () => {
    const user = await createTestUser(testDb, { emailVerified: true });
    await createTestProfile(testDb, user.id, { locale: 'en' });

    const now = new Date();
    await testDb.insert(billingSubscriptions).values({
      userId: user.id,
      planKey: BILLING_PLAN_KEY,
      status: 'trialing',
      trialStartsAt: now,
      trialEndsAt: new Date(now.getTime() + DAY_MS),
      cancelAtPeriodEnd: false,
    });

    const { sendEmail } = getEmailMocks();
    sendEmail.mockRejectedValueOnce(new Error('SMTP error'));

    await expect(sendTrialStartedEmail({ userId: user.id })).resolves.toBeUndefined();
  });

  it('does not send duplicate cancellation emails when already scheduled', async () => {
    const now = new Date();
    const user = await createTestUser(testDb, { emailVerified: true });
    await createTestProfile(testDb, user.id, { locale: 'en' });

    await testDb.insert(billingSubscriptions).values({
      userId: user.id,
      planKey: BILLING_PLAN_KEY,
      status: 'trialing',
      trialStartsAt: now,
      trialEndsAt: new Date(now.getTime() + 3 * DAY_MS),
      cancelAtPeriodEnd: false,
    });

    const first = await scheduleCancelAtPeriodEnd({ userId: user.id, now });
    const second = await scheduleCancelAtPeriodEnd({ userId: user.id, now });

    const { sendEmail } = getEmailMocks();

    expect(first.ok).toBe(true);
    expect(first.ok && first.data.alreadyScheduled).toBe(false);
    expect(second.ok).toBe(true);
    expect(second.ok && second.data.alreadyScheduled).toBe(true);
    await waitForMockCallCount(sendEmail, 1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});
