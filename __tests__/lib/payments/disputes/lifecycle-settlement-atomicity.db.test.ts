jest.mock('next/cache', () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

import { randomUUID } from 'crypto';

import { and, eq } from 'drizzle-orm';

import {
  disputeCases,
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  organizations,
} from '@/db/schema';
import { moneyMutationIngress } from '@/lib/payments/core/mutation-ingress';
import { openDisputeCase, transitionDisputeCase } from '@/lib/payments/disputes/lifecycle';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { createTestUser } from '@/tests/helpers/fixtures';

// money_traces / money_events / money_command_ingestions have no FK back to
// organizations, so cleanDatabase()'s cascade-on-organizations delete never
// touches them. Clean them up locally in FK-safe order (children before
// parent). Duplicated from lifecycle-intake-atomicity.db.test.ts rather than
// shared, to keep these two atomicity suites decoupled.
async function cleanupMoneyTables(dbClient: ReturnType<typeof getTestDb>) {
  await dbClient.delete(moneyCommandIngestions);
  await dbClient.delete(moneyEvents);
  await dbClient.delete(moneyTraces);
}

// Real (non-mocked) money mutation ingress call seeding a captured payment,
// mirroring the canonical payload shape from the volume smoke test exactly.
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

describe('dispute settlement posting + case update atomicity (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  it('rolls back settlement postings when the guarded case update fails', async () => {
    const [organization] = await testDb
      .insert(organizations)
      .values({
        name: 'Dispute Settlement Atomicity Test Organizer',
        slug: `dispute-settlement-atomicity-${randomUUID()}`,
      })
      .returning({ id: organizations.id });
    const organizerId = organization!.id;

    const openerUser = await createTestUser(testDb);
    const actorUser = await createTestUser(testDb);

    await seedCapturedFunds(organizerId, 4750);

    const opened = await openDisputeCase({
      organizerId,
      openedByUserId: openerUser.id,
      orderId: randomUUID(),
      reasonCode: 'fraud_reported',
      amountAtRiskMinor: 1800,
      now: new Date('2026-03-02T10:00:00.000Z'),
    });
    const disputeCaseId = opened.disputeCaseId;

    await transitionDisputeCase({
      disputeCaseId,
      organizerId,
      actorUserId: actorUser.id,
      toStatus: 'under_review',
      now: new Date('2026-03-02T11:00:00.000Z'),
    });

    const walletSnapshotBeforeSettlement = await getOrganizerWalletBucketSnapshot({ organizerId });
    expect(walletSnapshotBeforeSettlement.buckets.frozenMinor).toBe(1800);
    expect(walletSnapshotBeforeSettlement.buckets.debtMinor).toBe(0);

    // Not present in `users`, so the guarded CAS update's
    // latestTransitionByUserId FK fails AFTER (pre-fix) settlement ingress
    // has already committed.
    const bogusActorUserId = randomUUID();

    await expect(
      transitionDisputeCase({
        disputeCaseId,
        organizerId,
        actorUserId: bogusActorUserId,
        toStatus: 'lost',
        runtime: 'web',
        executionMode: 'in_process',
        nodeEnv: 'test',
        now: new Date('2026-03-02T12:00:00.000Z'),
      }),
    ).rejects.toThrow();

    const fundsReleasedEvents = await testDb
      .select({ id: moneyEvents.id })
      .from(moneyEvents)
      .where(
        and(
          eq(moneyEvents.organizerId, organizerId),
          eq(moneyEvents.eventName, 'dispute.funds_released'),
        ),
      );
    const debtPostedEvents = await testDb
      .select({ id: moneyEvents.id })
      .from(moneyEvents)
      .where(
        and(
          eq(moneyEvents.organizerId, organizerId),
          eq(moneyEvents.eventName, 'dispute.debt_posted'),
        ),
      );

    expect(fundsReleasedEvents).toHaveLength(0);
    expect(debtPostedEvents).toHaveLength(0);

    const [disputeCaseRow] = await testDb
      .select({ status: disputeCases.status })
      .from(disputeCases)
      .where(eq(disputeCases.id, disputeCaseId));
    expect(disputeCaseRow?.status).toBe('under_review');

    const walletSnapshotAfterFailure = await getOrganizerWalletBucketSnapshot({ organizerId });
    expect(walletSnapshotAfterFailure.buckets.debtMinor).toBe(0);
    expect(walletSnapshotAfterFailure.buckets.frozenMinor).toBe(1800);
  });
});
