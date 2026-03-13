import { test, expect, type Page } from '@playwright/test';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '@/db/schema';
import { formatMoneyFromMinor } from '@/lib/utils/format-money';

import { getTestDb } from '../utils/db';
import {
  completeRegistrationForm,
  extractRegistrationId,
  signInAsAthlete,
  signInAsUser,
} from '../utils/helpers';
import {
  assignExternalRole,
  assignUserRole,
  createTestEventEdition,
  createTestEventSeries,
  createTestDistance,
  createTestOrganization,
  createTestPricingTier,
  createTestProfile,
  createTestRole,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';

async function signInAsStaff(
  page: Page,
  credentials: { email: string; password: string },
) {
  await signInAsUser(page, credentials, {
    expectedDestinations: [/\/admin(?:\/|$)/, /\/dashboard(?:\/|$)/, /\/settings(?:\/|$)/],
  });
}

async function openRegistrationPageAsAthlete(
  page: Page,
  credentials: { email: string; password: string; name: string },
  seriesSlug: string,
  editionSlug: string,
) {
  const registerPath = `/en/events/${seriesSlug}/${editionSlug}/register`;
  await signInAsAthlete(page, credentials);
  await page.goto(registerPath, { waitUntil: 'domcontentloaded' });

  const signInRequiredHeading = page.getByRole('heading', { name: /sign in required/i });
  if (await signInRequiredHeading.isVisible().catch(() => false)) {
    await signInAsAthlete(page, credentials);
    await page.goto(registerPath, { waitUntil: 'domcontentloaded' });
  }

  await expect(signInRequiredHeading).not.toBeVisible({ timeout: 10_000 });
}

function getSummaryCard(page: Page, label: string) {
  return page
    .getByText(label, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class, "rounded-xl")][1]');
}

function getSummaryCardValue(page: Page, label: string) {
  return getSummaryCard(page, label).locator('p').nth(1);
}

let organizerCreds: { id: string; email: string; password: string; name: string };
let athleteCreds: { id: string; email: string; password: string; name: string };
let staffCreds: { id: string; email: string; password: string; name: string };
let organizerName = '';
let seriesSlug = '';
let editionSlug = '';
let editionId = '';

