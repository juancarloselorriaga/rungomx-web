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
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

let nonProOrganizerCreds: { id: string; email: string; password: string; name: string };
let proOrganizerCreds: { id: string; email: string; password: string; name: string };
let viewerOrganizerCreds: { id: string; email: string; password: string; name: string };
let readyEventId: string;
let blockedEventId: string;
let assistantReadyEventId: string;

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function waitForWizardReady(page: Page) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    await expect(buildIndicator).not.toBeVisible({ timeout: 60_000 });
  }

  await expect(
    page.getByRole('heading', { name: /(build|set up) your event step by step/i }),
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

function assistantTextarea(page: Page) {
  return page.getByTestId('event-assistant-panel-instance').locator('textarea');
}

function assistantDialog(page: Page) {
  return page.getByRole('dialog');
}

function assistantOverlay(page: Page) {
  return page.locator('[data-slot="sheet-overlay"]');
}

function assistantPanelInstance(page: Page) {
  return page.getByTestId('event-assistant-panel-instance');
}

function assistantSendButtons(page: Page) {
  return assistantPanelInstance(page).getByRole('button', { name: /send|enviar/i });
}

function assistantStopButtons(page: Page) {
  return assistantPanelInstance(page).getByRole('button', { name: /detener|stop/i });
}

async function createEdition(
  db: ReturnType<typeof getTestDb>,
  organizationId: string,
  options: {
    namePrefix: string;
    startsAt?: Date | null;
    city?: string;
    state?: string;
    address?: string;
    locationDisplay?: string;
    latitude?: string;
    longitude?: string;
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
    address: options.address ?? `${city} city center`,
    country: 'MX',
    latitude: options.latitude ?? '20.6736000',
    longitude: options.longitude ?? '-103.3440000',
    description: options.description ?? `${options.namePrefix} race setup draft`,
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
    await db.execute(sql`ALTER TABLE event_editions ADD COLUMN IF NOT EXISTS organizer_brief text`);

    nonProOrganizerCreds = await signUpTestUser(page, 'wizard-regression-non-pro-', {
      name: 'Wizard Regression Non-Pro Organizer',
    });
    proOrganizerCreds = await signUpTestUser(page, 'wizard-regression-pro-', {
      name: 'Wizard Regression Pro Organizer',
    });
    viewerOrganizerCreds = await signUpTestUser(page, 'wizard-regression-viewer-', {
      name: 'Wizard Regression Viewer Organizer',
    });
    await Promise.all([
      setUserVerified(db, nonProOrganizerCreds.email),
      setUserVerified(db, proOrganizerCreds.email),
      setUserVerified(db, viewerOrganizerCreds.email),
    ]);

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
      createTestProfile(db, proOrganizerCreds.id, {
        dateOfBirth: new Date('1993-01-01'),
        gender: 'male',
        phone: '+523312300401',
        city: 'Monterrey',
        state: 'Nuevo León',
        locale: 'es',
        emergencyContactName: 'Wizard Regression Pro Contact',
        emergencyContactPhone: '+523312300402',
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
      assignExternalRole(db, proOrganizerCreds.id, 'organizer'),
      assignExternalRole(db, viewerOrganizerCreds.id, 'organizer'),
    ]);

    await seedActiveProEntitlement(db, proOrganizerCreds.id, {
      grantedByUserId: nonProOrganizerCreds.id,
      grantDurationDays: 14,
      reason: 'e2e_active_pro_entitlement_event_wizard_regression_pro',
    });
    await seedActiveProEntitlement(db, viewerOrganizerCreds.id, {
      grantedByUserId: nonProOrganizerCreds.id,
      grantDurationDays: 14,
      reason: 'e2e_active_pro_entitlement_event_wizard_regression_viewer',
    });

    const nonProOrg = await createTestOrganization(db, nonProOrganizerCreds.id, {
      name: `Wizard Regression Non-Pro Org ${Date.now()}`,
      slug: `wizard-regression-non-pro-org-${randomUUID().slice(0, 8)}`,
    });
    const proOrg = await createTestOrganization(db, proOrganizerCreds.id, {
      name: `Wizard Regression Pro Org ${Date.now()}`,
      slug: `wizard-regression-pro-org-${randomUUID().slice(0, 8)}`,
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
    assistantReadyEventId = await createEdition(db, proOrg.id, {
      namePrefix: 'wizard-assistant-ready',
      startsAt: new Date('2027-04-20T12:00:00.000Z'),
      withDistanceAndPricing: true,
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
    await expect(page.getByRole('heading', { name: /registration/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    await page.goBack();
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('pricing');
    await expect(
      page.getByRole('heading', { name: /pricing tiers|precios/i }).first(),
    ).toBeVisible();

    await page.goForward();
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(page.getByRole('heading', { name: /registration/i }).first()).toBeVisible({
      timeout: 15_000,
    });

    const exitWizardLink = page.getByRole('link', { name: /exit (wizard|setup)/i }).first();
    if (await exitWizardLink.isVisible().catch(() => false)) {
      await exitWizardLink.click();
    } else {
      await page
        .getByRole('button', { name: /exit (wizard|setup)/i })
        .first()
        .click();
    }
    await waitForStandardSettingsReady(page);
    await expect(
      page.getByRole('heading', { name: /(build|set up) your event step by step/i }),
    ).toHaveCount(0);

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1`);
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(page.getByRole('heading', { name: /registration/i }).first()).toBeVisible();

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
    await expect(
      page.getByRole('heading', {
        name: /this event is ready for publish review|everything looks good.*publish when you'?re ready|checking publish readiness/i,
      }),
    ).toBeVisible();

    const skippedRegistrationChip = page
      .getByRole('button', { name: /registration(?:\s*-\s*skipped)?/i })
      .first();
    await expect(skippedRegistrationChip).toBeVisible();

    await page.reload();
    await waitForWizardReady(page);
    await expect(
      page.getByRole('button', { name: /registration(?:\s*-\s*skipped)?/i }).first(),
    ).toBeVisible();

    await page
      .getByRole('button', { name: /registration(?:\s*-\s*skipped)?/i })
      .first()
      .click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('registration');
    await expect(page.getByRole('heading', { name: /registration/i }).first()).toBeVisible();
  });

  test('review highlights publish vs required blockers and routes recovery to the first blocker', async ({
    page,
  }) => {
    await signInAsOrganizer(page, nonProOrganizerCreds);

    await page.goto(`/en/dashboard/events/${blockedEventId}/settings?wizard=1&step=review`);
    await waitForWizardReady(page);
    await expect(
      page.getByRole('heading', {
        name: /resolve these blockers before publishing|fix these issues before publishing/i,
      }),
    ).toBeVisible();
    await expect(page.getByText('Publish blocker', { exact: true })).toBeVisible();
    await expect(page.getByText('Required setup', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /fix first blocker|fix first issue/i }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('distances');
    await expect(page.getByRole('heading', { name: /distances/i }).first()).toBeVisible();
  });

  test('read-only organizer memberships see an explicit assistant lock state instead of a dead-end copilot', async ({
    page,
  }) => {
    await signInAsOrganizer(page, viewerOrganizerCreds);

    await page.goto(`/en/dashboard/events/${readyEventId}/settings?wizard=1&step=content`);
    await waitForWizardReady(page);
    await expect(
      page.getByText(/assistant is read-only for this membership|view-only access/i),
    ).toBeVisible();
    await expect(
      page.getByText(
        /only organizers with edit access can use or apply assistant proposals|only race directors with edit access can apply proposals/i,
      ),
    ).toBeVisible();
    await expect(page.getByRole('textbox', { name: /message for setup assistant/i })).toHaveCount(
      0,
    );
  });

  test('desktop assistant route mounts exactly one workspace panel subtree and keeps draft continuity without duplicate controls', async ({
    page,
  }) => {
    await signInAsOrganizer(page, proOrganizerCreds);
    await page.setViewportSize({ width: 1440, height: 960 });

    await page.goto(
      `/en/dashboard/events/${assistantReadyEventId}/settings?wizard=1&step=basics&assistant=1`,
    );
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('basics');
    await expect(assistantTextarea(page)).toHaveCount(1);

    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);
    await expect(assistantSendButtons(page)).toHaveCount(1);

    await assistantTextarea(page).fill('Keep this draft mounted only once on the basics step.');

    await page.goto(
      `/en/dashboard/events/${assistantReadyEventId}/settings?wizard=1&step=distances&assistant=1`,
    );
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('distances');
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);

    await page.goto(
      `/en/dashboard/events/${assistantReadyEventId}/settings?wizard=1&step=basics&assistant=1`,
    );
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('basics');
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveValue(
      'Keep this draft mounted only once on the basics step.',
    );

    await page.route('**/api/events/ai-wizard', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'synthetic assistant failure for duplicate-mount regression',
        }),
      });
    });

    await assistantTextarea(page).fill('Trigger the pending assistant state once.');
    await assistantSendButtons(page).first().click();

    await expect(assistantStopButtons(page)).toHaveCount(1);
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);

    await expect(assistantStopButtons(page)).toHaveCount(0);
    await expect(assistantSendButtons(page)).toHaveCount(1);
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);
  });

  test('wrong-locale protected settings entry normalizes once without leaving duplicate protected or assistant trees', async ({
    page,
  }) => {
    await signInAsOrganizer(page, proOrganizerCreds);
    await page.setViewportSize({ width: 1440, height: 960 });

    const wrongLocaleUrl = `/en/dashboard/events/${assistantReadyEventId}/settings?wizard=1&step=basics&assistant=1`;
    const normalizedUrl = `/tablero/eventos/${assistantReadyEventId}/configuracion?wizard=1&step=basics&assistant=1`;

    await page.goto('/tablero');
    await expect(page).toHaveURL(/\/tablero(?:\?.*)?$/, { timeout: 30_000 });

    await page.goto(wrongLocaleUrl);
    await expect(page).toHaveURL(normalizedUrl, { timeout: 30_000 });

    const normalizedSearch = new URL(page.url()).searchParams;
    expect(normalizedSearch.get('wizard')).toBe('1');
    expect(normalizedSearch.get('step')).toBe('basics');
    expect(normalizedSearch.get('assistant')).toBe('1');

    await expect(page.getByTestId('protected-layout-subtree')).toHaveCount(1);
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);
    await expect(assistantSendButtons(page)).toHaveCount(1);

    await page.goBack();
    await expect(page).toHaveURL(/\/tablero(?:\?.*)?$/, { timeout: 30_000 });

    await page.goForward();
    await expect(page).toHaveURL(normalizedUrl, { timeout: 30_000 });
    await expect(page.getByTestId('protected-layout-subtree')).toHaveCount(1);
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);
    await expect(assistantSendButtons(page)).toHaveCount(1);

    await page.goto(normalizedUrl);
    await expect(page).toHaveURL(normalizedUrl, { timeout: 30_000 });
    await expect(page.getByTestId('protected-layout-subtree')).toHaveCount(1);
    await expect(assistantPanelInstance(page)).toHaveCount(1);
    await expect(assistantDialog(page)).toHaveCount(1);
    await expect(assistantOverlay(page)).toHaveCount(1);
    await expect(assistantTextarea(page)).toHaveCount(1);
    await expect(assistantSendButtons(page)).toHaveCount(1);
  });
});
