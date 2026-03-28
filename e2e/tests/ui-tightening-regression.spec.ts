import { test, expect } from '@playwright/test';
import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestEventEdition,
  createTestEventSeries,
  createTestOrganization,
  createTestProfile,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

/**
 * Regression coverage for Epic 8 UI tightening:
 * - SAFE/NEXT/DETAILS + trust rail "Next action" stays actionable
 * - Review lane finalization gate disables proceed when draft is empty
 * - Mobile results table uses the card/list layout (no hidden actions)
 */

let organizerCreds: { id: string; email: string; password: string; name: string };
let eventId: string;

test.describe('UI Tightening Regression', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'ui-tight-', {
      name: 'UI Tightening Organizer',
    });
    await setUserVerified(db, organizerCreds.email);

    await createTestProfile(db, organizerCreds.id, {
      dateOfBirth: new Date('1990-05-15'),
      gender: 'male',
      phone: '+523312345678',
      city: 'Mexico City',
      state: 'CDMX',
      emergencyContactName: 'Test Contact',
      emergencyContactPhone: '+523387654321',
    });
    await assignExternalRole(db, organizerCreds.id, 'organizer');

    const organization = await createTestOrganization(db, organizerCreds.id, {
      name: `UI Tightening Org ${Date.now()}`,
    });
    const series = await createTestEventSeries(db, organization.id, {
      name: `UI Tightening Event ${Date.now()}`,
    });
    const edition = await createTestEventEdition(db, series.id, {
      editionLabel: '2026',
      visibility: 'draft',
      city: 'Monterrey',
      state: 'Nuevo León',
      locationDisplay: 'Monterrey, Nuevo León, Mexico',
    });

    eventId = edition.id;

    await context.close();
  });

  test('Results review: proceed is disabled when draft is empty', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);

    await page.goto(`/en/dashboard/events/${eventId}/results/review`);

    const feedback = page.getByTestId('draft-review-proceed-feedback');
    await expect(feedback).toBeVisible({ timeout: 30000 });

    const gate = page.locator('section').filter({ has: feedback }).first();
    await expect(gate.getByRole('button').first()).toBeDisabled();
  });

  test('Results home: primary next step is prioritized above supporting work', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);

    await page.goto(`/en/dashboard/events/${eventId}/results`);

    await expect(page.getByRole('heading', { name: /what to do now/i })).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByRole('heading', { name: /create or update a draft/i })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /supporting work after publication/i }),
    ).toBeVisible();

    const nextStepLink = page.getByRole('link', { name: /start a new draft/i }).first();
    await expect(nextStepLink).toHaveAttribute(
      'href',
      new RegExp(`/en/dashboard/events/${eventId}/results/capture/?$`),
    );
  });

  test('Results import: Next action is an actionable link to the review lane', async ({ page }) => {
    await signInAsOrganizer(page, organizerCreds);

    await page.goto(`/en/dashboard/events/${eventId}/results/import`);

    const rail = page.getByRole('region', { name: /results state rail/i });
    const nextActionLink = rail.locator('a');

    await expect(nextActionLink).toHaveAttribute(
      'href',
      new RegExp(`/en/dashboard/events/${eventId}/results/review/?$`),
    );
  });

  test('Results capture: mobile viewport uses card layout for results table', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await signInAsOrganizer(page, organizerCreds);

    await page.goto(`/en/dashboard/events/${eventId}/results/capture`);

    await expect(page.getByTestId('pro-results-grid-mobile')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('pro-results-grid-table')).toBeHidden();
  });
});
