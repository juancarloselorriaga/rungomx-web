import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'crypto';
import * as schema from '@/db/schema';
import { organizerPaymentsTelemetryStorageKey } from '@/lib/payments/organizer/telemetry';

import { getTestDb } from '../utils/db';
import {
  assignExternalRole,
  createTestOrganization,
  createTestProfile,
  setUserVerified,
  signUpTestUser,
} from '../utils/fixtures';
import { signInAsOrganizer } from '../utils/helpers';

type WalletStubOptions = {
  availableMinor?: number;
  processingMinor?: number;
};

let organizerCreds: { id: string; email: string; password: string; name: string };
let organizationId = '';
let terminalPayoutRequestId = '';
let processingPayoutRequestId = '';

async function waitForPayoutDetailPageReady(page: Page, payoutRequestId: string) {
  await expect(
    page.getByRole('status', {
      name: 'Loading payout detail',
    }),
  ).toHaveCount(0, { timeout: 20_000 });

  await expect(
    page.getByRole('heading', {
      name: `Payout #${payoutRequestId.slice(0, 8)}`,
    }),
  ).toBeVisible({ timeout: 30_000 });
}

async function seedOrganizerPayoutRecords(params: {
  organizerId: string;
  userId: string;
}) {
  const db = getTestDb();
  const now = Date.now();

  const terminalQuoteId = randomUUID();
  terminalPayoutRequestId = randomUUID();
  const terminalTraceId = `trace:payout-terminal-${now}`;

  const processingQuoteId = randomUUID();
  processingPayoutRequestId = randomUUID();
  const processingTraceId = `trace:payout-processing-${now}`;

  await db.insert(schema.payoutQuotes).values([
    {
      id: terminalQuoteId,
      organizerId: params.organizerId,
      idempotencyKey: `idempotency-terminal-${now}`,
      quoteFingerprint: `fingerprint-terminal-${now}`,
      currency: 'MXN',
      includedAmountMinor: 120_000,
      deductionAmountMinor: 0,
      maxWithdrawableAmountMinor: 120_000,
      requestedAmountMinor: 100_000,
      eligibilitySnapshotJson: {},
      componentBreakdownJson: {},
      createdByUserId: params.userId,
      requestedAt: new Date(now - 60 * 60 * 1000),
      createdAt: new Date(now - 60 * 60 * 1000),
      updatedAt: new Date(now - 60 * 60 * 1000),
    },
    {
      id: processingQuoteId,
      organizerId: params.organizerId,
      idempotencyKey: `idempotency-processing-${now}`,
      quoteFingerprint: `fingerprint-processing-${now}`,
      currency: 'MXN',
      includedAmountMinor: 90_000,
      deductionAmountMinor: 0,
      maxWithdrawableAmountMinor: 90_000,
      requestedAmountMinor: 80_000,
      eligibilitySnapshotJson: {},
      componentBreakdownJson: {},
      createdByUserId: params.userId,
      requestedAt: new Date(now - 30 * 60 * 1000),
      createdAt: new Date(now - 30 * 60 * 1000),
      updatedAt: new Date(now - 30 * 60 * 1000),
    },
  ]);

  await db.insert(schema.payoutRequests).values([
    {
      id: terminalPayoutRequestId,
      organizerId: params.organizerId,
      payoutQuoteId: terminalQuoteId,
      status: 'completed',
      traceId: terminalTraceId,
      requestedByUserId: params.userId,
      requestedAt: new Date(now - 60 * 60 * 1000),
      lifecycleContextJson: {
        currentRequestedAmountMinor: 97_500,
      },
      createdAt: new Date(now - 60 * 60 * 1000),
      updatedAt: new Date(now - 50 * 60 * 1000),
    },
    {
      id: processingPayoutRequestId,
      organizerId: params.organizerId,
      payoutQuoteId: processingQuoteId,
      status: 'processing',
      traceId: processingTraceId,
      requestedByUserId: params.userId,
      requestedAt: new Date(now - 30 * 60 * 1000),
      lifecycleContextJson: {
        currentRequestedAmountMinor: 80_000,
      },
      createdAt: new Date(now - 30 * 60 * 1000),
      updatedAt: new Date(now - 20 * 60 * 1000),
    },
  ]);

  await db.insert(schema.moneyTraces).values([
    {
      traceId: terminalTraceId,
      organizerId: params.organizerId,
      rootEntityType: 'payout_request',
      rootEntityId: terminalPayoutRequestId,
      createdBySource: 'api',
      metadataJson: {
        seededBy: 'organizer-payments-e2e',
      },
      createdAt: new Date(now - 60 * 60 * 1000),
    },
    {
      traceId: processingTraceId,
      organizerId: params.organizerId,
      rootEntityType: 'payout_request',
      rootEntityId: processingPayoutRequestId,
      createdBySource: 'api',
      metadataJson: {
        seededBy: 'organizer-payments-e2e',
      },
      createdAt: new Date(now - 30 * 60 * 1000),
    },
  ]);

  await db.insert(schema.moneyEvents).values([
    {
      id: randomUUID(),
      traceId: terminalTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.requested',
      eventVersion: 1,
      entityType: 'payout',
      entityId: terminalPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-terminal-requested-${now}`,
      occurredAt: new Date(now - 60 * 60 * 1000),
      payloadJson: {
        requestedAmount: { amountMinor: 100_000 },
      },
      metadataJson: {},
      createdAt: new Date(now - 60 * 60 * 1000),
    },
    {
      id: randomUUID(),
      traceId: terminalTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.processing',
      eventVersion: 1,
      entityType: 'payout',
      entityId: terminalPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-terminal-processing-${now}`,
      occurredAt: new Date(now - 57 * 60 * 1000),
      payloadJson: {
        currentRequestedAmount: { amountMinor: 100_000 },
      },
      metadataJson: {},
      createdAt: new Date(now - 57 * 60 * 1000),
    },
    {
      id: randomUUID(),
      traceId: terminalTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.paused',
      eventVersion: 1,
      entityType: 'payout',
      entityId: terminalPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-terminal-paused-${now}`,
      occurredAt: new Date(now - 54 * 60 * 1000),
      payloadJson: {
        currentRequestedAmount: { amountMinor: 98_500 },
        reasonCode: 'risk_manual_review',
      },
      metadataJson: {},
      createdAt: new Date(now - 54 * 60 * 1000),
    },
    {
      id: randomUUID(),
      traceId: terminalTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.resumed',
      eventVersion: 1,
      entityType: 'payout',
      entityId: terminalPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-terminal-resumed-${now}`,
      occurredAt: new Date(now - 52 * 60 * 1000),
      payloadJson: {
        currentRequestedAmount: { amountMinor: 97_500 },
      },
      metadataJson: {},
      createdAt: new Date(now - 52 * 60 * 1000),
    },
    {
      id: randomUUID(),
      traceId: terminalTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.completed',
      eventVersion: 1,
      entityType: 'payout',
      entityId: terminalPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-terminal-completed-${now}`,
      occurredAt: new Date(now - 50 * 60 * 1000),
      payloadJson: {
        settledAmount: { amountMinor: 97_500 },
      },
      metadataJson: {},
      createdAt: new Date(now - 50 * 60 * 1000),
    },
    {
      id: randomUUID(),
      traceId: processingTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.requested',
      eventVersion: 1,
      entityType: 'payout',
      entityId: processingPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-processing-requested-${now}`,
      occurredAt: new Date(now - 30 * 60 * 1000),
      payloadJson: {
        requestedAmount: { amountMinor: 80_000 },
      },
      metadataJson: {},
      createdAt: new Date(now - 30 * 60 * 1000),
    },
    {
      id: randomUUID(),
      traceId: processingTraceId,
      organizerId: params.organizerId,
      eventName: 'payout.processing',
      eventVersion: 1,
      entityType: 'payout',
      entityId: processingPayoutRequestId,
      source: 'api',
      idempotencyKey: `event-processing-processing-${now}`,
      occurredAt: new Date(now - 25 * 60 * 1000),
      payloadJson: {
        currentRequestedAmount: { amountMinor: 80_000 },
      },
      metadataJson: {},
      createdAt: new Date(now - 25 * 60 * 1000),
    },
  ]);
}

