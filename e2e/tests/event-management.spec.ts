import { test, expect } from '@playwright/test';
import { and, eq, isNull } from 'drizzle-orm';
import { eventEditions } from '@/db/schema';
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
  createOrganization,
  createEvent,
  navigateToEventSettings,
  addDistance,
  publishEvent,
  pauseRegistration,
  resumeRegistration,
} from '../utils/helpers';
import { DISTANCE_DATA } from '../fixtures/test-data';

/**
 * Event Management Tests
 *
 * Tests event settings, distance management, publication, and registration controls
 */

// File-scoped test credentials
let organizerCreds: { email: string; password: string; name: string };

test.describe('Event Management', () => {
  test.describe.configure({ mode: 'serial' });

  let eventId: string;
  let seriesSlug: string;
  let editionSlug: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(120_000);

    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create organizer user via signup
    organizerCreds = await signUpTestUser(page, 'org-mgmt-', {
      name: 'Event Management Test Organizer',
    });

    // Bypass email verification
    await setUserVerified(db, organizerCreds.email);

    // Create complete profile
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

    // Sign in and create event for management tests
    await signInAsOrganizer(page, organizerCreds);
    await page.goto('/en/dashboard/events/new');
    await createOrganization(page);
    const eventData = await createEvent(page);

    eventId = eventData.eventId;
    // Derive slugs from the DB to avoid mismatches with any server-side slug normalization.
    const edition = await db.query.eventEditions.findFirst({
      where: and(eq(eventEditions.id, eventId), isNull(eventEditions.deletedAt)),
      with: { series: true },
    });
    seriesSlug = edition?.series?.slug ?? eventData.seriesName.toLowerCase().replace(/\s+/g, '-');
    editionSlug = edition?.slug ?? eventData.editionLabel.toLowerCase();

    await context.close();
  });

  test('Test 1.3: Access event settings page', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);

    // Navigate to settings
    await navigateToEventSettings(page, eventId);

    // Verify all main sections are present (use first() for headings that may appear multiple times)
    await expect(page.getByRole('heading', { name: /visibility/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /registration/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /details/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: /distances/i }).first()).toBeVisible();
  });

  test('Test 1.4: Add distance with pricing and capacity', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await navigateToEventSettings(page, eventId);

    // Scroll to distances section
    await page.getByRole('heading', { name: /distances/i }).scrollIntoViewIfNeeded();

    // Add 10K distance
    await addDistance(page, DISTANCE_DATA.trail10k);

    // Verify distance appears with correct details
    await expect(page.getByText('10K Trail Run')).toBeVisible();
    await expect(page.getByText(/100 spots/i)).toBeVisible();
    await expect(page.getByText(/\$500/)).toBeVisible();
  });

  test('Test 1.4b: Add multiple distances', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await navigateToEventSettings(page, eventId);

    // Add 25K distance
    await addDistance(page, DISTANCE_DATA.trail25k);

    // Both distances should be visible
    await expect(page.getByText('10K Trail Run')).toBeVisible();
    await expect(page.getByText('25K Trail Run')).toBeVisible();
  });

  test('Test 1.5: Publish event', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await navigateToEventSettings(page, eventId);

    // Scroll to visibility section
    await page.getByRole('heading', { name: /visibility/i }).scrollIntoViewIfNeeded();

    // Publish event - this validates that the visibility badge shows "Published"
    await publishEvent(page);

    // Also verify the Published button has the selected state (check icon)
    const publishedBtn = page.getByRole('button', { name: 'Published', exact: true });
    await expect(publishedBtn.locator('svg')).toBeVisible();
  });

  test('Test 1.5b: Published event appears in public directory', async ({ page }) => {
    // Navigate to public events directory
    await page.goto('/en/events');

    // Ensure page has rendered before asserting results
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Look for event cards (implemented as links with event data)
    // Events are rendered as links containing the event name
    const eventLinks = page.locator('a[href*="/en/events/"]').filter({
      hasText: /E2E Test Event/i,
    });
    const eventsCount = await eventLinks.count();
    expect(eventsCount).toBeGreaterThan(0);
  });

  test('Test 1.5c: Public event page is accessible', async ({ page }) => {
    // Navigate to public event page
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}?tab=distances`);

    // Event details should be visible
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Location appears in multiple places - just check any is visible
    await expect(page.getByText(/Monterrey, Nuevo Le[oó]n/i).first()).toBeVisible();

    // Distances should be visible
    await expect(page.getByText('10K Trail Run')).toBeVisible();

    // Registration button should be visible
    await expect(page.getByRole('link', { name: /register/i })).toBeVisible();
  });

  test('Test 1.6: Pause registration', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await navigateToEventSettings(page, eventId);

    // Scroll to registration status section
    await page.getByRole('heading', { name: 'Registration Status' }).scrollIntoViewIfNeeded();

    // Pause registration
    await pauseRegistration(page);

    // Verify the pause is persisted in the database
    const db = getTestDb();
    const start = Date.now();
    let pausedValue = false;

    while (Date.now() - start < 5000) {
      const edition = await db.query.eventEditions.findFirst({
        where: and(eq(eventEditions.id, eventId), isNull(eventEditions.deletedAt)),
      });

      pausedValue = Boolean(edition?.isRegistrationPaused);
      if (pausedValue) break;
      await page.waitForTimeout(250);
    }

    expect(pausedValue).toBe(true);
  });

  test('Test 1.6b: Paused registration shows on public page', async ({ page }) => {
    // Navigate to public event page
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // Should show registration closed message
    await expect(page.getByText(/registration closed/i)).toBeVisible();

    // Register button should not be visible when registration is closed
    const registerButton = page.getByRole('link', { name: /register now/i });
    await expect(registerButton).not.toBeVisible();
  });

  test('Test 1.6c: Resume registration', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await navigateToEventSettings(page, eventId);

    // Scroll to registration status section
    await page.getByRole('heading', { name: 'Registration Status' }).scrollIntoViewIfNeeded();

    // Resume registration
    await resumeRegistration(page);

    // Status should show Active
    await expect(page.getByText(/active/i)).toBeVisible();
  });

  test('Test 1.6d: Resumed registration shows on public page', async ({ page }) => {
    // Navigate to public event page
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);

    // Should show registration open message
    await expect(page.getByText(/registration open/i)).toBeVisible();

    // Register buttons should be enabled
    await expect(page.getByRole('link', { name: /register/i }).first()).toBeVisible();
  });

  test('Test 1.7: Edit event details', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);
    await navigateToEventSettings(page, eventId);

    // Scroll to details section
    await page.getByRole('heading', { name: /details/i }).scrollIntoViewIfNeeded();

    // Update location using LocationField component
    // Click on the location field to open the dialog
    const locationButton = page.getByRole('button', { name: /event location/i });
    await expect(locationButton).toBeVisible();
    await expect(locationButton).toBeEnabled();
    const buildIndicator = page.locator('text=/Compiling|Rendering/i');
    const searchInput = page.getByPlaceholder(/search for a place or address/i);

    await locationButton.scrollIntoViewIfNeeded();
    await locationButton.click();
    await expect(buildIndicator).toBeHidden({ timeout: 60000 });

    // The dialog is dynamic-imported and can take a bit to mount; if it doesn't mount,
    // retry opening once, but avoid clicking the underlying button when the overlay is already open.
    try {
      await searchInput.waitFor({ state: 'visible', timeout: 30000 });
    } catch (error) {
      const anyDialog = page.locator('[data-slot="dialog-content"]').first();
      const isDialogOpen = await anyDialog.isVisible().catch(() => false);
      if (!isDialogOpen) {
        await locationButton.click();
        await expect(buildIndicator).toBeHidden({ timeout: 60000 });
      }
      await searchInput.waitFor({ state: 'visible', timeout: 30000 });
    }

    const locationDialog = page.locator('[data-slot="dialog-content"]').filter({ has: searchInput }).first();
    await expect(locationDialog).toBeVisible({ timeout: 30000 });

    // Search for new location
    await searchInput.fill('Guadalajara, Jalisco, Mexico');
    await page.waitForTimeout(500);

    // Select first result
    const firstResult = locationDialog.locator('button').filter({ hasText: /Guadalajara/i }).first();
    await expect(firstResult).toBeVisible({ timeout: 10000 });
    await firstResult.click();

    // Confirm location selection
    const confirmBtn = locationDialog.getByRole('button', { name: /use this location/i });
    await confirmBtn.click();

    // Save changes
    await page.getByRole('button', { name: /save changes/i }).click();

    // Ensure the update has been committed before checking the public page.
    const db = getTestDb();
    await expect
      .poll(
        async () => {
          const edition = await db.query.eventEditions.findFirst({
            where: and(eq(eventEditions.id, eventId), isNull(eventEditions.deletedAt)),
            columns: { locationDisplay: true },
          });
          return edition?.locationDisplay ?? null;
        },
        { timeout: 20000 },
      )
      .toMatch(/Guadalajara/i);

    // Verify public page reflects change
    await page.goto(`/en/events/${seriesSlug}/${editionSlug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText(/Guadalajara/i).first()).toBeVisible();
  });
});
