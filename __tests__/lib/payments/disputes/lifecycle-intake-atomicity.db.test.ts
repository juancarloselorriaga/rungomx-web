jest.mock('next/cache', () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

import { randomUUID } from 'crypto';

import { and, eq } from 'drizzle-orm';

import { moneyCommandIngestions, moneyEvents, moneyTraces, organizations } from '@/db/schema';
import { moneyMutationIngress } from '@/lib/payments/core/mutation-ingress';
import { openDisputeCase } from '@/lib/payments/disputes/lifecycle';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

// money_traces / money_events / money_command_ingestions have no FK back to
// organizations, so cleanDatabase()'s cascade-on-organizations delete never
// touches them. Clean them up locally in FK-safe order (children before
// parent), mirroring
// __tests__/lib/payments/volume/payment-capture-volume-smoke.db.test.ts.
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

describe('dispute intake freeze + case insert atomicity (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyTables(testDb);
  });

  it('rolls back the dispute.opened freeze when the dispute_cases insert fails', async () => {
    const [organization] = await testDb
      .insert(organizations)
      .values({
        name: 'Dispute Intake Atomicity Test Organizer',
        slug: `dispute-intake-atomicity-${randomUUID()}`,
      })
      .returning({ id: organizations.id });
    const organizerId = organization!.id;

    await seedCapturedFunds(organizerId, 4750);

    // Not present in `users`, so the dispute_cases insert's openedByUserId FK
    // fails AFTER (pre-fix) the dispute.opened ingress has already committed.
    const bogusOpenerUserId = randomUUID();

    await expect(
      openDisputeCase({
        organizerId,
        openedByUserId: bogusOpenerUserId,
        orderId: randomUUID(),
        reasonCode: 'fraud_reported',
        amountAtRiskMinor: 1800,
        now: new Date('2026-03-02T10:00:00.000Z'),
      }),
    ).rejects.toThrow();

    const disputeOpenedEvents = await testDb
      .select({ id: moneyEvents.id })
      .from(moneyEvents)
      .where(
        and(eq(moneyEvents.organizerId, organizerId), eq(moneyEvents.eventName, 'dispute.opened')),
      );

    expect(disputeOpenedEvents).toHaveLength(0);

    const walletSnapshot = await getOrganizerWalletBucketSnapshot({ organizerId });
    expect(walletSnapshot.buckets.frozenMinor).toBe(0);
    expect(walletSnapshot.buckets.availableMinor).toBe(4750);
    expect(walletSnapshot.buckets.debtMinor).toBe(0);
  });
});
