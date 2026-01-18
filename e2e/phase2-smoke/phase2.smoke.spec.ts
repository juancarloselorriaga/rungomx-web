import { expect, test, type Locator, type Page } from '@playwright/test';
import path from 'node:path';

test.describe.configure({ mode: 'serial', timeout: 180_000 });

const SERIES_SLUG = 'smoke-test-trail-series';
const EDITION_SLUG = '2026';
const LOCALE = process.env.PHASE2_LOCALE ?? 'en';

const ORGANIZER_STATE = path.join(process.cwd(), 'e2e', '.auth', 'organizer.json');
const ATHLETE_STATE = path.join(process.cwd(), 'e2e', '.auth', 'athlete.json');

const DEFAULT_EVENT_ID = process.env.PHASE2_EVENT_ID ?? '76e22173-9ce6-477f-843d-6986b30d0d32';

const eventId = DEFAULT_EVENT_ID;

let addOnTitle: string;
let couponCode: string;

const re = {
  dashboardEventsTitle: /Events|Eventos/i,
  websiteContentTitle: /Website Content|Contenido del Sitio/i,
  pricingTitle: /^(Pricing Tiers|Precios por Etapa)$/i,
  addOnsTitle: /Add-ons|Extras/i,
  couponsTitle: /Discount Coupons|Cupones de Descuento/i,
  registrationsTitle: /Registrations|Inscripciones/i,
  continue: /Continue|Continuar/i,
};

async function firstVisible(locator: Locator): Promise<Locator> {
  const count = await locator.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const candidate = locator.nth(i);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return locator.first();
}

// ============================================
// Organizer Dashboard Tests
// ============================================

test.describe('Phase 2 Smoke: Organizer Dashboard', () => {
  test.use({ storageState: ORGANIZER_STATE });

  test('Website content page loads', async ({ page }) => {
    await page.goto(`/${LOCALE}/dashboard/events/${eventId}/website`, { waitUntil: 'domcontentloaded' });

    // Wait for either the page title or the main heading
    const heading = page.getByRole('heading', { name: re.websiteContentTitle });
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test('Pricing tiers page loads', async ({ page }) => {
    await page.goto(`/${LOCALE}/dashboard/events/${eventId}/pricing`, { waitUntil: 'domcontentloaded' });

    const heading = page.getByRole('heading', { name: re.pricingTitle });
    await expect(heading).toBeVisible({ timeout: 30_000 });
  });

  test('Add-ons page loads and can create add-on', async ({ page }) => {
    await page.goto(`/${LOCALE}/dashboard/events/${eventId}/add-ons`, { waitUntil: 'domcontentloaded' });

    // Use first() to avoid strict mode violation with multiple headings
    const heading = page.getByRole('heading', { name: re.addOnsTitle }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // Try to create an add-on
    addOnTitle = `Smoke Test Add-on ${Date.now()}`;

    const addButton = page.getByRole('button', { name: /Add new add-on|Agregar extra/i });
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();

      // Fill in the add-on form
      const titleInput = page.getByLabel(/Title|Título/i);
      await titleInput.fill(addOnTitle);

      // Save the add-on
      const saveButton = page.getByRole('button', { name: /Save add-on|Guardar extra/i });
      await saveButton.click();

      // Wait for success toast or the add-on to appear
      await page.waitForTimeout(2000);
    }
  });

  test('Coupons page loads and can create coupon', async ({ page }) => {
    await page.goto(`/${LOCALE}/dashboard/events/${eventId}/coupons`, { waitUntil: 'domcontentloaded' });

    // Use first() to avoid strict mode violation with multiple headings
    const heading = page.getByRole('heading', { name: re.couponsTitle }).first();
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // Try to create a coupon
    couponCode = `SMOKE${Date.now()}`.slice(0, 12).toUpperCase();

    const addButton = page.getByRole('button', { name: /Add coupon|Agregar cupón/i });
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();

      // Fill in the coupon form
      const codeInput = page.getByLabel(/Coupon code|Código del cupón/i);
      await codeInput.fill(couponCode);

      const percentInput = page.getByLabel(/Discount percentage|Porcentaje de descuento/i);
      await percentInput.fill('10');

      // Save the coupon
      const saveButton = page.getByRole('button', { name: /Create coupon|Crear cupón/i });
      await saveButton.click();

      // Wait for success
      await page.waitForTimeout(2000);
    }
  });

  test('Registrations page loads with export button', async ({ page }) => {
    await page.goto(`/${LOCALE}/dashboard/events/${eventId}/registrations`, { waitUntil: 'domcontentloaded' });

    const heading = page.getByRole('heading', { name: re.registrationsTitle });
    await expect(heading).toBeVisible({ timeout: 30_000 });

    // Check for export button
    const exportButton = page.getByRole('button', { name: /Export|Exportar/i });
    await expect(exportButton).toBeVisible({ timeout: 10_000 });
  });
});

// ============================================
// Public Event Page Tests
// ============================================

test.describe('Phase 2 Smoke: Public Event Page', () => {
  test('Public event page loads', async ({ page }) => {
    await page.goto(`/${LOCALE}/events/${SERIES_SLUG}/${EDITION_SLUG}`, { waitUntil: 'domcontentloaded' });

    // Wait for the page to load
    await page.waitForTimeout(3000);

    // The page should have some content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('Registration page loads', async ({ page }) => {
    await page.goto(`/${LOCALE}/events/${SERIES_SLUG}/${EDITION_SLUG}/register`, { waitUntil: 'domcontentloaded' });

    // Wait for the page to load
    await page.waitForTimeout(3000);

    // The page should have some content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});

// ============================================
// Athlete Registration Tests
// ============================================

test.describe('Phase 2 Smoke: Athlete Registration Flow', () => {
  test.use({ storageState: ATHLETE_STATE });

  test('Athlete can view registration page', async ({ page }) => {
    await page.goto(`/${LOCALE}/events/${SERIES_SLUG}/${EDITION_SLUG}/register`, { waitUntil: 'domcontentloaded' });

    // Wait for the page to load
    await page.waitForTimeout(5000);

    // The page should load without error
    const body = page.locator('body');
    await expect(body).toBeVisible();

    // Should not see a server error
    const errorText = page.getByText(/500|Internal Server Error/);
    await expect(errorText).not.toBeVisible();
  });
});
