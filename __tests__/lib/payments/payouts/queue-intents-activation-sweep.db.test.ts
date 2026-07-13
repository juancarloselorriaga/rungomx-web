import { randomUUID } from 'crypto';

import { and, eq, isNull } from 'drizzle-orm';

import {
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  organizations,
  payoutQueuedIntents,
  payoutRequests,
  users,
} from '@/db/schema';
import { moneyMutationIngress } from '@/lib/payments/core/mutation-ingress';
import {
  createQueuedPayoutIntent,
  sweepQueuedPayoutIntentActivations,
} from '@/lib/payments/payouts/queue-intents';
import { createPayoutQuoteAndContract } from '@/lib/payments/payouts/quote-contract';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

// money_traces / money_events / money_command_ingestions have no FK back to
// organizations, so cleanDatabase()'s cascade-on-organizations delete never
// touches them. Clean them up locally in FK-safe order (children before
// parent), mirroring __tests__/lib/payments/payouts/lifecycle-queued-activation.db.test.ts.
async function cleanupMoneyTables(dbClient: ReturnType<typeof getTestDb>) {
  await dbClient.delete(moneyCommandIngestions);
  await dbClient.delete(moneyEvents);
  await dbClient.delete(moneyTraces);
}

// Real (non-mocked) money mutation ingress call seeding a captured payment,
// mirroring the canonical payload shape from the dispute atomicity tests.
async function seedCapturedFunds(organizerId: string, netMinor: number) {
  const registrationId = randomUUID();
  const occurredAt = '2026-03-01T09:00:00.000Z';
  const traceId = `trace:${organizerId}:${registrationId}`;

  await moneyMutationIngress({
    traceId,
    organizerId,
    idempotencyKey: `idem:${traceId}`,
    source: 'api',
    events: [
      {
        eventId: randomUUID(),
        traceId,
        occurredAt,
        recordedAt: occurredAt,
        eventName: 'payment.captured',
        version: 1,
        entityType: 'registration',
        entityId: registrationId,
        source: 'api',
        idempotencyKey: `event:${traceId}`,
        metadata: { sourceSystem: 'db-test' },
        payload: {
          organizerId,
          registrationId,
          grossAmount: { amountMinor: netMinor + 250, currency: 'MXN' },
          feeAmount: { amountMinor: 250, currency: 'MXN' },
          netAmount: { amountMinor: netMinor, currency: 'MXN' },
        },
      },
    ],
  });
}

async function seedOrganizerAndUser(dbClient: ReturnType<typeof getTestDb>) {
  const [organization] = await dbClient
    .insert(organizations)
    .values({
      name: 'Queued Payout Activation Test Organizer',
      slug: `queued-payout-activation-${randomUUID()}`,
    })
    .returning({ id: organizations.id });

  const [user] = await dbClient
    .insert(users)
    .values({
      name: 'Queued Payout Activation Test User',
      email: `queued-payout-activation-${randomUUID()}@example.com`,
      emailVerified: true,
    })
    .returning({ id: users.id });

  return { organizerId: organization!.id, actorUserId: user!.id };
}

