import { randomUUID } from 'crypto';
import { test, expect, type Page } from '@playwright/test';
import { eq, sql } from 'drizzle-orm';

import * as schema from '@/db/schema';

import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestProfile,
  seedActiveProEntitlement,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

let nonProOrganizerCreds: { id: string; email: string; password: string; name: string };
let proOrganizerCreds: { id: string; email: string; password: string; name: string };
let nonProOrganizationName: string;
let proOrganizationName: string;

async function openEventDetailsStep(page: Page, organizationName: string) {
  await page.goto('/en/dashboard/events/new');

  const orgButton = page.locator('button').filter({ hasText: organizationName }).first();
  await expect(orgButton).toBeVisible({ timeout: 10_000 });
  await orgButton.click();
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /continue/i }).click();
  await expect(page.getByText(/event details/i).first()).toBeVisible({ timeout: 10_000 });
}

async function fillCoreEventFields(
  page: Page,
  options: {
    seriesName: string;
    description: string;
    organizerBrief?: string;
  },
) {
  await page.getByPlaceholder(/ultra trail mexico/i).fill(options.seriesName);
  await page.getByPlaceholder(/(share )?what makes (this event|this race) special/i).fill(
    options.description,
  );

  if (options.organizerBrief) {
    await page
      .getByRole('button', { name: /add (ai context|notes for the setup assistant)/i })
      .click();
    await page.getByPlaceholder(/boutique trail weekend/i).fill(options.organizerBrief);
  }
}

function extractEventId(url: string) {
  const match = url.match(/\/dashboard\/events\/([a-f0-9-]{36})\/settings\?wizard=1/i);
  return match?.[1] ?? null;
}

async function createOwnedOrganization(
  db: ReturnType<typeof getTestDb>,
  userId: string,
  options: {
    name: string;
    slug: string;
  },
) {
  const organizationId = randomUUID();

  await db.insert(schema.organizations).values({
    id: organizationId,
    name: options.name,
    slug: options.slug,
  });

  await db.insert(schema.organizationMemberships).values({
    organizationId,
    userId,
    role: 'owner',
  });

  return {
    id: organizationId,
    name: options.name,
    slug: options.slug,
  };
}

test.describe('Event create AI brief continuity', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    await db.execute(sql`ALTER TABLE event_editions ADD COLUMN IF NOT EXISTS organizer_brief text`);

    nonProOrganizerCreds = await signUpTestUser(page, 'create-ai-brief-non-pro-', {
      name: 'Create AI Brief Non-Pro Organizer',
    });
    proOrganizerCreds = await signUpTestUser(page, 'create-ai-brief-pro-', {
      name: 'Create AI Brief Pro Organizer',
    });

    await createTestProfile(db, nonProOrganizerCreds.id, {
      dateOfBirth: new Date('1990-01-01'),
      gender: 'male',
      phone: '+523312345611',
      city: 'Guadalajara',
      state: 'Jalisco',
      emergencyContactName: 'Create Flow Contact',
      emergencyContactPhone: '+523312345612',
    });
    await createTestProfile(db, proOrganizerCreds.id, {
      dateOfBirth: new Date('1991-02-02'),
      gender: 'female',
      phone: '+523312345621',
      city: 'Monterrey',
      state: 'Nuevo León',
      emergencyContactName: 'Create Flow Pro Contact',
      emergencyContactPhone: '+523312345622',
    });
    await assignExternalRole(db, nonProOrganizerCreds.id, 'organizer');
    await assignExternalRole(db, proOrganizerCreds.id, 'organizer');

    await seedActiveProEntitlement(db, proOrganizerCreds.id, {
      grantedByUserId: nonProOrganizerCreds.id,
      grantDurationDays: 14,
      reason: 'e2e_active_pro_entitlement_event_create_ai_brief',
    });

    const suffix = randomUUID().slice(0, 8);
    const nonProOrg = await createOwnedOrganization(db, nonProOrganizerCreds.id, {
      name: `Create Flow Non-Pro Org ${Date.now()}`,
      slug: `create-flow-non-pro-org-${suffix}`,
    });
    const proOrg = await createOwnedOrganization(db, proOrganizerCreds.id, {
      name: `Create Flow Pro Org ${Date.now()}`,
      slug: `create-flow-pro-org-${randomUUID().slice(0, 8)}`,
    });

    nonProOrganizationName = nonProOrg.name;
    proOrganizationName = proOrg.name;

    await context.close();
  });

  test('shows draft-stage guidance and keeps non-Pro create flow lightweight', async ({ page }) => {
    await signInAsOrganizer(page, nonProOrganizerCreds);
    await openEventDetailsStep(page, nonProOrganizationName);

    await expect(
      page.getByText(/a short draft is (enough for now|fine)\.?\s*cover the format, location, and (what makes it special|what makes it worth running)\./i),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /add ai context/i })).toHaveCount(0);

    const seriesName = `Non-Pro Draft ${Date.now()}`;
    await fillCoreEventFields(page, {
      seriesName,
      description: 'Community 10K in Guadalajara with live timing and a celebratory finish area.',
    });

    await page.getByRole('button', { name: /create event/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/events\/[a-f0-9-]{36}\/settings\?wizard=1/i, {
      timeout: 90_000,
    });
  });

  test('carries the Pro organizer brief from create flow into the wizard', async ({ page }) => {
    const db = getTestDb();
    await signInAsOrganizer(page, proOrganizerCreds);
    await openEventDetailsStep(page, proOrganizationName);

    await expect(
      page.getByText(/a short draft is (enough for now|fine)\.?\s*cover the format, location, and (what makes it special|what makes it worth running)\./i),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /add (ai context|notes for the setup assistant)/i }),
    ).toBeVisible();

    const seriesName = `Pro Brief Continuity ${Date.now()}`;
    const organizerBrief =
      'Boutique trail weekend with polished markdown, premium sponsors, family-friendly 5K, and a scenic forest route.';

    await fillCoreEventFields(page, {
      seriesName,
      description: 'Scenic trail race weekend near Valle de Bravo with a polished participant experience.',
      organizerBrief,
    });

    await page.getByRole('button', { name: /create event/i }).click();
    await expect(page).toHaveURL(/\/dashboard\/events\/[a-f0-9-]{36}\/settings\?wizard=1/i, {
      timeout: 90_000,
    });

    const eventId = extractEventId(page.url());
    expect(eventId).not.toBeNull();

    const [edition] = await db
      .select({
        organizerBrief: schema.eventEditions.organizerBrief,
      })
      .from(schema.eventEditions)
      .where(eq(schema.eventEditions.id, eventId!))
      .limit(1);

    expect(edition?.organizerBrief).toBe(organizerBrief);
  });
});
