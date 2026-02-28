import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';

import { getTestDb } from '../utils/db';
import {
  assignUserRole,
  createTestRole,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';

let staffCreds: { id: string; email: string; password: string; name: string };
let ownershipTraceId = '';

async function signInAsStaff(
  page: Page,
  credentials: { email: string; password: string },
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto('/en/sign-in');
    await page.getByLabel(/email/i).fill(credentials.email);
    await page.getByLabel(/password/i).fill(credentials.password);
    await page.getByRole('button', { name: /sign in/i }).click();

    const redirected = await page
      .waitForURL(/\/(admin|dashboard|settings)/, { timeout: 15000 })
      .then(() => true)
      .catch(() => false);

    if (redirected) {
      await page.waitForLoadState('networkidle');
      return;
    }

    if (attempt < 2) {
      await page.waitForTimeout(1000);
    }
  }

  throw new Error('Staff sign-in did not complete after retries');
}

async function openPaymentsWorkspace(page: Page) {
  const targetPath = '/en/admin/payments';

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(targetPath, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle');
      if (new URL(page.url()).pathname === targetPath) {
        return;
      }
    } catch (error) {
      if (attempt === 2) {
        throw error;
      }
    }

    await page.waitForTimeout(500);
  }

  await expect(page).toHaveURL(/\/en\/admin\/payments/);
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

    ownershipTraceId = `trace:ownership-${Date.now()}`;
    const rootDisputeId = '55555555-5555-4555-8555-555555555555';
    const openedAt = new Date(Date.now() - 10 * 60 * 1000);

    await db.insert(schema.moneyTraces).values({
      traceId: ownershipTraceId,
      organizerId: null,
      rootEntityType: 'dispute_case',
      rootEntityId: rootDisputeId,
      createdBySource: 'api',
      metadataJson: {
        seededBy: 'payments-admin-e2e',
      },
      createdAt: new Date(openedAt.getTime() - 60 * 1000),
    });

    await db.insert(schema.moneyEvents).values([
      {
        traceId: ownershipTraceId,
        organizerId: null,
        eventName: 'dispute.opened',
        eventVersion: 1,
        entityType: 'dispute_case',
        entityId: rootDisputeId,
        source: 'api',
        idempotencyKey: `${ownershipTraceId}:opened`,
        occurredAt: openedAt,
        payloadJson: {
          reasonCode: 'evidence_required',
        },
        metadataJson: {},
      },
      {
        traceId: ownershipTraceId,
        organizerId: null,
        eventName: 'dispute.under_review',
        eventVersion: 1,
        entityType: 'dispute_case',
        entityId: rootDisputeId,
        source: 'api',
        idempotencyKey: `${ownershipTraceId}:under-review`,
        occurredAt: new Date(openedAt.getTime() + 60 * 1000),
        payloadJson: {
          reviewStage: 'platform_review',
        },
        metadataJson: {},
      },
    ]);

    await context.close();
  });

  test('1.1-E2E-001 staff user can access the existing admin payments workspace', async ({
    page,
  }) => {
    await signInAsStaff(page, staffCreds);
    await openPaymentsWorkspace(page);

    await expect(page).toHaveURL(/\/en\/admin\/payments/);
    await expect(page.getByRole('heading', { name: 'Payments economics' })).toBeVisible();
    await expect(page.getByText('Net recognized fees')).toBeVisible();
    await expect(page.getByText('Debt and dispute concentration')).toBeVisible();
    await expect(page.getByText('Deterministic MXN report')).toBeVisible();
    await expect(page.getByText('Daily FX management')).toBeVisible();
    await expect(page.getByText('Artifact governance')).toBeVisible();
    await expect(page.getByText('Financial case lookup')).toBeVisible();
    await expect(page.getByText('Evidence pack review')).toBeVisible();
  });

  test('1.2-E2E-001 staff user can reuse the same trace identifier across support lookup and evidence review', async ({
    page,
  }) => {
    await signInAsStaff(page, staffCreds);
    await openPaymentsWorkspace(page);

    await expect(page).toHaveURL(/\/en\/admin\/payments/);

    const sharedTraceId = `trace:missing-${Date.now()}`;
    await page.getByLabel('Trace or transaction identifier').fill(sharedTraceId);
    await page.getByRole('button', { name: 'Search cases' }).click();

    await expect(
      page.getByText('No matching financial cases were found for the provided identifier.'),
    ).toBeVisible();

    await page.getByPlaceholder('trace:...', { exact: true }).fill(sharedTraceId);
    await page.getByRole('button', { name: 'Load evidence pack' }).click();

    await expect(
      page.getByText('No evidence pack data was found for the selected trace.'),
    ).toBeVisible();
  });

  test('8.3-E2E-001 support timeline exposes ownership state, current owner, and next transition', async ({
    page,
  }) => {
    await signInAsStaff(page, staffCreds);
    await page.goto(`/en/admin/payments?evidenceTraceId=${encodeURIComponent(ownershipTraceId)}`);

    await expect(page).toHaveURL(/\/en\/admin\/payments\?evidenceTraceId=/);
    await expect(page.getByText('dispute.opened')).toBeVisible();
    await expect(page.getByText('dispute.under_review')).toBeVisible();
    await expect(page.getByText('Action Needed').first()).toBeVisible();
    await expect(page.getByText('In Progress').first()).toBeVisible();
    await expect(page.getByText('platform').first()).toBeVisible();
    await expect(page.getByText('dispute.won_or_lost').first()).toBeVisible();
  });
});