test.describe('Demo payments volume E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'org-demo-volume-', {
      name: 'Demo Volume Organizer',
    });
    await setUserVerified(db, organizerCreds.email);
    await createTestProfile(db, organizerCreds.id, {
      dateOfBirth: new Date('1988-03-11'),
      gender: 'male',
      phone: '+523355501111',
      city: 'Monterrey',
      state: 'Nuevo León',
    });
    await assignExternalRole(db, organizerCreds.id, 'organizer');

    athleteCreds = await signUpTestUser(page, 'athlete-demo-volume-', {
      name: 'Demo Volume Athlete',
    });
    await setUserVerified(db, athleteCreds.email);
    await createTestProfile(db, athleteCreds.id, {
      dateOfBirth: new Date('1994-08-20'),
      gender: 'female',
      phone: '+523355502222',
      city: 'Guadalajara',
      state: 'Jalisco',
      emergencyContactName: 'Mariana Lopez',
      emergencyContactPhone: '+523355503333',
      shirtSize: 'M',
    });
    await assignExternalRole(db, athleteCreds.id, 'athlete');

    staffCreds = await signUpTestUser(page, 'staff-demo-volume-', {
      name: 'Demo Volume Staff',
    });
    await setUserVerified(db, staffCreds.email);
    let staffRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, 'staff'),
    });
    if (!staffRole) {
      staffRole = await createTestRole(db, {
        name: 'staff',
        description: 'Internal staff role for E2E tests',
      });
    }
    await assignUserRole(db, staffCreds.id, staffRole.id);

    const organization = await createTestOrganization(db, organizerCreds.id, {
      name: `Volume Org ${Date.now()}`,
      slug: `volume-org-${Date.now()}`,
    });
    organizerName = organization.name;

    const series = await createTestEventSeries(db, organization.id, {
      name: `Volume Event ${Date.now()}`,
      slug: `volume-event-${Date.now()}`,
      sportType: 'trail_running',
    });
    seriesSlug = series.slug;

    const startsAt = new Date(Date.now() + 45 * 24 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 3 * 60 * 60 * 1000);
    const registrationOpensAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const registrationClosesAt = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

    const edition = await createTestEventEdition(db, series.id, {
      editionLabel: '2026',
      slug: `2026-${Date.now()}`,
      visibility: 'published',
      startsAt,
      endsAt,
      registrationOpensAt,
      registrationClosesAt,
      locationDisplay: 'Bosque de la Primavera',
      city: 'Guadalajara',
      state: 'Jalisco',
      country: 'MX',
      description: 'E2E demo payments volume event.',
    });
    editionId = edition.id;
    editionSlug = edition.slug;

    const distance = await createTestDistance(db, edition.id, {
      label: '10K Trail Run',
      distanceValue: '10',
      distanceUnit: 'km',
      terrain: 'trail',
      capacity: 100,
      sortOrder: 0,
    });

    await createTestPricingTier(db, distance.id, {
      label: 'General',
      priceCents: 50_000,
      currency: 'MXN',
      sortOrder: 0,
    });

    await context.close();
  });

  test('athlete demo payment appears in admin volume workspace', async ({ page }) => {
    const db = getTestDb();

    await openRegistrationPageAsAthlete(page, athleteCreds, seriesSlug, editionSlug);

    await page.getByRole('button', { name: /10K Trail Run/i }).click();
    await page.getByRole('button', { name: /continue/i }).click();

    const participantHeading = page.getByRole('heading', { name: /participant information/i });
    const waiverHeading = page.getByRole('heading', { name: /waiver/i });
    const paymentHeading = page.getByRole('heading', { name: /payment/i });

    await expect(participantHeading.or(waiverHeading).or(paymentHeading)).toBeVisible();

    if (await participantHeading.isVisible().catch(() => false)) {
      await completeRegistrationForm(page);
    }

    if (await waiverHeading.isVisible().catch(() => false)) {
      const waiverCheckboxes = page.locator('input[type="checkbox"]');
      const count = await waiverCheckboxes.count();
      for (let index = 0; index < count; index += 1) {
        await waiverCheckboxes.nth(index).check();
      }
      await page.getByRole('button', { name: /continue|accept/i }).click();
    }

    await expect(paymentHeading).toBeVisible();
    await page.getByRole('button', { name: /complete registration/i }).click();
    await expect(page.getByText(/registration complete/i)).toBeVisible();

    const ticketCode = await extractRegistrationId(page);
    expect(ticketCode).toMatch(/^RG-[0-9A-Z]{4}-[0-9A-Z]{4}$/);

    const [registration] = await db
      .select({
        id: schema.registrations.id,
        status: schema.registrations.status,
      })
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.buyerUserId, athleteCreds.id),
          eq(schema.registrations.editionId, editionId),
        ),
      )
      .orderBy(desc(schema.registrations.createdAt))
      .limit(1);

    expect(registration?.id).toBeTruthy();
    expect(registration?.status).toBe('payment_pending');

    await page.goto('/en/dashboard/my-registrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(ticketCode)).toBeVisible();
    await page.getByRole('link', { name: /view details/i }).first().click();

    await expect(page.getByText('Payment pending')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay (demo)' })).toBeVisible();
    await page.getByRole('button', { name: 'Pay (demo)' }).click();

    await expect(page.getByText('Confirmed')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Pay (demo)' })).not.toBeVisible();

    await expect
      .poll(async () => {
        const [row] = await db
          .select({ status: schema.registrations.status })
          .from(schema.registrations)
          .where(eq(schema.registrations.id, registration!.id))
          .limit(1);
        return row?.status ?? null;
      }, { timeout: 15_000 })
      .toBe('confirmed');

    await expect
      .poll(async () => {
        const rows = await db
          .select({ id: schema.moneyEvents.id })
          .from(schema.moneyEvents)
          .where(
            and(
              eq(schema.moneyEvents.eventName, 'payment.captured'),
              eq(schema.moneyEvents.eventVersion, 1),
              eq(schema.moneyEvents.entityType, 'registration'),
              eq(schema.moneyEvents.entityId, registration!.id),
            ),
          );
        return rows.length;
      }, { timeout: 15_000 })
      .toBe(1);

    await expect
      .poll(async () => {
        const rows = await db
          .select({
            grossProcessedMinor: schema.paymentCaptureVolumeDaily.grossProcessedMinor,
            platformFeeMinor: schema.paymentCaptureVolumeDaily.platformFeeMinor,
            organizerProceedsMinor: schema.paymentCaptureVolumeDaily.organizerProceedsMinor,
            captureCount: schema.paymentCaptureVolumeDaily.captureCount,
          })
          .from(schema.paymentCaptureVolumeDaily);

        return rows.reduce(
          (acc, row) => ({
            gross: acc.gross + row.grossProcessedMinor,
            fees: acc.fees + row.platformFeeMinor,
            proceeds: acc.proceeds + row.organizerProceedsMinor,
            count: acc.count + row.captureCount,
          }),
          { gross: 0, fees: 0, proceeds: 0, count: 0 },
        );
      }, { timeout: 15_000 })
      .toMatchObject({ count: 1 });

    const dailyRows = await db
      .select({
        sourceCurrency: schema.paymentCaptureVolumeDaily.sourceCurrency,
        grossProcessedMinor: schema.paymentCaptureVolumeDaily.grossProcessedMinor,
        platformFeeMinor: schema.paymentCaptureVolumeDaily.platformFeeMinor,
        organizerProceedsMinor: schema.paymentCaptureVolumeDaily.organizerProceedsMinor,
        captureCount: schema.paymentCaptureVolumeDaily.captureCount,
      })
      .from(schema.paymentCaptureVolumeDaily);

    expect(dailyRows).toHaveLength(1);

    const organizerRows = await db
      .select({
        organizerId: schema.paymentCaptureVolumeOrganizerDaily.organizerId,
        sourceCurrency: schema.paymentCaptureVolumeOrganizerDaily.sourceCurrency,
        grossProcessedMinor: schema.paymentCaptureVolumeOrganizerDaily.grossProcessedMinor,
        platformFeeMinor: schema.paymentCaptureVolumeOrganizerDaily.platformFeeMinor,
        organizerProceedsMinor: schema.paymentCaptureVolumeOrganizerDaily.organizerProceedsMinor,
        captureCount: schema.paymentCaptureVolumeOrganizerDaily.captureCount,
      })
      .from(schema.paymentCaptureVolumeOrganizerDaily);

    expect(organizerRows).toHaveLength(1);
    expect(organizerRows[0]?.captureCount).toBe(1);

    const [reconciliationRow] = await db
      .select({
        captureEventCount: schema.paymentCaptureVolumeReconciliationDaily.captureEventCount,
        excludedEventCount: schema.paymentCaptureVolumeReconciliationDaily.excludedEventCount,
      })
      .from(schema.paymentCaptureVolumeReconciliationDaily)
      .limit(1);

    expect(reconciliationRow?.captureEventCount).toBe(1);
    expect(reconciliationRow?.excludedEventCount).toBe(0);

    const [dailyRow] = dailyRows;
    const grossFormatted = formatMoneyFromMinor(dailyRow.grossProcessedMinor, 'MXN', 'en');
    const feesFormatted = formatMoneyFromMinor(dailyRow.platformFeeMinor, 'MXN', 'en');
    const proceedsFormatted = formatMoneyFromMinor(
      dailyRow.organizerProceedsMinor,
      'MXN',
      'en',
    );

    await signInAsStaff(page, staffCreds);
    await page.goto('/en/admin/payments?workspace=volume&range=30d', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/\/en\/admin\/payments\?workspace=volume/);
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Captured payment volume' })).toBeVisible();

    await expect(getSummaryCardValue(page, 'Gross processed')).toHaveText(grossFormatted);
    await expect(getSummaryCardValue(page, 'Platform fees captured')).toHaveText(feesFormatted);
    await expect(getSummaryCardValue(page, 'Organizer proceeds at capture')).toHaveText(
      proceedsFormatted,
    );
    await expect(getSummaryCardValue(page, 'Captured payments')).toHaveText('1');

    const currencyRow = page.locator('tr').filter({
      has: page.getByText('MXN', { exact: true }),
    }).first();
    await expect(currencyRow).toContainText(grossFormatted);
    await expect(currencyRow).toContainText(feesFormatted);
    await expect(currencyRow).toContainText(proceedsFormatted);

    await expect(page.getByTestId('admin-payments-organizer-page-summary')).toContainText(
      'Showing 1-1 of 1',
    );
    const organizerRow = page.locator('tbody tr').filter({ hasText: organizerName }).first();
    await expect(organizerRow).toBeVisible();
    const organizerInvestigationLink = organizerRow
      .getByTestId('admin-payments-organizer-investigation-link')
      .first();
    await expect(organizerInvestigationLink).toBeVisible();
    await expect(page.getByTestId('admin-payments-open-investigation-workspace')).toBeVisible();
  });
});
