import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';

import { getTestDb } from '../utils/db';
import {
  assignUserRole,
  createTestRole,
  getUserByEmail,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';

let staffCreds: { email: string; password: string; name: string };

async function signInAsStaff(
  page: Page,
  credentials: { email: string; password: string },
) {
  await page.goto('/en/sign-in');
  await page.getByLabel(/email/i).fill(credentials.email);
  await page.getByLabel(/password/i).fill(credentials.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/\/(admin|dashboard|settings)/, { timeout: 45000 });
}

test.describe('Payments Admin E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    staffCreds = await signUpTestUser(page, 'staff-payments-', {
      name: 'Payments Staff User',
    });
    await setUserVerified(db, staffCreds.email);

    const staffUser = await getUserByEmail(db, staffCreds.email);
    if (!staffUser) {
      throw new Error('Failed to create staff test user');
    }

    let staffRole = await db.query.roles.findFirst({
      where: eq(schema.roles.name, 'staff'),
    });
    if (!staffRole) {
      staffRole = await createTestRole(db, {
        name: 'staff',
        description: 'Internal staff role for E2E tests',
      });
    }
    await assignUserRole(db, staffUser.id, staffRole.id);

    await context.close();
  });

  test('staff user can access admin payments workspace and run support workflows', async ({
    page,
  }) => {
    await signInAsStaff(page, staffCreds);
    await page.goto('/en/admin/payments');

    await expect(page).toHaveURL(/\/en\/admin\/payments/);
    await expect(page.getByRole('heading', { name: 'Payments economics' })).toBeVisible();
    await expect(page.getByText('Net recognized fees')).toBeVisible();
    await expect(page.getByText('Debt and dispute concentration')).toBeVisible();
    await expect(page.getByText('Deterministic MXN report')).toBeVisible();
    await expect(page.getByText('Daily FX management')).toBeVisible();
    await expect(page.getByText('Artifact governance')).toBeVisible();
    await expect(page.getByText('Financial case lookup')).toBeVisible();
    await expect(page.getByText('Evidence pack review')).toBeVisible();

    const lookupQuery = `trace:missing-${Date.now()}`;
    await page.getByLabel('Trace or transaction identifier').fill(lookupQuery);
    await page.getByRole('button', { name: 'Search cases' }).click();

    await expect(
      page.getByText('No matching financial cases were found for the provided identifier.'),
    ).toBeVisible();

    const evidenceTrace = `trace:missing-evidence-${Date.now()}`;
    await page.getByPlaceholder('trace:...', { exact: true }).fill(evidenceTrace);
    await page.getByRole('button', { name: 'Load evidence pack' }).click();

    await expect(
      page.getByText('No evidence pack data was found for the selected trace.'),
    ).toBeVisible();
  });
});
