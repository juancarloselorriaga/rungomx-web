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

// Deterministic geocoder result for the picker. The location search is backed by a live
// third-party geocoder (Mapbox), whose ranking is nondeterministic and proximity-biased:
// with the picker's default map center (Mexico City) it can surface a CDMX point named
// "Monterrey ..." above the actual city of Monterrey, Nuevo León — resolving the filter to
// the wrong coordinates so the ~85km-away Saltillo event never appears. These tests exercise
// the proximity *filter* (radius math + directory query), not geocoder accuracy, so we stub
// the search endpoint to return Monterrey, Nuevo León deterministically.
const MONTERREY_RESULT = {
  lat: 25.6866,
  lng: -100.3161,
  formattedAddress: 'Monterrey, Nuevo León, Mexico',
  name: 'Monterrey',
  city: 'Monterrey',
  region: 'Nuevo León',
  country: 'Mexico',
  countryCode: 'MX',
  placeId: 'test-monterrey-nuevo-leon',
};

test.describe('Near Location Filter', () => {
  // Use a fixed name that's easy to identify
  const TEST_EVENT_NAME = 'Saltillo Location Test Event';

  test.beforeAll(async () => {
    const db = getTestDb();
    const timestamp = Date.now();
    // Keep the event comfortably in the future so the directory's default "upcoming only"
    // filter (search/queries.ts: startsAt >= now when no date filter is applied) always
    // includes it. The previous hardcoded 2026 date silently began excluding the event once
    // that date passed, which is a second cause of these tests failing.
    const futureStartsAt = new Date(timestamp + 90 * 24 * 60 * 60 * 1000);
    const editionYear = String(futureStartsAt.getUTCFullYear());

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
      editionLabel: editionYear,
      publicCode: `ST${timestamp.toString().slice(-6)}`,
      slug: editionYear,
      visibility: 'published',
      city: 'Saltillo',
      state: 'Coahuila',
      country: 'MX',
      latitude: SALTILLO_COORDS.lat,
      longitude: SALTILLO_COORDS.lng,
      locationDisplay: 'Saltillo, Coahuila',
      startsAt: futureStartsAt,
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
    // Make the location search deterministic: return Monterrey, Nuevo León regardless of the
    // live geocoder's ranking (see MONTERREY_RESULT). Registered before navigation so the
    // debounced search request is always intercepted.
    await page.route('**/api/location/search**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ locations: [MONTERREY_RESULT] }),
      });
    });

    // Navigate to events directory
    await page.goto('/en/events');

    // Open advanced filters by clicking the filter button
    const filterBtn = page.getByRole('button', { name: /more filters/i });
    await expect(filterBtn).toBeVisible({ timeout: 10000 });
    await filterBtn.click();

    // Wait for the advanced filters panel to appear
    await expect(page.locator('text=Near location')).toBeVisible({ timeout: 5000 });

    // Click on the location picker button (empty-value state copy can vary by locale/version)
    const locationBtn = page.getByText(/no location (selected yet|set)|sin ubicaci[oó]n/i);
    await expect(locationBtn).toBeVisible({ timeout: 5000 });
    await locationBtn.click();

    // Wait for location dialog to appear
    const locationDialog = page.getByRole('dialog');
    await expect(locationDialog).toBeVisible({ timeout: 5000 });

    // Search for Monterrey in the search input
    const searchInput = locationDialog.getByPlaceholder(/search|buscar/i);
    await searchInput.fill('Monterrey, Nuevo León');

    // Wait for and click the first Monterrey search result
    const monterreyOption = locationDialog
      .locator('button')
      .filter({ hasText: /Monterrey/i })
      .first();
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
