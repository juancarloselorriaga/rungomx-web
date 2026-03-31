import { test, expect, type Locator, type Page } from '@playwright/test';

import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestOrganization,
  createTestProfile,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

let organizerCreds: { id: string; email: string; password: string; name: string };
let organizationName: string;

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildFutureEventDate(daysAhead = 120) {
  const date = new Date();
  date.setDate(date.getDate() + daysAhead);
  return formatIsoDate(date);
}

function formatDisplayDate(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('en', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day));
}

function extractEventId(url: string) {
  return url.match(/\/dashboard\/events\/([a-f0-9-]{36})\/settings\?wizard=1/i)?.[1] ?? null;
}

async function waitForWizardReady(page: Page) {
  const buildIndicator = page.locator('text=/Compiling|Rendering/i');
  if (await buildIndicator.isVisible().catch(() => false)) {
    await expect(buildIndicator).not.toBeVisible({ timeout: 60_000 });
  }

  await expect(page.getByRole('heading', { name: /set up your event step by step/i })).toBeVisible({
    timeout: 30_000,
  });
}

async function setDatePickerValue(page: Page, trigger: Locator, isoDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid YYYY-MM-DD date: ${isoDate}`);
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const day = Number(match[3]);
  const monthLabel = new Date(year, monthIndex, 1).toLocaleString('en', { month: 'long' });

  await trigger.click();

  const popover = page
    .locator('[data-slot="popover-content"]')
    .filter({ has: page.locator('[data-slot="calendar"]') })
    .last();
  await expect(popover).toBeVisible();

  const calendar = popover.locator('[data-slot="calendar"]');
  await expect(calendar).toBeVisible();

  const selects = calendar.locator('select');
  const selectCount = await selects.count();

  for (let index = 0; index < selectCount; index += 1) {
    const select = selects.nth(index);
    if ((await select.locator('option', { hasText: String(year) }).count()) > 0) {
      await select.selectOption({ label: String(year) });
      break;
    }
  }

  for (let index = 0; index < selectCount; index += 1) {
    const select = selects.nth(index);
    if ((await select.locator('option', { hasText: monthLabel }).count()) > 0) {
      await select.selectOption({ label: monthLabel });
      break;
    }
  }

  const dayRegex = new RegExp(`^${day}$`);
  const dayButton = calendar
    .locator('td:not([data-outside]) button', { hasText: dayRegex })
    .first();
  await expect(dayButton).toBeVisible();
  await dayButton.click();

  await expect(popover).toBeHidden();
}

async function selectConfirmedLocation(page: Page) {
  const locationButton = page.getByText(/no location (selected yet|set)|sin ubicaci[oó]n/i);
  await expect(locationButton).toBeVisible({ timeout: 10_000 });
  await locationButton.click();

  const locationDialog = page.getByRole('dialog');
  await expect(locationDialog).toBeVisible({ timeout: 10_000 });

  const searchInput = locationDialog.getByPlaceholder(/search for a place or address/i);
  await expect(searchInput).toBeVisible();
  await searchInput.fill('Parque Fundidora Monterrey');

  const venueOption = locationDialog
    .locator('button')
    .filter({ hasText: /Parque Fundidora/i })
    .filter({ hasText: /Monterrey/i })
    .first();
  await expect(venueOption).toBeVisible({ timeout: 15_000 });
  await venueOption.click();

  const confirmButton = locationDialog.getByRole('button', { name: /use this location/i });
  await expect(confirmButton).toBeVisible();
  await confirmButton.click();
  await expect(locationDialog).not.toBeVisible({ timeout: 10_000 });
}

test.describe('Event create review date blocker regression', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'org-create-review-date-', {
      name: 'Create Review Date Organizer',
    });
    await setUserVerified(db, organizerCreds.email);
    await createTestProfile(db, organizerCreds.id, {
      dateOfBirth: new Date('1990-05-15'),
      gender: 'male',
      phone: '+523312345678',
      city: 'Monterrey',
      state: 'Nuevo León',
      emergencyContactName: 'Regression Contact',
      emergencyContactPhone: '+523387654321',
    });
    await assignExternalRole(db, organizerCreds.id, 'organizer');

    const organization = await createTestOrganization(db, organizerCreds.id, {
      name: `Review Date Org ${Date.now()}`,
      slug: `review-date-org-${Date.now()}`,
    });
    organizationName = organization.name;

    await context.close();
  });

  test('keeps the created start date in basics and removes the review date blocker', async ({
    page,
  }) => {
    const eventDate = buildFutureEventDate();
    const expectedDateLabel = formatDisplayDate(eventDate);
    const seriesName = `Review Date Regression ${Date.now()}`;
    const editionLabel = String(new Date().getFullYear() + 1);

    await signInAsOrganizer(page, organizerCreds);

    await page.goto('/en/dashboard/events/new');

    const organizationButton = page.locator('button').filter({ hasText: organizationName }).first();
    await expect(organizationButton).toBeVisible({ timeout: 10_000 });
    await organizationButton.click();

    const continueButton = page.getByRole('button', { name: /continue/i });
    await expect(continueButton).toBeEnabled({ timeout: 10_000 });
    await continueButton.click();

    await expect(page.getByRole('heading', { name: /event details/i })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByPlaceholder(/ultra trail mexico/i).fill(seriesName);
    await page
      .getByPlaceholder(/ultra-trail-mx/i)
      .fill(seriesName.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    await page.getByPlaceholder('2025').first().fill(editionLabel);
    await page.getByPlaceholder('2025').last().fill(editionLabel.toLowerCase());

    const eventDateTrigger = page
      .getByRole('button', { name: /^Event date$|^mm\/dd\/yyyy$/i })
      .first();
    await expect(eventDateTrigger).toBeVisible({ timeout: 10_000 });
    await setDatePickerValue(page, eventDateTrigger, eventDate);

    await selectConfirmedLocation(page);

    const createEventButton = page.getByRole('button', { name: /create event/i });
    await expect(createEventButton).toBeEnabled({ timeout: 30_000 });
    await createEventButton.click();

    await expect(page).toHaveURL(/\/en\/dashboard\/events\/[a-f0-9-]{36}\/settings\?wizard=1/i, {
      timeout: 90_000,
    });
    await waitForWizardReady(page);

    const eventId = extractEventId(page.url());
    expect(eventId).not.toBeNull();

    const basicsHeading = page.getByRole('heading', { name: /event basics/i });
    await expect(basicsHeading).toBeVisible();
    const startDateControl = page.getByRole('button', { name: /start date/i }).first();
    await expect(startDateControl).toContainText(expectedDateLabel);
    await expect(page.getByRole('textbox', { name: /^Start Time$/i })).toHaveValue(/^\d{2}:\d{2}$/);

    await page.goto(`/en/dashboard/events/${eventId}/settings?wizard=1&step=review`);
    await waitForWizardReady(page);
    await expect.poll(() => new URL(page.url()).searchParams.get('step')).toBe('review');

    await expect(
      page.getByRole('heading', {
        name: /resolve these blockers before publishing|fix these issues before publishing/i,
      }),
    ).toBeVisible();

    const blockingIssueCards = page
      .getByRole('button')
      .filter({ hasText: /Publish blocker|Required setup/i });

    await expect(blockingIssueCards).toHaveCount(1);
    await expect(blockingIssueCards.first()).toContainText('Distances');
    await expect(
      page.getByText('Add a confirmed start date and time before publishing.', { exact: true }),
    ).toHaveCount(0);
    await expect(
      page
        .getByText("Can't publish yet — add at least one distance first.", { exact: true })
        .first(),
    ).toBeVisible();
  });
});