async function mockWorkspaceApis(
  page: Page,
  organizerId: string,
  options: WalletStubOptions = {},
) {
  const availableMinor = options.availableMinor ?? 120_000;
  const processingMinor = options.processingMinor ?? 0;

  await page.route('**/api/payments/wallet?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('organizationId') !== organizerId) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          organizerId,
          asOf: '2026-03-03T12:00:00.000Z',
          buckets: {
            availableMinor,
            processingMinor,
            frozenMinor: 3_000,
            debtMinor: 500,
          },
          debt: {
            waterfallOrder: [],
            categoryBalancesMinor: {},
            repaymentAppliedMinor: 0,
          },
        },
      }),
    });
  });

  await page.route('**/api/payments/wallet/issues?*', async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('organizationId') !== organizerId) {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          organizerId,
          asOf: '2026-03-03T12:00:00.000Z',
          actionNeeded: [
            {
              eventId: randomUUID(),
              traceId: `trace:action-needed-${Date.now()}`,
              eventName: 'payout.paused',
              entityType: 'payout',
              entityId: processingPayoutRequestId,
              occurredAt: '2026-03-03T11:50:00.000Z',
              state: 'action_needed',
              stateLabel: 'Action Needed',
              stateDescription: 'Manual review required before payout can continue.',
              recoveryGuidance: null,
            },
          ],
          inProgress: [
            {
              eventId: randomUUID(),
              traceId: `trace:in-progress-${Date.now()}`,
              eventName: 'payout.processing',
              entityType: 'payout',
              entityId: terminalPayoutRequestId,
              occurredAt: '2026-03-03T11:40:00.000Z',
              state: 'in_progress',
              stateLabel: 'In Progress',
              stateDescription: 'Settlement checks running.',
              recoveryGuidance: null,
            },
          ],
        },
      }),
    });
  });
}

