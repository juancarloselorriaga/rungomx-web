import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  signUpTestUser,
  setUserVerified,
  getUserByEmail,
  createTestProfile,
  assignExternalRole,
  deleteUserRegistrations,
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
  let seriesName: string;
  let editionLabel: string;
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
    seriesName = eventData.seriesName;
    editionLabel = eventData.editionLabel;
    seriesSlug = eventData.seriesName.toLowerCase().replace(/\s+/g, '-');
    editionSlug = eventData.editionLabel;

    // Add distance and publish
    await navigateToEventSettings(page, eventId);
    await addDistance(page, DISTANCE_DATA.trail10k);
    await addDistance(page, DISTANCE_DATA.road5k);
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
    // Use the one with callbackURL in the href (not the navbar sign-in)
    const signInLink = page.locator('a[href*="callbackURL"], a[href*="callbackUrl"]').first();
    await expect(signInLink).toBeVisible();
    const href = await signInLink.getAttribute('href');
    expect(href).toMatch(/callbackURL|callbackUrl/);
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

  test('Test 1.8d-2: Organizer sees warning when registering own event', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    await expect(page.getByText(/registering for your own event/i)).toBeVisible();
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

    // Clean up: Delete the incomplete registration so subsequent tests can start fresh
    const db = getTestDb();
    const athlete = await getUserByEmail(db, athleteCreds.email);
    if (athlete) {
      await deleteUserRegistrations(db, athlete.id);
    }
  });

  test('Test 1.8f-h: Complete registration flow (combined)', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // Step 1: Select distance
    await page.getByRole('button', { name: /10K Trail Run/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Step 2: Fill participant information (if shown)
    const participantHeading = page.getByRole('heading', { name: /participant information/i });
    const waiverHeading = page.getByRole('heading', { name: /waiver/i });
    const paymentHeading = page.getByRole('heading', { name: /payment/i });

    // Wait for participant info, waiver, or payment step
    await expect(participantHeading.or(waiverHeading).or(paymentHeading)).toBeVisible();

    // If on participant info step, fill the form
    if (await participantHeading.isVisible().catch(() => false)) {
      await completeRegistrationForm(page);
    }

    // Step 3: Handle waiver if present
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

    // Step 4: View order summary on payment page
    await expect(page.getByRole('heading', { name: /payment/i })).toBeVisible();
    await expect(page.getByText('10K Trail Run')).toBeVisible();
    await expect(page.getByText(/MX\$500/).first()).toBeVisible();
    await expect(page.getByText(/total/i).first()).toBeVisible();

    // Step 5: Complete registration
    await page.getByRole('button', { name: /complete registration/i }).click();

    // Should show confirmation
    await expect(page.getByText(/registration complete/i)).toBeVisible();

    // Ticket code should be displayed
    registrationId = await extractRegistrationId(page);
    expect(registrationId).toMatch(/^RG-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    await page.goto('/en/dashboard/my-registrations');
    await expect(page.getByText(registrationId)).toBeVisible();
    await expect(page.getByText(seriesName)).toBeVisible();

    await page.getByRole('link', { name: /view details/i }).first().click();
    await expect(page.getByText(registrationId)).toBeVisible();
    await expect(page.getByText(seriesName)).toBeVisible();
    await expect(page.getByText(editionLabel)).toBeVisible();
    await expect(page.getByText(DISTANCE_DATA.trail10k.label)).toBeVisible();
  });

  test('Test 1.8i: Verify registration cannot be duplicated', async ({ page }) => {
    await signInAsAthlete(page, athleteCreds);

    // Try to register again for the same event
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // UX: The page proactively shows "already registered" message when user is already registered.
    // Distance buttons are disabled to prevent duplicate registration attempts.
    await expect(page.getByText(/already registered/i)).toBeVisible();

    // Verify that the distance button is disabled
    const distanceButton = page.getByRole('button', { name: /5K Road Race/i });
    await expect(distanceButton).toBeDisabled();
  });

  test('Test 1.8j: Capacity decrements after registration', async ({ page }) => {
    // Navigate to public event page
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}?tab=distances`);

    // Capacity should be reduced (started at 100, should now be 99)
    await expect(page.getByText(/99 spots remaining/i)).toBeVisible();
  });

  test('Test 1.8k: Form validation prevents incomplete submission', async ({ page }) => {
    // Clean up athlete's registrations from previous tests so they can start a new registration
    const db = getTestDb();
    const athlete = await getUserByEmail(db, athleteCreds.email);
    if (athlete) {
      await deleteUserRegistrations(db, athlete.id);
    }

    // Sign in as athlete
    await signInAsAthlete(page, athleteCreds);

    // Navigate to registration
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}/register`);

    // Select distance
    await page.getByRole('button', { name: /10K Trail Run/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    // Wait for the participant information step to load
    await expect(page.getByRole('heading', { name: /participant information/i })).toBeVisible();

    // Clear required fields to make the form incomplete
    // The form pre-fills from user profile, so we need to explicitly clear them
    await page.getByLabel(/first name/i).clear();
    await page.getByLabel(/last name/i).clear();
    await page.getByLabel(/email/i).clear();

    // Try to continue without filling required fields
    // The Continue button should be disabled
    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeDisabled();

    // Should still be on participant information step
    await expect(page.getByRole('heading', { name: /participant information/i })).toBeVisible();
  });
});
