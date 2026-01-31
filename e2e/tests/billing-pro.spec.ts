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
import { billingSubscriptions } from '@/db/schema';
import { eq } from 'drizzle-orm';

let trialCreds: { email: string; password: string; name: string };
let promoCreds: { email: string; password: string; name: string };
let pendingCreds: { email: string; password: string; name: string };
let promoCode = '';

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

    await Promise.all([
      setUserVerified(db, trialCreds.email),
      setUserVerified(db, promoCreds.email),
      setUserVerified(db, pendingCreds.email),
    ]);

    const [trialUser, promoUser, pendingUser] = await Promise.all([
      getUserByEmail(db, trialCreds.email),
      getUserByEmail(db, promoCreds.email),
      getUserByEmail(db, pendingCreds.email),
    ]);

    if (!trialUser || !promoUser || !pendingUser) {
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
      assignExternalRole(db, trialUser.id, 'athlete'),
      assignExternalRole(db, promoUser.id, 'athlete'),
      assignExternalRole(db, pendingUser.id, 'athlete'),
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
});