test.describe('Organizer Payments E2E', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ browser }) => {
    const db = getTestDb();
    const context = await browser.newContext();
    const page = await context.newPage();

    organizerCreds = await signUpTestUser(page, 'organizer-payments-', {
      name: 'Organizer Payments User',
    });
    await setUserVerified(db, organizerCreds.email);
    await assignExternalRole(db, organizerCreds.id, 'organizer');
    await createTestProfile(db, organizerCreds.id, {
      phone: '+523312345678',
      city: 'Monterrey',
      state: 'Nuevo Leon',
      dateOfBirth: new Date('1992-05-02'),
      emergencyContactName: 'Payments Contact',
      emergencyContactPhone: '+523387654321',
      gender: 'male',
      shirtSize: 'm',
      bloodType: 'o+',
    });

    const organization = await createTestOrganization(db, organizerCreds.id, {
      name: `Organizer Payments Org ${Date.now()}`,
      slug: `organizer-payments-org-${Date.now()}`,
    });
    organizationId = organization.id;

    await seedOrganizerPayoutRecords({
      organizerId: organizationId,
      userId: organizerCreds.id,
    });

    await context.close();
  });

  test('11.4-E2E-001 organizer discovers payments workspace and enters payout flow with keyboard', async ({
    page,
  }) => {
    await signInAsOrganizer(page, organizerCreds);
    await mockWorkspaceApis(page, organizationId, { availableMinor: 140_000, processingMinor: 0 });

    await page.goto(`/en/dashboard/payments?organizationId=${organizationId}`);

    await expect(page).toHaveURL(new RegExp(`/en/dashboard/payments\\?organizationId=${organizationId}`));
    await expect(page.getByRole('heading', { name: 'Payments', exact: true }).first()).toBeVisible();
    await expect(page.getByTestId('payments-action-queue')).toBeVisible();
    await expect(page.getByTestId('payments-action-needed-section')).toBeVisible();
    await expect(page.getByTestId('payments-in-progress-section')).toBeVisible();
    await expect(page.getByTestId('payments-current-payout-link')).toBeVisible();

    await page.getByTestId('payments-current-payout-link').focus();
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(
      new RegExp(`/en/dashboard/payments/payouts/[0-9a-f-]+$`),
    );
  });

  test('11.4-E2E-002 organizer can request payout and handle conflict -> queue fallback', async ({
    page,
  }) => {
    await signInAsOrganizer(page, organizerCreds);

    let queuedIntentCount = 0;
    let queuedIntentRequestedAmountMinor: number | null = null;
    await page.route('**/api/payments/payouts/queued-intents', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      queuedIntentCount += 1;
      let payload: { requestedAmountMinor?: number } | null = null;
      try {
        payload = route.request().postDataJSON() as { requestedAmountMinor?: number } | null;
      } catch {
        const rawPayload = route.request().postData();
        if (rawPayload) {
          try {
            payload = JSON.parse(rawPayload) as { requestedAmountMinor?: number };
          } catch {
            payload = null;
          }
        }
      }
      queuedIntentRequestedAmountMinor = payload?.requestedAmountMinor ?? null;

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            payoutQueuedIntentId: randomUUID(),
            requestedAmountMinor: 50_000,
            blockedReasonCode: 'active_payout_lifecycle_conflict',
          },
        }),
      });
    });

    let requestCount = 0;
    await page.route('**/api/payments/payouts', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      requestCount += 1;
      if (requestCount === 1) {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              payoutQuoteId: randomUUID(),
              payoutRequestId: terminalPayoutRequestId,
              payoutContractId: randomUUID(),
              maxWithdrawableAmountMinor: 120_000,
              requestedAmountMinor: 50_000,
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PAYOUT_REQUEST_ACTIVE_CONFLICT_QUEUE_REQUIRED',
          suggestedAction: 'submit_queue_intent',
        }),
      });
    });

    await page.goto(`/en/dashboard/payments/payouts?organizationId=${organizationId}`);

    await page.getByRole('button', { name: 'New payout' }).click();
    const payoutDialog = page.getByRole('dialog');
    await expect(payoutDialog).toBeVisible();
    const amountInput = payoutDialog.getByLabel('Payout amount');
    await expect(amountInput).toBeVisible();

    await amountInput.fill('50000');
    const firstPayoutSubmitCount = requestCount;
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/payments/payouts') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
      ),
      page.getByRole('button', { name: 'Request payout' }).click(),
    ]);
    await expect.poll(() => requestCount).toBe(firstPayoutSubmitCount + 1);
    await expect(page.getByText('Payout requested')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open details' })).toBeVisible();

    await amountInput.fill('50000');
    const secondPayoutSubmitCount = requestCount;
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/payments/payouts') &&
          response.request().method() === 'POST' &&
          response.status() === 409,
      ),
      page.getByRole('button', { name: 'Request payout' }).click(),
    ]);
    await expect.poll(() => requestCount).toBe(secondPayoutSubmitCount + 1);
    await expect(
      page.getByText(
        'This organizer already has an active payout. Queue the next request for when the current cycle finishes.',
      ),
    ).toBeVisible();

    const queueButton = page.getByRole('button', { name: 'Prepare next payout' });
    await expect(queueButton).toBeVisible();
    const queueIntentSubmitCount = queuedIntentCount;
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().includes('/api/payments/payouts/queued-intents') &&
          response.request().method() === 'POST' &&
          response.status() === 201,
      ),
      queueButton.click(),
    ]);

    await expect(page.getByText('Next payout prepared')).toBeVisible();
    await expect.poll(() => requestCount).toBe(2);
    await expect.poll(() => queuedIntentCount).toBe(queueIntentSubmitCount + 1);
    await expect.poll(() => queuedIntentRequestedAmountMinor).toBe(50_000);
  });

  test('11.4-E2E-003 organizer can inspect lifecycle detail and statement availability states', async ({
    page,
  }) => {
    await signInAsOrganizer(page, organizerCreds);

    await page.goto(`/en/dashboard/payments/payouts?organizationId=${organizationId}`);

    await expect(page.getByText('Completed').first()).toBeVisible();
    await expect(page.getByText('Processing').first()).toBeVisible();

    await page.goto(`/en/dashboard/payments/payouts/${terminalPayoutRequestId}`);
    await waitForPayoutDetailPageReady(page, terminalPayoutRequestId);
    const payoutHistorySection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Payout history' }) });
    await expect(page.getByRole('heading', { name: 'Payout history' })).toBeVisible();
    const pausedLifecycleItem = payoutHistorySection
      .locator('li')
      .filter({ hasText: 'Manual review is required' })
      .first();
    await pausedLifecycleItem.locator('summary').click();
    await expect(pausedLifecycleItem.getByText('risk_manual_review')).toBeVisible();
    await expect(page.getByText('Completed').first()).toBeVisible();

    await page.route('**/api/payments/payouts/*/statement?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            payoutStatus: 'completed',
            statementFingerprint: 'fp-terminal-statement',
            originalRequestedAmountMinor: 100_000,
            currentRequestedAmountMinor: 97_500,
            terminalAmountMinor: 97_500,
            adjustmentTotalMinor: -2_500,
            generatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.getByRole('button', { name: 'View statement' }).click();
    await expect(page.getByText('The statement is available.')).toBeVisible();
    const statementSection = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Payout statement' }) });
    await statementSection.locator('details summary').click();
    await expect(statementSection.getByText('fp-terminal-statement')).toBeVisible();

    await page.goto(`/en/dashboard/payments/payouts/${processingPayoutRequestId}`);
    await waitForPayoutDetailPageReady(page, processingPayoutRequestId);
    await expect(
      page.getByText('The statement will appear once the payout reaches a terminal state.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'View statement' })).toHaveCount(0);
  });

  test('11.4-E2E-004 @mobile organizer payments telemetry emits across workspace journey', async ({
    page,
  }) => {
    await signInAsOrganizer(page, organizerCreds);
    await page.evaluate((storageKey) => {
      window.sessionStorage.removeItem(storageKey);
      (
        window as Window & {
          __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown[];
        }
      ).__RUNGO_PAYMENTS_SMOKE_TELEMETRY__ = [];
    }, organizerPaymentsTelemetryStorageKey);
    await mockWorkspaceApis(page, organizationId, { availableMinor: 160_000, processingMinor: 0 });

    await page.route('**/api/payments/payouts', async (route) => {
      if (route.request().method() !== 'POST') {
        await route.continue();
        return;
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            payoutQuoteId: randomUUID(),
            payoutRequestId: randomUUID(),
            payoutContractId: randomUUID(),
            maxWithdrawableAmountMinor: 160_000,
            requestedAmountMinor: 50_000,
          },
        }),
      });
    });

    await page.route('**/api/payments/payouts/*/statement?*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            payoutStatus: 'completed',
            statementFingerprint: 'fp-mobile-telemetry',
            originalRequestedAmountMinor: 100_000,
            currentRequestedAmountMinor: 97_500,
            terminalAmountMinor: 97_500,
            adjustmentTotalMinor: -2_500,
            generatedAt: new Date().toISOString(),
          },
        }),
      });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/dashboard/payments?organizationId=${organizationId}`);

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(hasHorizontalOverflow).toBe(false);

    await expect(page.getByTestId('payments-primary-cta')).toBeVisible();
    await page.getByTestId('payments-primary-cta').focus();
    await page.keyboard.press('Enter');

    const payoutDialog = page.getByRole('dialog');
    await expect(payoutDialog).toBeVisible();
    await payoutDialog.getByLabel('Payout amount').fill('50000');
    await payoutDialog.getByRole('button', { name: 'Request payout' }).click();
    await expect(page.getByText('Payout requested')).toBeVisible();

    await page.goto(`/en/dashboard/payments/payouts/${terminalPayoutRequestId}`);
    await waitForPayoutDetailPageReady(page, terminalPayoutRequestId);
    await page.getByRole('button', { name: 'View statement' }).click();
    await expect(page.getByText('The statement is available.')).toBeVisible();

    const telemetry = await page.evaluate(
      () =>
        (
          window as Window & {
            __RUNGO_PAYMENTS_SMOKE_TELEMETRY__?: unknown[];
          }
        ).__RUNGO_PAYMENTS_SMOKE_TELEMETRY__ ?? [],
    );
    expect(Array.isArray(telemetry)).toBe(true);

    const telemetryNames = (telemetry as Array<{ eventName?: string }>)
      .map((event) => event.eventName)
      .filter((name): name is string => typeof name === 'string');

    expect(telemetryNames).toEqual(
      expect.arrayContaining([
        'organizer_payments_workspace_viewed',
        'organizer_payout_request_submitted',
        'organizer_payout_detail_viewed',
        'organizer_payout_statement_requested',
      ]),
    );
  });
});
