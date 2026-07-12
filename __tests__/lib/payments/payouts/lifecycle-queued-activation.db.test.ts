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
import { transitionPayoutLifecycle } from '@/lib/payments/payouts/lifecycle';
import { createQueuedPayoutIntent } from '@/lib/payments/payouts/queue-intents';
import { createPayoutQuoteAndContract } from '@/lib/payments/payouts/quote-contract';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

// money_traces / money_events / money_command_ingestions have no FK back to
// organizations, so cleanDatabase()'s cascade-on-organizations delete never
// touches them. Clean them up locally in FK-safe order (children before
// parent), mirroring __tests__/lib/payments/disputes/lifecycle-intake-atomicity.db.test.ts.
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

describe('queued payout intent activation on terminal payout transitions (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  it('activates the organizer queued payout intent once the blocking payout request completes', async () => {
    const { organizerId, actorUserId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-03-10T09:00:00.000Z');

    await seedCapturedFunds(organizerId, 20_000);

    const blockingPayoutA = await createPayoutQuoteAndContract({
      organizerId,
      requestedByUserId: actorUserId,
      requestedAmountMinor: 12_000,
      idempotencyKey: 'blocking-payout-a',
      now,
    });

    const queuedIntentB = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'queued-intent-b',
      now,
    });

    expect(queuedIntentB.status).toBe('queued');
    expect(queuedIntentB.blockedReasonCode).toBe('active_requested_payout_exists');

    await transitionPayoutLifecycle({
      payoutRequestId: blockingPayoutA.payoutRequestId,
      actorUserId,
      action: 'mark_processing',
      now,
    });

    await transitionPayoutLifecycle({
      payoutRequestId: blockingPayoutA.payoutRequestId,
      actorUserId,
      action: 'complete',
      now,
    });

    const [queuedIntentRow] = await testDb
      .select({
        status: payoutQueuedIntents.status,
        activatedAt: payoutQueuedIntents.activatedAt,
        activatedPayoutRequestId: payoutQueuedIntents.activatedPayoutRequestId,
      })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntentB.payoutQueuedIntentId));

    expect(queuedIntentRow?.status).toBe('activated');
    expect(queuedIntentRow?.activatedAt).not.toBeNull();
    expect(queuedIntentRow?.activatedPayoutRequestId).not.toBeNull();
    expect(queuedIntentRow?.activatedPayoutRequestId).not.toBe(blockingPayoutA.payoutRequestId);

    const [activatedPayoutRequestRow] = await testDb
      .select({
        organizerId: payoutRequests.organizerId,
        status: payoutRequests.status,
      })
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.id, queuedIntentRow!.activatedPayoutRequestId!),
          isNull(payoutRequests.deletedAt),
        ),
      );

    expect(activatedPayoutRequestRow?.organizerId).toBe(organizerId);
    expect(activatedPayoutRequestRow?.status).toBe('requested');

    const walletSnapshot = await getOrganizerWalletBucketSnapshot({ organizerId, now });
    expect(walletSnapshot.buckets.availableMinor).toBe(3_000);
    expect(walletSnapshot.buckets.processingMinor).toBe(5_000);
    expect(walletSnapshot.buckets.debtMinor).toBe(0);
  });

  it('activates the organizer queued payout intent once the blocking payout request fails', async () => {
    const { organizerId, actorUserId } = await seedOrganizerAndUser(testDb);
    const now = new Date('2026-03-10T09:00:00.000Z');

    await seedCapturedFunds(organizerId, 20_000);

    const blockingPayoutA = await createPayoutQuoteAndContract({
      organizerId,
      requestedByUserId: actorUserId,
      requestedAmountMinor: 12_000,
      idempotencyKey: 'blocking-payout-a-fail',
      now,
    });

    const queuedIntentB = await createQueuedPayoutIntent({
      organizerId,
      createdByUserId: actorUserId,
      requestedAmountMinor: 5_000,
      idempotencyKey: 'queued-intent-b-fail',
      now,
    });

    expect(queuedIntentB.status).toBe('queued');
    expect(queuedIntentB.blockedReasonCode).toBe('active_requested_payout_exists');

    await transitionPayoutLifecycle({
      payoutRequestId: blockingPayoutA.payoutRequestId,
      actorUserId,
      action: 'mark_processing',
      now,
    });

    await transitionPayoutLifecycle({
      payoutRequestId: blockingPayoutA.payoutRequestId,
      actorUserId,
      action: 'fail',
      reasonCode: 'bank_rejection',
      now,
    });

    const [queuedIntentRow] = await testDb
      .select({
        status: payoutQueuedIntents.status,
        activatedAt: payoutQueuedIntents.activatedAt,
        activatedPayoutRequestId: payoutQueuedIntents.activatedPayoutRequestId,
      })
      .from(payoutQueuedIntents)
      .where(eq(payoutQueuedIntents.id, queuedIntentB.payoutQueuedIntentId));

    expect(queuedIntentRow?.status).toBe('activated');
    expect(queuedIntentRow?.activatedAt).not.toBeNull();
    expect(queuedIntentRow?.activatedPayoutRequestId).not.toBeNull();
    expect(queuedIntentRow?.activatedPayoutRequestId).not.toBe(blockingPayoutA.payoutRequestId);

    const [activatedPayoutRequestRow] = await testDb
      .select({
        organizerId: payoutRequests.organizerId,
        status: payoutRequests.status,
      })
      .from(payoutRequests)
      .where(
        and(
          eq(payoutRequests.id, queuedIntentRow!.activatedPayoutRequestId!),
          isNull(payoutRequests.deletedAt),
        ),
      );

    expect(activatedPayoutRequestRow?.organizerId).toBe(organizerId);
    expect(activatedPayoutRequestRow?.status).toBe('requested');

    // Fold from a fresh 20_000 capture: A requests 12_000 (available 8_000,
    // processing 12_000); A fails, returning its amount to available
    // (available 20_000, processing 0); B then activates for 5_000 (available
    // 15_000, processing 5_000). See lib/payments/wallet/snapshot.ts eventDelta
    // for the 'payout.failed' and 'payout.requested' fold semantics.
    const walletSnapshot = await getOrganizerWalletBucketSnapshot({ organizerId, now });
    expect(walletSnapshot.buckets.availableMinor).toBe(15_000);
    expect(walletSnapshot.buckets.processingMinor).toBe(5_000);
    expect(walletSnapshot.buckets.debtMinor).toBe(0);
  });
});
