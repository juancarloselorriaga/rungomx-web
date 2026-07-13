import { randomUUID } from 'crypto';

import { and, eq } from 'drizzle-orm';

import {
  auditLogs,
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

  describe('P2b: idempotent redelivery reconciliation', () => {
    it('reconciles a same-key redelivery of an already-confirmed registration instead of throwing INVALID_STATE_TRANSITION', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2b-redelivery',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'payment_pending',
      });
      const idempotencyKey = `payment-capture:${registrationId}`;

      const params = {
        registrationId,
        organizerId,
        grossAmountMinor: 15_000,
        feeAmountMinor: 750,
        netAmountMinor: 14_250,
        source: 'server_action' as const,
        idempotencyKey,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        auditAction: 'registration.demo_pay' as const,
        actorUserId: buyerUserId,
      };

      const first = await confirmRegistrationPaymentCapture(params);
      expect(first).toEqual({ id: registrationId, status: 'confirmed' });

      await expect(confirmRegistrationPaymentCapture(params)).resolves.toEqual({
        id: registrationId,
        status: 'confirmed',
      });

      const capturedEvents = await testDb
        .select({ id: moneyEvents.id })
        .from(moneyEvents)
        .where(
          and(
            eq(moneyEvents.idempotencyKey, idempotencyKey),
            eq(moneyEvents.eventName, 'payment.captured'),
          ),
        );
      expect(capturedEvents).toHaveLength(1);

      const ingestions = await testDb
        .select({ id: moneyCommandIngestions.id })
        .from(moneyCommandIngestions)
        .where(
          and(
            eq(moneyCommandIngestions.organizerId, organizerId),
            eq(moneyCommandIngestions.idempotencyKey, idempotencyKey),
          ),
        );
      expect(ingestions).toHaveLength(1);

      const audits = await testDb
        .select({ id: auditLogs.id })
        .from(auditLogs)
        .where(and(eq(auditLogs.entityType, 'registration'), eq(auditLogs.entityId, registrationId)));
      expect(audits).toHaveLength(1);
    });

    it('still throws INVALID_STATE_TRANSITION when a confirmed registration is redelivered under a different idempotency key', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2b-different-key',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'payment_pending',
      });
      const keyA = `payment-capture:${registrationId}:key-a`;
      const keyB = `payment-capture:${registrationId}:key-b`;

      const first = await confirmRegistrationPaymentCapture({
        registrationId,
        organizerId,
        grossAmountMinor: 15_000,
        feeAmountMinor: 750,
        netAmountMinor: 14_250,
        source: 'server_action',
        idempotencyKey: keyA,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        auditAction: 'registration.demo_pay',
        actorUserId: buyerUserId,
      });
      expect(first).toEqual({ id: registrationId, status: 'confirmed' });

      await expect(
        confirmRegistrationPaymentCapture({
          registrationId,
          organizerId,
          grossAmountMinor: 15_000,
          feeAmountMinor: 750,
          netAmountMinor: 14_250,
          source: 'server_action',
          idempotencyKey: keyB,
          occurredAt: new Date('2026-04-01T12:00:00.000Z'),
          auditAction: 'registration.demo_pay',
          actorUserId: buyerUserId,
        }),
      ).rejects.toThrow('INVALID_STATE_TRANSITION');
    });

    it('still throws INVALID_STATE_TRANSITION when a confirmed registration has no matching payment.captured event', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2b-no-event',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'confirmed',
      });
      const idempotencyKey = `payment-capture:${registrationId}:fresh`;

      await expect(
        confirmRegistrationPaymentCapture({
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
        }),
      ).rejects.toThrow('INVALID_STATE_TRANSITION');
    });

    it('still throws INVALID_STATE_TRANSITION for a cancelled registration even when a matching payment.captured event exists under the same key', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2b-cancelled',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'cancelled',
      });
      const idempotencyKey = `payment-capture:${registrationId}:cancelled`;
      const occurredAt = new Date('2026-04-01T12:00:00.000Z');

      await testDb.insert(moneyTraces).values({
        traceId: idempotencyKey,
        organizerId,
        rootEntityType: 'registration',
        rootEntityId: registrationId,
        createdBySource: 'server_action',
      });

      await testDb.insert(moneyEvents).values({
        traceId: idempotencyKey,
        organizerId,
        eventName: 'payment.captured',
        eventVersion: 1,
        entityType: 'registration',
        entityId: registrationId,
        source: 'server_action',
        idempotencyKey,
        occurredAt,
      });

      await testDb.insert(moneyCommandIngestions).values({
        organizerId,
        idempotencyKey,
        traceId: idempotencyKey,
        status: 'completed',
      });

      await expect(
        confirmRegistrationPaymentCapture({
          registrationId,
          organizerId,
          grossAmountMinor: 15_000,
          feeAmountMinor: 750,
          netAmountMinor: 14_250,
          source: 'server_action',
          idempotencyKey,
          occurredAt,
          auditAction: 'registration.demo_pay',
          actorUserId: buyerUserId,
        }),
      ).rejects.toThrow('INVALID_STATE_TRANSITION');
    });

    it('still throws INVALID_STATE_TRANSITION when the same key matches a capture for a different registration', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2b-cross-reg',
      );
      const registrationBId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'payment_pending',
      });
      const registrationAId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'confirmed',
      });
      const key = `payment-capture:cross-reg-${randomUUID().slice(0, 8)}`;

      const capturedB = await confirmRegistrationPaymentCapture({
        registrationId: registrationBId,
        organizerId,
        grossAmountMinor: 15_000,
        feeAmountMinor: 750,
        netAmountMinor: 14_250,
        source: 'server_action',
        idempotencyKey: key,
        occurredAt: new Date('2026-04-01T12:00:00.000Z'),
        auditAction: 'registration.demo_pay',
        actorUserId: buyerUserId,
      });
      expect(capturedB).toEqual({ id: registrationBId, status: 'confirmed' });

      await expect(
        confirmRegistrationPaymentCapture({
          registrationId: registrationAId,
          organizerId,
          grossAmountMinor: 15_000,
          feeAmountMinor: 750,
          netAmountMinor: 14_250,
          source: 'server_action',
          idempotencyKey: key,
          occurredAt: new Date('2026-04-01T12:00:00.000Z'),
          auditAction: 'registration.demo_pay',
          actorUserId: buyerUserId,
        }),
      ).rejects.toThrow('INVALID_STATE_TRANSITION');
    });

    it('still throws INVALID_STATE_TRANSITION for a soft-deleted registration even when confirmed with a matching capture event', async () => {
      const { organizerId, buyerUserId, editionId, distanceId } = await seedOrganizerEditionFixture(
        testDb,
        'p2b-soft-deleted',
      );
      const registrationId = await seedRegistration(testDb, {
        editionId,
        distanceId,
        buyerUserId,
        status: 'payment_pending',
      });
      const idempotencyKey = `payment-capture:${registrationId}:soft-deleted`;

      const first = await confirmRegistrationPaymentCapture({
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
      expect(first).toEqual({ id: registrationId, status: 'confirmed' });

      await testDb
        .update(registrations)
        .set({ deletedAt: new Date('2026-04-02T00:00:00.000Z') })
        .where(eq(registrations.id, registrationId));

      await expect(
        confirmRegistrationPaymentCapture({
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
        }),
      ).rejects.toThrow('INVALID_STATE_TRANSITION');
    });
  });
});
