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

type DemoPaymentsVolumeScenario = {
  organizerCreds: { id: string; email: string; password: string; name: string };
  athleteCreds: { id: string; email: string; password: string; name: string };
  staffCreds: { id: string; email: string; password: string; name: string };
  organizationId: string;
  organizerName: string;
  seriesSlug: string;
  editionSlug: string;
  editionId: string;
};

type VolumeTotals = {
  gross: number;
  fees: number;
  proceeds: number;
  count: number;
};

type ReconciliationTotals = {
  captureEventCount: number;
  excludedEventCount: number;
};

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

async function setupDemoPaymentsVolumeScenario(page: Page): Promise<DemoPaymentsVolumeScenario> {
  const db = getTestDb();

  const organizerCreds = await signUpTestUser(page, 'org-demo-volume-', {
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

  const athleteCreds = await signUpTestUser(page, 'athlete-demo-volume-', {
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

  const staffCreds = await signUpTestUser(page, 'staff-demo-volume-', {
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

  const series = await createTestEventSeries(db, organization.id, {
    name: `Volume Event ${Date.now()}`,
    slug: `volume-event-${Date.now()}`,
    sportType: 'trail_running',
  });

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

  return {
    organizerCreds,
    athleteCreds,
    staffCreds,
    organizationId: organization.id,
    organizerName: organization.name,
    seriesSlug: series.slug,
    editionSlug: edition.slug,
    editionId: edition.id,
  };
}

async function getDailyVolumeTotals() {
  const db = getTestDb();
  const rows = await db
    .select({
      grossProcessedMinor: schema.paymentCaptureVolumeDaily.grossProcessedMinor,
      platformFeeMinor: schema.paymentCaptureVolumeDaily.platformFeeMinor,
      organizerProceedsMinor: schema.paymentCaptureVolumeDaily.organizerProceedsMinor,
      captureCount: schema.paymentCaptureVolumeDaily.captureCount,
    })
    .from(schema.paymentCaptureVolumeDaily);

  return rows.reduce<VolumeTotals>(
    (acc, row) => ({
      gross: acc.gross + row.grossProcessedMinor,
      fees: acc.fees + row.platformFeeMinor,
      proceeds: acc.proceeds + row.organizerProceedsMinor,
      count: acc.count + row.captureCount,
    }),
    { gross: 0, fees: 0, proceeds: 0, count: 0 },
  );
}

async function getReconciliationTotals() {
  const db = getTestDb();
  const rows = await db
    .select({
      captureEventCount: schema.paymentCaptureVolumeReconciliationDaily.captureEventCount,
      excludedEventCount: schema.paymentCaptureVolumeReconciliationDaily.excludedEventCount,
    })
    .from(schema.paymentCaptureVolumeReconciliationDaily);

  return rows.reduce<ReconciliationTotals>(
    (acc, row) => ({
      captureEventCount: acc.captureEventCount + row.captureEventCount,
      excludedEventCount: acc.excludedEventCount + row.excludedEventCount,
    }),
    { captureEventCount: 0, excludedEventCount: 0 },
  );
}

test.describe('Demo payments volume E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test('athlete demo payment appears in admin volume workspace', async ({ page }) => {
    const db = getTestDb();
    const {
      athleteCreds,
      staffCreds,
      organizationId,
      organizerName,
      seriesSlug,
      editionSlug,
      editionId,
    } = await setupDemoPaymentsVolumeScenario(page);

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

    const baselineDailyTotals = await getDailyVolumeTotals();
    const baselineReconciliationTotals = await getReconciliationTotals();

    await page.goto('/en/dashboard/my-registrations', { waitUntil: 'domcontentloaded' });
    await expect(page.getByText(ticketCode)).toBeVisible();
    await page.goto(`/en/dashboard/my-registrations/${registration!.id}`, {
      waitUntil: 'domcontentloaded',
    });
    await expect(page).toHaveURL(
      new RegExp(`/en/dashboard/my-registrations/${registration!.id}(?:$|[?#])`),
    );

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
        const current = await getDailyVolumeTotals();
        return {
          gross: current.gross - baselineDailyTotals.gross,
          fees: current.fees - baselineDailyTotals.fees,
          proceeds: current.proceeds - baselineDailyTotals.proceeds,
          count: current.count - baselineDailyTotals.count,
        };
      }, { timeout: 15_000 })
      .toMatchObject({ count: 1 });

    await expect
      .poll(async () => {
        const rows = await db
          .select({
            organizerId: schema.paymentCaptureVolumeOrganizerDaily.organizerId,
            sourceCurrency: schema.paymentCaptureVolumeOrganizerDaily.sourceCurrency,
            grossProcessedMinor: schema.paymentCaptureVolumeOrganizerDaily.grossProcessedMinor,
            platformFeeMinor: schema.paymentCaptureVolumeOrganizerDaily.platformFeeMinor,
            organizerProceedsMinor: schema.paymentCaptureVolumeOrganizerDaily.organizerProceedsMinor,
            captureCount: schema.paymentCaptureVolumeOrganizerDaily.captureCount,
          })
          .from(schema.paymentCaptureVolumeOrganizerDaily)
          .where(eq(schema.paymentCaptureVolumeOrganizerDaily.organizerId, organizationId));

        return rows;
      }, { timeout: 15_000 })
      .toHaveLength(1);

    const [organizerVolumeRow] = await db
      .select({
        organizerId: schema.paymentCaptureVolumeOrganizerDaily.organizerId,
        sourceCurrency: schema.paymentCaptureVolumeOrganizerDaily.sourceCurrency,
        grossProcessedMinor: schema.paymentCaptureVolumeOrganizerDaily.grossProcessedMinor,
        platformFeeMinor: schema.paymentCaptureVolumeOrganizerDaily.platformFeeMinor,
        organizerProceedsMinor: schema.paymentCaptureVolumeOrganizerDaily.organizerProceedsMinor,
        captureCount: schema.paymentCaptureVolumeOrganizerDaily.captureCount,
      })
      .from(schema.paymentCaptureVolumeOrganizerDaily)
      .where(eq(schema.paymentCaptureVolumeOrganizerDaily.organizerId, organizationId))
      .limit(1);

    expect(organizerVolumeRow?.captureCount).toBe(1);

    await expect
      .poll(async () => {
        const current = await getReconciliationTotals();
        return {
          captureEventCount:
            current.captureEventCount - baselineReconciliationTotals.captureEventCount,
          excludedEventCount:
            current.excludedEventCount - baselineReconciliationTotals.excludedEventCount,
        };
      }, { timeout: 15_000 })
      .toMatchObject({ captureEventCount: 1, excludedEventCount: 0 });

    const grossFormatted = formatMoneyFromMinor(
      organizerVolumeRow!.grossProcessedMinor,
      organizerVolumeRow!.sourceCurrency,
      'en',
    );
    const feesFormatted = formatMoneyFromMinor(
      organizerVolumeRow!.platformFeeMinor,
      organizerVolumeRow!.sourceCurrency,
      'en',
    );
    const proceedsFormatted = formatMoneyFromMinor(
      organizerVolumeRow!.organizerProceedsMinor,
      organizerVolumeRow!.sourceCurrency,
      'en',
    );

    await signInAsStaff(page, staffCreds);
    await page.goto('/en/admin/payments?workspace=volume&range=30d', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/\/en\/admin\/payments\?workspace=volume/);
    await expect(page.getByRole('heading', { name: 'Payments' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Captured payment volume' })).toBeVisible();

    const organizerWorkspaceRow = page.locator('tbody tr').filter({ hasText: organizerName }).first();
    await expect(organizerWorkspaceRow).toBeVisible();
    await expect(organizerWorkspaceRow).toContainText(grossFormatted);
    await expect(organizerWorkspaceRow).toContainText(feesFormatted);
    await expect(organizerWorkspaceRow).toContainText(proceedsFormatted);
    await expect(organizerWorkspaceRow).toContainText('1');
    const organizerInvestigationLink = organizerWorkspaceRow
      .getByTestId('admin-payments-organizer-investigation-link')
      .first();
    await expect(organizerInvestigationLink).toBeVisible();
    await expect(page.getByTestId('admin-payments-open-investigation-workspace')).toBeVisible();
  });
});