describe('sweepQueuedPayoutIntentActivations (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  it('activates a stranded queued intent once organizer funds arrive with no terminal payout transition to trigger it', async () => {
    const { organizerId, actorUserId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-04-01T09:00:00.000Z');

    const queuedIntent = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'stranded-intent-a',
      now,
    });

    expect(queuedIntent.status).toBe('queued');

    await seedCapturedFunds(organizerId, 20_000);

    const sweepResult = await sweepQueuedPayoutIntentActivations({
      activatedByUserId: actorUserId,
      organizerId,
      now,
    });

    expect(sweepResult.scannedCount).toBe(1);
    expect(sweepResult.activatedCount).toBe(1);
    expect(sweepResult.results).toHaveLength(1);
    expect(sweepResult.results[0]).toMatchObject({
      payoutQueuedIntentId: queuedIntent.payoutQueuedIntentId,
      activated: true,
      reasonCode: 'activated',
    });
    expect(sweepResult.results[0]!.payoutRequestId).toBeTruthy();

    const [queuedIntentRow] = await testDb
      .select({
        status: payoutQueuedIntents.status,
        activatedAt: payoutQueuedIntents.activatedAt,
        activatedPayoutRequestId: payoutQueuedIntents.activatedPayoutRequestId,
      })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntent.payoutQueuedIntentId));

    expect(queuedIntentRow?.status).toBe('activated');
    expect(queuedIntentRow?.activatedAt).not.toBeNull();
    expect(queuedIntentRow?.activatedPayoutRequestId).not.toBeNull();

    const organizerPayoutRequests = await testDb
      .select({
        id: payoutRequests.id,
        status: payoutRequests.status,
      })
      .from(payoutRequests)
      .where(and(eq(payoutRequests.organizerId, organizerId), isNull(payoutRequests.deletedAt)));

    expect(organizerPayoutRequests).toHaveLength(1);
    expect(organizerPayoutRequests[0]?.status).toBe('requested');
    expect(organizerPayoutRequests[0]?.id).toBe(queuedIntentRow?.activatedPayoutRequestId);
  });

  it('reports still_ineligible and leaves the intent queued when no funds are available', async () => {
    const { organizerId, actorUserId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-04-01T09:00:00.000Z');

    const queuedIntent = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'stranded-intent-no-funds',
      now,
    });

    expect(queuedIntent.status).toBe('queued');

    const sweepResult = await sweepQueuedPayoutIntentActivations({
      activatedByUserId: actorUserId,
      organizerId,
      now,
    });

    expect(sweepResult.scannedCount).toBe(1);
    expect(sweepResult.activatedCount).toBe(0);
    expect(sweepResult.results[0]).toMatchObject({
      payoutQueuedIntentId: queuedIntent.payoutQueuedIntentId,
      activated: false,
      reasonCode: 'still_ineligible',
    });

    const [queuedIntentRow] = await testDb
      .select({
        status: payoutQueuedIntents.status,
        activatedAt: payoutQueuedIntents.activatedAt,
      })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntent.payoutQueuedIntentId));

    expect(queuedIntentRow?.status).toBe('queued');
    expect(queuedIntentRow?.activatedAt).toBeNull();
  });

  it('heals a half-activated intent by reusing the existing payout request instead of creating a duplicate', async () => {
    const { organizerId, actorUserId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-04-01T09:00:00.000Z');

    const queuedIntent = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'half-state-intent-b',
      now,
    });

    expect(queuedIntent.status).toBe('queued');

    await seedCapturedFunds(organizerId, 20_000);

    // Simulate a worker crash between payout creation and the queued-intent
    // CAS: the payout was created via the same deterministic idempotency key
    // activateQueuedPayoutIntent would use, but the intent row was never
    // flipped to 'activated'.
    const firstAttempt = await createPayoutQuoteAndContract({
      organizerId,
      requestedByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: `queued-activation:${queuedIntent.payoutQueuedIntentId}`,
      now,
    });

    const [preSweepIntentRow] = await testDb
      .select({ status: payoutQueuedIntents.status })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntent.payoutQueuedIntentId));

    expect(preSweepIntentRow?.status).toBe('queued');

    const prePayoutRequests = await testDb
      .select({ id: payoutRequests.id })
      .from(payoutRequests)
      .where(and(eq(payoutRequests.organizerId, organizerId), isNull(payoutRequests.deletedAt)));

    expect(prePayoutRequests).toHaveLength(1);

    const sweepResult = await sweepQueuedPayoutIntentActivations({
      activatedByUserId: actorUserId,
      organizerId,
      now,
    });

    expect(sweepResult.activatedCount).toBe(1);
    expect(sweepResult.results[0]?.payoutRequestId).toBe(firstAttempt.payoutRequestId);

    const [queuedIntentRow] = await testDb
      .select({
        status: payoutQueuedIntents.status,
        activatedPayoutRequestId: payoutQueuedIntents.activatedPayoutRequestId,
        activatedPayoutQuoteId: payoutQueuedIntents.activatedPayoutQuoteId,
      })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntent.payoutQueuedIntentId));

    expect(queuedIntentRow?.status).toBe('activated');
    expect(queuedIntentRow?.activatedPayoutRequestId).toBe(firstAttempt.payoutRequestId);
    expect(queuedIntentRow?.activatedPayoutQuoteId).toBe(firstAttempt.payoutQuoteId);

    const postPayoutRequests = await testDb
      .select({ id: payoutRequests.id })
      .from(payoutRequests)
      .where(and(eq(payoutRequests.organizerId, organizerId), isNull(payoutRequests.deletedAt)));

    expect(postPayoutRequests).toHaveLength(1);
  });

  it('only activates queued intents for the requested organizer, leaving other eligible organizers untouched', async () => {
    const { organizerId: organizerAId, actorUserId } = await seedOrganizerAndUser(testDb);
    const { organizerId: organizerBId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-04-01T09:00:00.000Z');

    const queuedIntentA = await createQueuedPayoutIntent({
      organizerId: organizerAId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'multi-org-intent-a',
      now,
    });
    const queuedIntentB = await createQueuedPayoutIntent({
      organizerId: organizerBId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'multi-org-intent-b',
      now,
    });

    expect(queuedIntentA.status).toBe('queued');
    expect(queuedIntentB.status).toBe('queued');

    await seedCapturedFunds(organizerAId, 20_000);
    await seedCapturedFunds(organizerBId, 20_000);

    const sweepResult = await sweepQueuedPayoutIntentActivations({
      activatedByUserId: actorUserId,
      organizerId: organizerAId,
      now,
    });

    expect(sweepResult.scannedCount).toBe(1);
    expect(sweepResult.activatedCount).toBe(1);
    expect(sweepResult.results[0]).toMatchObject({
      payoutQueuedIntentId: queuedIntentA.payoutQueuedIntentId,
      activated: true,
    });

    const [intentARow] = await testDb
      .select({ status: payoutQueuedIntents.status })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntentA.payoutQueuedIntentId));
    const [intentBRow] = await testDb
      .select({ status: payoutQueuedIntents.status })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntentB.payoutQueuedIntentId));

    expect(intentARow?.status).toBe('activated');
    expect(intentBRow?.status).toBe('queued');
  });
});
