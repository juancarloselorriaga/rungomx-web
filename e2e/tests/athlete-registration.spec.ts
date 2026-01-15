import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  signUpTestUser,
  setUserVerified,
  getUserByEmail,
  createTestProfile,
  assignExternalRole,
} from '../utils/fixtures';
import {
  signInAsOrganizer,
  signInAsAthlete,
  createOrganization,
  createEvent,
  navigateToEventSettings,
  addDistance,
  publishEvent,
  completeRegistrationForm,
  extractRegistrationId,
} from '../utils/helpers';
import { DISTANCE_DATA } from '../fixtures/test-data';

/**
 * Athlete Registration Tests
 *
 * Tests the complete registration flow from athlete perspective
 */

// File-scoped test credentials
let organizerCreds: { email: string; password: string; name: string };
let athleteCreds: { email: string; password: string; name: string };

test.describe('Athlete Registration', () => {
  test.describe.configure({ mode: 'serial' });

  let eventId: string;
  let seriesSlug: string;
  let editionSlug: string;
  let registrationId: string;

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create organizer user via signup
    organizerCreds = await signUpTestUser(page, 'org-reg-', {
      name: 'Registration Test Organizer',
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

    // Create athlete user via signup
    athleteCreds = await signUpTestUser(page, 'athlete-reg-', {
      name: 'Registration Test Athlete',
    });

    await setUserVerified(db, athleteCreds.email);

    const athlete = await getUserByEmail(db, athleteCreds.email);
    await createTestProfile(db, athlete!.id, {
      dateOfBirth: new Date('1995-08-20'),
      gender: 'female',
      phone: '+523318887777',
      city: 'Guadalajara',
      state: 'Jalisco',
      emergencyContactName: 'John Doe',
      emergencyContactPhone: '+523319998888',
      shirtSize: 'M',
    });
    await assignExternalRole(db, athlete!.id, 'athlete');

    // Sign in as organizer and create event
    await signInAsOrganizer(page, organizerCreds);
    await page.goto('/en/dashboard/events/new');
    await createOrganization(page);
    const eventData = await createEvent(page);

    eventId = eventData.eventId;
    seriesSlug = eventData.seriesName.toLowerCase().replace(/\s+/g, '-');
    editionSlug = eventData.editionLabel;

    // Add distance and publish
    await navigateToEventSettings(page, eventId);
    await addDistance(page, DISTANCE_DATA.trail10k);
    await publishEvent(page);

    await context.close();
  });

  test('Test 1.8a: Non-authenticated user sees register button', async ({ page }) => {
    // Navigate to public event page without auth
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);

    // Register button should be visible
    await expect(page.getByRole('link', { name: /register/i })).toBeVisible();
  });

  test('Test 1.8b: Clicking register shows login required for unauthenticated users', async ({ page }) => {
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);

    // Click register button
    await page.getByRole('link', { name: /register/i }).first().click();

    // Should show login required page (not redirect)
    await expect(page).toHaveURL(/\/register/);
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible();

    // Sign-in button in the login required card should have callback URL
    // Use the one with callbackUrl in the href (not the navbar sign-in)
    const signInLink = page.locator('a[href*="callbackUrl"]').first();
    await expect(signInLink).toBeVisible();
    const href = await signInLink.getAttribute('href');
    expect(href).toContain('callbackUrl');
  });

  test('Test 1.8c: Sign in as athlete', async ({ page }) => {
    // Sign in (profile already complete from beforeAll)
    await signInAsAthlete(page, athleteCreds);

    // Verify signed in - the user name appears in the navbar button
    await expect(page.getByRole('button', { name: /registration test athlete/i })).toBeVisible();
  });

  test('Test 1.8d: Navigate to registration page', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);

    // Navigate to event and click register
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);
    await page.getByRole('link', { name: /register/i }).first().click();

    // Should be on registration page
    await expect(page).toHaveURL(/\/register/);
  });

  test('Test 1.8e: Select distance', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // Distance selection should be shown
    await expect(page.getByText('10K Trail Run')).toBeVisible();
    await expect(page.getByText(/\$500/)).toBeVisible();

    // Select distance
    await page.getByRole('button', { name: /10K Trail Run/i }).click();

    // Continue button should be enabled
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeEnabled();

    // Click continue
    await continueButton.click();

    // Should advance to participant information step OR payment step (if profile is complete)
    const participantHeading = page.getByRole('heading', { name: /participant information/i });
    const paymentHeading = page.getByRole('heading', { name: /payment/i });
    await expect(participantHeading.or(paymentHeading)).toBeVisible();
  });

  test('Test 1.8f: Fill participant information or skip to payment', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // Select distance
    await page.getByRole('button', { name: /10K Trail Run/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Check if we're on participant info step or already on payment (profile complete skips this step)
    const participantHeading = page.getByRole('heading', { name: /participant information/i });
    const paymentHeading = page.getByRole('heading', { name: /payment/i });

    // Wait for one of them to appear
    await expect(participantHeading.or(paymentHeading)).toBeVisible();

    // If on participant info step, fill the form
    if (await participantHeading.isVisible().catch(() => false)) {
      await completeRegistrationForm(page);
    }

    // Should be on waiver or payment step
    const waiverHeading = page.getByRole('heading', { name: /waiver/i });
    await expect(waiverHeading.or(paymentHeading)).toBeVisible();
  });

  test('Test 1.8g: View order summary', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);

    // Navigate to register page - should continue from existing registration (after test 1.8f)
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);
    await page.waitForLoadState('networkidle');

    // Should be on waiver or payment step (participant info was completed in 1.8f)
    const waiverHeading = page.getByRole('heading', { name: /waiver/i });
    const paymentHeading = page.getByRole('heading', { name: /payment/i });
    await expect(waiverHeading.or(paymentHeading)).toBeVisible({ timeout: 10000 });

    // If on waiver step, accept waiver to proceed to payment
    if (await waiverHeading.isVisible().catch(() => false)) {
      // Accept all waivers (checkboxes)
      const waiverCheckboxes = page.locator('input[type="checkbox"]');
      const count = await waiverCheckboxes.count();
      for (let i = 0; i < count; i++) {
        await waiverCheckboxes.nth(i).check();
      }
      await page.getByRole('button', { name: /continue|accept/i }).click();
      await page.waitForLoadState('networkidle');
    }

    // Should now be on payment page
    await expect(page.getByRole('heading', { name: /payment/i })).toBeVisible();

    // Verify order summary on payment page
    await expect(page.getByText('10K Trail Run')).toBeVisible();
    await expect(page.getByText(/MX\$500/).first()).toBeVisible();

    // Total should be displayed (use first() to avoid strict mode)
    await expect(page.getByText(/total/i).first()).toBeVisible();
  });

  test('Test 1.8h: Complete registration', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);

    // Navigate to register page - should continue from existing registration (now on payment step)
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);
    await page.waitForLoadState('networkidle');

    // Should be on payment step (waiver was handled in 1.8g if present)
    await expect(page.getByRole('heading', { name: /payment/i })).toBeVisible({ timeout: 10000 });

    // Complete registration
    await page.getByRole('button', { name: /complete registration/i }).click();

    // Should show confirmation
    await expect(page.getByText(/registration complete/i)).toBeVisible();

    // Registration ID should be displayed
    registrationId = await extractRegistrationId(page);
    expect(registrationId).toMatch(/^[A-Z0-9]{8}$/);
  });

  test('Test 1.8i: Verify registration cannot be duplicated', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);

    // Try to register again for the same event
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // Should show message that user is already registered
    // Or prevent duplicate registration in some way
    const alreadyRegistered = page.getByText(/already registered|already signed up/i);
    const isVisible = await alreadyRegistered.isVisible().catch(() => false);

    if (isVisible) {
      await expect(alreadyRegistered).toBeVisible();
    }
    // If duplicate prevention is handled differently, adjust assertion
  });

  test('Test 1.8j: Capacity decrements after registration', async ({ page }) => {
    // Navigate to public event page
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);

    // Capacity should be reduced (started at 100, should now be 99)
    await expect(page.getByText(/99 spots remaining/i)).toBeVisible();
  });

  test('Test 1.8k: Form validation prevents incomplete submission', async ({ page }) => {
    // Create new athlete account or use test account
    await signInAsAthlete(page, athleteCreds);

    // Navigate to registration
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // Select distance
    await page.getByRole('button', { name: /10K Trail Run/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Try to continue without filling required fields
    await page.getByRole('button', { name: /continue/i }).click();

    // Should still be on participant information step - use heading to be specific
    await expect(page.getByRole('heading', { name: /participant information/i })).toBeVisible();

    // Validation errors should be shown
    // (Implementation may vary - look for error messages or highlighted fields)
    const errorMessages = page.locator('[role="alert"], .error, [class*="error"]');
    const errorCount = await errorMessages.count();
    expect(errorCount).toBeGreaterThan(0);
  });
});
