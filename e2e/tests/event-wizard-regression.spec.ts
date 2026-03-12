import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import { sql } from 'drizzle-orm';

import * as schema from '@/db/schema';

import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestDistance,
  createTestOrganization,
  createTestPricingTier,
  createTestProfile,
  seedActiveProEntitlement,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

let nonProOrganizerCreds: { id: string; email: string; password: string; name: string };
let viewerOrganizerCreds: { id: string; email: string; password: string; name: string };
let readyEventId: string;
let blockedEventId: string;

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForWizardReady(page: Page) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    await expect(buildIndicator).not.toBeVisible({ timeout: 60_000 });
  }

  await expect(
    page.getByRole('heading', { name: /build your event step by step/i }),
  ).toBeVisible({ timeout: 30_000 });
}

async function waitForStandardSettingsReady(page: Page) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    await expect(buildIndicator).not.toBeVisible({ timeout: 60_000 });
  }

  await expect(
    page.getByRole('heading', { name: /event visibility|visibilidad del evento/i }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

function wizardStepButton(page: Page, label: string) {
  return page
    .getByRole('button', {
      name: new RegExp(escapeForRegex(label), 'i'),
    })
    .first();
}

async function createEdition(
  db: ReturnType<typeof getTestDb>,
  organizationId: string,
  options: {
    namePrefix: string;
    startsAt?: Date | null;
    city?: string;
    state?: string;
    locationDisplay?: string;
    description?: string | null;
    withDistanceAndPricing?: boolean;
  },
) {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  const seriesId = randomUUID();
  const editionId = randomUUID();
  const city = options.city ?? 'Guadalajara';
  const state = options.state ?? 'Jalisco';

  await db.insert(schema.eventSeries).values({
    id: seriesId,
    organizationId,
    slug: `${options.namePrefix}-${suffix}`,
    name: `${options.namePrefix} ${suffix}`,
    sportType: 'trail_running',
    status: 'active',
    primaryLocale: 'en',
  });

  await db.insert(schema.eventEditions).values({
    id: editionId,
    seriesId,
    editionLabel: '2027',
    publicCode: `WZ${suffix.slice(0, 6).toUpperCase()}`,
    slug: `edition-${suffix}`,
    visibility: 'draft',
    timezone: 'America/Mexico_City',
    startsAt: options.startsAt ?? null,
    city,
    state,
    locationDisplay: options.locationDisplay ?? `${city}, ${state}, Mexico`,
    country: 'MX',
    description: options.description ?? null,
    primaryLocale: 'en',
  });

  if (options.withDistanceAndPricing) {
    const distance = await createTestDistance(db, editionId, {
      label: '10K',
      distanceValue: '10',
      terrain: 'trail',
      capacity: 150,
      sortOrder: 0,
    });
    await createTestPricingTier(db, distance.id, {
      label: 'Standard',
      priceCents: 65000,
      sortOrder: 0,
    });
  }

  return editionId;
}

test.describe('Event wizard regression coverage', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    await db.execute(
      sql`ALTER TABLE event_series ADD COLUMN IF NOT EXISTS primary_locale varchar(10)`,
    );
    await db.execute(
      sql`ALTER TABLE event_editions ADD COLUMN IF NOT EXISTS primary_locale varchar(10)`,
    );
    await db.execute(
      sql`ALTER TABLE event_editions ADD COLUMN IF NOT EXISTS organizer_brief text`,
    );

    nonProOrganizerCreds = await signUpTestUser(page, 'wizard-regression-non-pro-', {
      name: 'Wizard Regression Non-Pro Organizer',
    });
    viewerOrganizerCreds = await signUpTestUser(page, 'wizard-regression-viewer-', {
      name: 'Wizard Regression Viewer Organizer',
    });

    await Promise.all([
      createTestProfile(db, nonProOrganizerCreds.id, {
        dateOfBirth: new Date('1991-01-01'),
        gender: 'male',
        phone: '+523312300301',
        city: 'Guadalajara',
        state: 'Jalisco',
        emergencyContactName: 'Wizard Regression Contact',
        emergencyContactPhone: '+523312300302',
      }),
      createTestProfile(db, viewerOrganizerCreds.id, {
        dateOfBirth: new Date('1992-01-01'),
        gender: 'female',
        phone: '+523312300501',
        city: 'Puebla',
        state: 'Puebla',
        emergencyContactName: 'Wizard Regression Viewer Contact',
        emergencyContactPhone: '+523312300502',
      }),
      assignExternalRole(db, nonProOrganizerCreds.id, 'organizer'),
      assignExternalRole(db, viewerOrganizerCreds.id, 'organizer'),
    ]);

    await seedActiveProEntitlement(db, viewerOrganizerCreds.id, {
      grantedByUserId: nonProOrganizerCreds.id,
      grantDurationDays: 14,
      reason: 'e2e_active_pro_entitlement_event_wizard_regression_viewer',
    });

    const nonProOrg = await createTestOrganization(db, nonProOrganizerCreds.id, {
      name: `Wizard Regression Non-Pro Org ${Date.now()}`,
      slug: `wizard-regression-non-pro-org-${randomUUID().slice(0, 8)}`,
    });
    await db.insert(schema.organizationMemberships).values({
      organizationId: nonProOrg.id,
      userId: viewerOrganizerCreds.id,
      role: 'viewer',
    });

    readyEventId = await createEdition(db, nonProOrg.id, {
      namePrefix: 'wizard-resume-ready',
      startsAt: new Date('2027-03-15T12:00:00.000Z'),
      withDistanceAndPricing: true,
    });

    blockedEventId = await createEdition(db, nonProOrg.id, {
      namePrefix: 'wizard-review-blocked',
      startsAt: null,
    });
    await context.close();
  });

  test('restores the saved wizard step, honors explicit step queries, and keeps wizard mode isolated from standard settings', async ({
    page,
  }) => {
    await signInAsOrganizer(page, nonProOrganizerCreds);

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1&step=pricing`);
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('pricing');
    await expect(
      page.getByRole('heading', { name: /event visibility|visibilidad del evento/i }),
    ).toHaveCount(0);

    await wizardStepButton(page, 'Registration').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(
      page.getByRole('heading', { name: /registration status/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.goBack();
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('pricing');
    await expect(page.getByRole('heading', { name: /pricing tiers|precios/i }).first()).toBeVisible();

    await page.goForward();
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(
      page.getByRole('heading', { name: /registration status/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole('link', { name: /exit wizard/i }).click();
    await waitForStandardSettingsReady(page);
    await expect(
      page.getByRole('heading', { name: /build your event step by step/i }),
    ).toHaveCount(0);

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1`);
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(page.getByRole('heading', { name: /registration status/i }).first()).toBeVisible();

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1&step=basics`);
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('basics');
    await expect(page.getByRole('heading', { name: /event basics/i })).toBeVisible();

    await page.goto(`/en/dashboard/events/${blockedEventId}/settings?wizard=1&step=content`);
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('basics');
    await expect(page.getByRole('heading', { name: /event basics/i })).toBeVisible();
  });

  test('persists skipped optional steps in-session and lets review jump back to them', async ({
    page,
  }) => {
    await signInAsOrganizer(page, nonProOrganizerCreds);

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1&step=registration`);
    await waitForWizardReady(page);
    await expect(page.getByRole('button', { name: /skip for now/i })).toBeVisible();

    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('policies');

    await wizardStepButton(page, 'Review & publish').click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('review');
    await expect(page.getByRole('heading', { name: /this event is ready for publish review/i })).toBeVisible();

    const skippedRegistrationChip = page.getByRole('button', { name: /^Registration$/ });
    await expect(skippedRegistrationChip).toBeVisible();

    await page.reload();
    await waitForWizardReady(page);
    await expect(page.getByRole('button', { name: /^Registration$/ })).toBeVisible();

    await page.getByRole('button', { name: /^Registration$/ }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(page.getByRole('heading', { name: /registration status/i }).first()).toBeVisible();
  });

  test('review highlights publish vs required blockers and routes recovery to the first blocker', async ({
    page,
  }) => {
    await signInAsOrganizer(page, nonProOrganizerCreds);

    await page.goto(`/en/dashboard/events/${blockedEventId}/settings?wizard=1&step=review`);
    await waitForWizardReady(page);
    await expect(
      page.getByRole('heading', { name: /resolve these blockers before publishing/i }),
    ).toBeVisible();
    await expect(page.getByText('Publish blocker', { exact: true })).toBeVisible();
    await expect(page.getByText('Required setup', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /fix first blocker/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('basics');
    await expect(page.getByRole('heading', { name: /event basics/i })).toBeVisible();
  });

  test('read-only organizer memberships see an explicit assistant lock state instead of a dead-end copilot', async ({
    page,
  }) => {
    await signInAsOrganizer(page, viewerOrganizerCreds);

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1&step=content`);
    await waitForWizardReady(page);
    await expect(page.getByText(/assistant is read-only for this membership/i)).toBeVisible();
    await expect(
      page.getByText(/only organizers with edit access can use or apply assistant proposals/i),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: /message for setup assistant/i })).toHaveCount(0);
  });
});
