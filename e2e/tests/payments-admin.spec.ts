import { test, expect, type Page } from '@playwright/test';
import { eq } from 'drizzle-orm';
import * as schema from '@/db/schema';

import { getTestDb } from '../utils/db';
import { signInAsUser } from '../utils/helpers';
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
  await signInAsUser(page, credentials, {
    expectedDestinations: [/\/admin(?:\/|$)/, /\/dashboard(?:\/|$)/, /\/settings(?:\/|$)/],
  });
}

async function openPaymentsWorkspace(
  page: Page,
  options?: { evidenceTraceId?: string; workspace?: 'economics' | 'investigation' | 'risk' | 'operations' | 'volume' },
) {
  const targetPath = '/en/admin/payments';
  const searchParams = new URLSearchParams();

  if (options?.evidenceTraceId) {
    searchParams.set('evidenceTraceId', options.evidenceTraceId);
  }
  if (options?.workspace) {
    searchParams.set('workspace', options.workspace);
  }

  const targetUrl = searchParams.size > 0 ? `${targetPath}?${searchParams.toString()}` : targetPath;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(new RegExp(`${targetPath}(?:\\?|$)`));
  await expect(page.getByTestId('admin-payments-workspace-shell')).toBeVisible();
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
    await openPaymentsWorkspace(page, { workspace: 'economics' });

    await expect(page).toHaveURL(/\/en\/admin\/payments/);
    await expect(page.getByTestId('admin-payments-workspace-title')).toBeVisible();
    await expect(page.getByTestId('admin-payments-workspace-tab-economics')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('admin-payments-workspace-tab-risk')).toBeVisible();
    await expect(page.getByTestId('admin-payments-workspace-tab-operations')).toBeVisible();
    await expect(page.getByTestId('admin-payments-workspace-tab-investigation')).toBeVisible();
    await expect(page.getByText('Platform economics')).toBeVisible();
    await expect(page.getByText('Reviewed period')).toBeVisible();

    await page.getByTestId('admin-payments-workspace-tab-operations').click();
    await expect(page.getByTestId('admin-payments-workspace-tab-operations')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('admin-payments-fx-dashboard')).toBeVisible();
    await expect(page.getByTestId('admin-payments-artifact-governance-dashboard')).toBeVisible();
  });

  test('1.2-E2E-001 staff user can reuse the same trace identifier across support lookup and evidence review', async ({
    page,
  }) => {
    await signInAsStaff(page, staffCreds);
    await openPaymentsWorkspace(page, { workspace: 'investigation' });

    await expect(page).toHaveURL(/\/en\/admin\/payments/);
    await expect(page.getByTestId('admin-payments-workspace-tab-investigation')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByTestId('admin-payments-case-lookup-dashboard')).toBeVisible();

    const sharedTraceId = `trace:missing-${Date.now()}`;
    await page.getByLabel('ID or trace').fill(sharedTraceId);
    await page.getByRole('button', { name: 'Search cases' }).click();

    await expect(page.getByText('No matches found')).toBeVisible();
    await expect(
      page.getByText('We could not find a case for that identifier. Check the trace, payout request ID, or idempotency key.'),
    ).toBeVisible();

    await page.getByRole('button', { name: /Open a trace/i }).click();
    await expect(page.getByTestId('admin-payments-evidence-dashboard')).toBeVisible();
    await page.getByRole('textbox', { name: 'Technical trace' }).fill(sharedTraceId);
    await page.getByRole('button', { name: 'Load evidence pack' }).click();

    await expect(page.getByText('No evidence found for that trace')).toBeVisible();
    await expect(
      page.getByText('That trace did not return an evidence pack. Verify the identifier or go back to case lookup.'),
    ).toBeVisible();
  });

  test('8.3-E2E-001 support timeline exposes ownership state, current owner, and next transition', async ({
    page,
  }) => {
    await signInAsStaff(page, staffCreds);
    await openPaymentsWorkspace(page, {
      evidenceTraceId: ownershipTraceId,
      workspace: 'investigation',
    });

    await expect(page).toHaveURL(/\/en\/admin\/payments\?.*evidenceTraceId=/);
    const evidenceDashboard = page.getByTestId('admin-payments-evidence-dashboard');
    await expect(evidenceDashboard).toBeVisible();
    await expect(evidenceDashboard).toContainText('dispute.opened');
    await expect(evidenceDashboard).toContainText('dispute.under_review');
    await expect(page.getByTestId('admin-payments-evidence-current-state')).toContainText(
      'In progress',
    );
    await expect(page.getByTestId('admin-payments-evidence-current-owner')).toContainText(
      'platform',
    );
    await expect(page.getByTestId('admin-payments-evidence-next-transition')).toContainText(
      'dispute.won_or_lost',
    );
  });
});
