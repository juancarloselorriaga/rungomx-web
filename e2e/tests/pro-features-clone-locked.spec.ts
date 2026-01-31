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

test.describe('Pro features - clone locked', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'pro-clone-', {
      name: 'Pro Clone Test Organizer',
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

  test('non-Pro organizer sees locked upsell on clone', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await page.goto(`/en/dashboard/events/${eventId}/editions`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);

    const cloneButton = page.getByRole('button', { name: 'Clone', exact: true }).first();
    await cloneButton.click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.getByRole('button', { name: 'Clone edition' }).click();

    await expect(page.getByText('Clone events')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upgrade to Pro' })).toBeVisible();
    await expect(page).toHaveURL(/\/editions$/);
  });
});
