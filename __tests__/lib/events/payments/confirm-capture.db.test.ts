import { randomUUID } from 'crypto';

import { and, eq } from 'drizzle-orm';

import {
  eventDistances,
  eventEditions,
  eventSeries,
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  organizations,
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
  registrations,
  users,
} from '@/db/schema';
import type { RegistrationStatus } from '@/lib/events/constants';
import { confirmRegistrationPaymentCapture } from '@/lib/events/payments/confirm-capture';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

// Real `headers()` throws outside a request scope. Mocking ONLY next/headers
// (NOT @/lib/audit) lets real audit rows land so audit assertions are genuine.
jest.mock('next/headers', () => ({
  headers: jest.fn(async () => new Headers()),
}));

// Money-ledger tables are not covered by cleanDatabase and have no cascade
// from the tables it does clean, so this suite owns their cleanup directly.
// Volume rollup tables are cleared too so this file doesn't leak rows into
// the volume suites that assert on exact row counts/sums.
async function cleanupMoneyLedgerAndVolumeTables(testDb: ReturnType<typeof getTestDb>) {
  await testDb.delete(paymentCaptureVolumeOrganizerDaily);
  await testDb.delete(paymentCaptureVolumeDaily);
  await testDb.delete(paymentCaptureVolumeReconciliationDaily);
  await testDb.delete(moneyCommandIngestions);
  await testDb.delete(moneyEvents);
  await testDb.delete(moneyTraces);
}

async function seedOrganizerEditionFixture(testDb: ReturnType<typeof getTestDb>, label: string) {
  const suffix = `${label}-${randomUUID().slice(0, 8)}`;

  const [organization] = await testDb
    .insert(organizations)
    .values({ name: `Confirm Capture Test Org ${suffix}`, slug: `confirm-capture-test-${suffix}` })
    .returning({ id: organizations.id });

  const [buyerUser] = await testDb
    .insert(users)
    .values({
      name: `Confirm Capture Test Buyer ${suffix}`,
      email: `confirm-capture-buyer-${suffix}@example.com`,
      emailVerified: true,
    })
    .returning({ id: users.id });

  const [series] = await testDb
    .insert(eventSeries)
    .values({
      organizationId: organization!.id,
      slug: `confirm-capture-series-${suffix}`,
      name: `Confirm Capture Series ${suffix}`,
      sportType: 'trail_running',
    })
    .returning({ id: eventSeries.id });

  const [edition] = await testDb
    .insert(eventEditions)
    .values({
      seriesId: series!.id,
      editionLabel: '2026',
      publicCode: `CC${suffix.slice(0, 8).toUpperCase()}`,
      slug: `confirm-capture-edition-${suffix}`,
      visibility: 'published',
    })
    .returning({ id: eventEditions.id });

  const [distance] = await testDb
    .insert(eventDistances)
    .values({ editionId: edition!.id, label: '10K', capacity: 100 })
    .returning({ id: eventDistances.id });

  return {
    organizerId: organization!.id,
    buyerUserId: buyerUser!.id,
    editionId: edition!.id,
    distanceId: distance!.id,
  };
}

async function seedRegistration(
  testDb: ReturnType<typeof getTestDb>,
  params: {
    editionId: string;
    distanceId: string;
    buyerUserId: string;
    status: RegistrationStatus;
  },
) {
  const [registration] = await testDb
    .insert(registrations)
    .values({
      editionId: params.editionId,
      distanceId: params.distanceId,
      buyerUserId: params.buyerUserId,
      status: params.status,
      basePriceCents: 15_000,
      feesCents: 750,
      taxCents: 0,
      totalCents: 15_750,
    })
    .returning({ id: registrations.id });

  return registration!.id;
}

describe('confirmRegistrationPaymentCapture persistence (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyLedgerAndVolumeTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupMoneyLedgerAndVolumeTables(testDb);
  });

  describe('P2a: capture source fidelity', () => {
    it('persists source "api" on both money_events.source and money_traces.created_by_source for an api-sourced capture', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2a-api',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'payment_pending',
      });
      const idempotencyKey = `payment-capture:${registrationId}:api`;

      const result = await confirmRegistrationPaymentCapture({
        registrationId,
        organizerId,
        grossAmountMinor: 15_000,
        feeAmountMinor: 750,
        netAmountMinor: 14_250,
        source: 'api',
        idempotencyKey,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        auditAction: 'registration.demo_pay',
        actorUserId: buyerUserId,
      });

      expect(result).toEqual({ id: registrationId, status: 'confirmed' });

      const [capturedEvent] = await testDb
        .select({ source: moneyEvents.source })
        .from(moneyEvents)
        .where(
          and(eq(moneyEvents.traceId, idempotencyKey), eq(moneyEvents.eventName, 'payment.captured')),
        );
      expect(capturedEvent?.source).toBe('api');

      const [trace] = await testDb
        .select({ createdBySource: moneyTraces.createdBySource })
        .from(moneyTraces)
        .where(eq(moneyTraces.traceId, idempotencyKey));
      expect(trace?.createdBySource).toBe('api');
    });

    it('persists source "server_action" on both money_events.source and money_traces.created_by_source for a server_action-sourced capture', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2a-server-action',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'payment_pending',
      });
      const idempotencyKey = `payment-capture:${registrationId}:server-action`;

      const result = await confirmRegistrationPaymentCapture({
        registrationId,
        organizerId,
        grossAmountMinor: 15_000,
        feeAmountMinor: 750,
        netAmountMinor: 14_250,
        source: 'server_action',
        idempotencyKey,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        auditAction: 'registration.demo_pay',
        actorUserId: buyerUserId,
      });

      expect(result).toEqual({ id: registrationId, status: 'confirmed' });

      const [capturedEvent] = await testDb
        .select({ source: moneyEvents.source })
        .from(moneyEvents)
        .where(
          and(eq(moneyEvents.traceId, idempotencyKey), eq(moneyEvents.eventName, 'payment.captured')),
        );
      expect(capturedEvent?.source).toBe('server_action');

      const [trace] = await testDb
        .select({ createdBySource: moneyTraces.createdBySource })
        .from(moneyTraces)
        .where(eq(moneyTraces.traceId, idempotencyKey));
      expect(trace?.createdBySource).toBe('server_action');
    });
  });
});
