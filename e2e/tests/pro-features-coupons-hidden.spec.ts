import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  signUpTestUser,
  setUserVerified,
  getUserByEmail,
  createTestProfile,
  assignExternalRole,
} from '../utils/fixtures';
import { signInAsOrganizer, createOrganization, createEvent } from '../utils/helpers';

let organizerCreds: { email: string; password: string; name: string };
let eventId: string;

test.describe('Pro features - coupons hidden', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'pro-coupons-', {
      name: 'Pro Coupons Test Organizer',
    });

    await setUserVerified(db, organizerCreds.email);

    const organizer = await getUserByEmail(db, organizerCreds.email);
    await createTestProfile(db, organizer!.id, {
      dateOfBirth: new Date('1990-05-15'),
      gender: 'male',
      phone: '+523312345678',
      city: 'Mexico City',
      state: 'CDMX',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654321',
    });
    await assignExternalRole(db, organizer!.id, 'organizer');

    await signInAsOrganizer(page, organizerCreds);
    await page.goto('/en/dashboard/events/new');
    await createOrganization(page);
    const eventData = await createEvent(page);

    eventId = eventData.eventId;

    await context.close();
  });

  test('non-Pro organizer does not see Coupons nav item', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await page.goto(`/en/dashboard/events/${eventId}`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('link', { name: /coupons/i })).toHaveCount(0);
  });

  test('direct coupons URL shows upsell UI', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await page.goto(`/en/dashboard/events/${eventId}/coupons`);
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { name: 'Discount Coupons' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upgrade to Pro' })).toBeVisible();
  });
});
