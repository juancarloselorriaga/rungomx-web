import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import * as schema from '@/db/schema';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';

/**
 * Near Location Filter Tests
 *
 * Tests the proximity-based location filter on the events directory page.
 * Creates events at specific coordinates and verifies the filter works correctly
 * with different radius settings.
 *
 * Test scenario:
 * - Event in Saltillo, Coahuila (~85km from Monterrey)
 * - Search from Monterrey, Nuevo León
 * - At 200km radius: event should appear
 * - At 50km radius: event should NOT appear (85km > 50km)
 *
 * IMPORTANT: These tests require:
 * 1. No other process listening on the Playwright server port (defaults to 43137)
 * 2. .env.test configured with test database credentials
 */

// Coordinates for Saltillo (event location, ~85km from Monterrey)
const SALTILLO_COORDS = { lat: '25.4267', lng: '-100.9931' };

test.describe('Near Location Filter', () => {
  // Use a fixed name that's easy to identify
  const TEST_EVENT_NAME = 'Saltillo Location Test Event';

  test.beforeAll(async () => {
    const db = getTestDb();
    const timestamp = Date.now();

    // Create test organization
    const orgId = randomUUID();
    await db.insert(schema.organizations).values({
      id: orgId,
      name: `Location Filter Test Org ${timestamp}`,
      slug: `loc-filter-org-${timestamp}`,
    });

    // Create event series
    const seriesId = randomUUID();
    await db.insert(schema.eventSeries).values({
      id: seriesId,
      organizationId: orgId,
      name: TEST_EVENT_NAME,
      slug: `saltillo-test-${timestamp}`,
      sportType: 'trail_running',
    });

    // Create event edition with Saltillo coordinates
    const editionId = randomUUID();
    await db.insert(schema.eventEditions).values({
      id: editionId,
      seriesId: seriesId,
      editionLabel: '2026',
      publicCode: `ST${timestamp.toString().slice(-6)}`,
      slug: '2026',
      visibility: 'published',
      city: 'Saltillo',
      state: 'Coahuila',
      country: 'MX',
      latitude: SALTILLO_COORDS.lat,
      longitude: SALTILLO_COORDS.lng,
      locationDisplay: 'Saltillo, Coahuila',
      startsAt: new Date('2026-06-15T08:00:00Z'),
      timezone: 'America/Monterrey',
    });

    // Create a distance for the event
    await db.insert(schema.eventDistances).values({
      id: randomUUID(),
      editionId: editionId,
      label: '21K Trail',
      distanceValue: '21',
      distanceUnit: 'km',
      terrain: 'trail',
    });

    // Verify the data was inserted
    const [created] = await db
      .select()
      .from(schema.eventEditions)
      .where(eq(schema.eventEditions.id, editionId));

    if (!created) {
      throw new Error('Failed to create test event edition');
    }
  });

  /**
   * Helper to set up location filter
   */
  async function setupLocationFilter(page: import('@playwright/test').Page) {
    // Navigate to events directory
    await page.goto('/en/events');
    await page.waitForLoadState('networkidle');

    // Open advanced filters by clicking the filter button
    const filterBtn = page.getByRole('button', { name: /more filters/i });
    await filterBtn.click();

    // Wait for the advanced filters panel to appear
    await expect(page.locator('text=Near location')).toBeVisible({ timeout: 5000 });

    // Click on the location picker button (shows "No location selected yet")
    const locationBtn = page.getByText(/no location selected yet/i);
    await expect(locationBtn).toBeVisible({ timeout: 5000 });
    await locationBtn.click();

    // Wait for location dialog to appear
    const locationDialog = page.getByRole('dialog');
    await expect(locationDialog).toBeVisible({ timeout: 5000 });

    // Search for Monterrey in the search input
    const searchInput = locationDialog.getByPlaceholder(/search|buscar/i);
    await searchInput.fill('Monterrey, Nuevo León');

    // Wait for and click the first search result (Monterrey, Nuevo León, Mexico)
    const monterreyOption = locationDialog.getByRole('button', {
      name: 'Monterrey, Nuevo León, Mexico',
      exact: true,
    });
    await expect(monterreyOption).toBeVisible({ timeout: 10000 });
    await monterreyOption.click();

    // Wait for map to update and click "Use this location"
    const useLocationBtn = locationDialog.getByRole('button', { name: /use this location|usar esta ubicación/i });
    await expect(useLocationBtn).toBeEnabled({ timeout: 5000 });
    await useLocationBtn.click();

    // Wait for dialog to close
    await expect(locationDialog).not.toBeVisible({ timeout: 5000 });
  }

  test('Near Location filter shows event at 200km radius', async ({ page }) => {
    await setupLocationFilter(page);

    // Select 200km radius (the select appears after location is selected)
    const radiusSelect = page.locator('select').filter({ hasText: /km/i });
    await radiusSelect.selectOption('200');

    // Wait for filter to apply
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Verify the Saltillo event appears in results
    const eventCard = page.locator('a').filter({ hasText: TEST_EVENT_NAME }).first();
    await expect(eventCard).toBeVisible({ timeout: 15000 });

    // Verify location is shown
    await expect(page.getByText(/Saltillo, Coahuila/i)).toBeVisible();
  });

  test('Near Location filter hides event at 50km radius', async ({ page }) => {
    await setupLocationFilter(page);

    // Select 50km radius (event is ~85km away, should NOT appear)
    const radiusSelect = page.locator('select').filter({ hasText: /km/i });
    await radiusSelect.selectOption('50');

    // Wait for filter to apply
    await page.waitForTimeout(2000);

    // Verify the Saltillo event does NOT appear in results
    const eventCard = page.locator('a').filter({ hasText: TEST_EVENT_NAME }).first();
    await expect(eventCard).not.toBeVisible();
  });

  test('Changing radius from 200km to 50km makes event disappear', async ({ page }) => {
    await setupLocationFilter(page);

    // Start with 200km radius - event should be visible
    const radiusSelect = page.locator('select').filter({ hasText: /km/i });
    await radiusSelect.selectOption('200');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Verify event is visible at 200km
    const eventCard = page.locator('a').filter({ hasText: TEST_EVENT_NAME }).first();
    await expect(eventCard).toBeVisible({ timeout: 15000 });

    // Now change to 50km radius
    await radiusSelect.selectOption('50');
    await page.waitForTimeout(2000);

    // Verify event is NO LONGER visible at 50km
    await expect(eventCard).not.toBeVisible({ timeout: 5000 });
  });
});
