import { and, asc, eq } from 'drizzle-orm';

import { db } from '@/db';
import {
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';
import { moneyMutationIngress } from '@/lib/payments/core/mutation-ingress';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupPaymentVolumeTables(dbClient: ReturnType<typeof getTestDb>) {
  await dbClient.delete(paymentCaptureVolumeOrganizerDaily);
  await dbClient.delete(paymentCaptureVolumeDaily);
  await dbClient.delete(paymentCaptureVolumeReconciliationDaily);
  await dbClient.delete(moneyCommandIngestions);
  await dbClient.delete(moneyEvents);
  await dbClient.delete(moneyTraces);
}

describe('payment capture volume idempotency (database)', () => {
  const testDb = getTestDb();
  const organizerId = '22222222-2222-4222-8222-222222222222';
  const traceId = 'trace-volume-idempotency-1';
  const idempotencyKey = 'volume-idempotency-1';

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupPaymentVolumeTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupPaymentVolumeTables(testDb);
  });

  it('does not double-count rollups when the same canonical capture is ingested twice', async () => {
    const event = {
      eventId: '11111111-1111-4111-8111-111111111111',
      traceId,
      occurredAt: '2026-02-23T12:00:00.000Z',
      recordedAt: '2026-02-23T12:00:00.000Z',
      eventName: 'payment.captured',
      version: 1,
      entityType: 'registration',
      entityId: 'registration-1',
      source: 'api',
      idempotencyKey: 'idem-volume-1',
      metadata: { sourceSystem: 'db-test' },
      payload: {
        organizerId,
        registrationId: '33333333-3333-4333-8333-333333333333',
        orderId: '44444444-4444-4444-8444-444444444444',
        grossAmount: { amountMinor: 10_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_500, currency: 'MXN' },
      },
    } as const;

    const first = await moneyMutationIngress({
      traceId,
      organizerId,
      idempotencyKey,
      source: 'api',
      events: [event],
    });
    const second = await moneyMutationIngress({
      traceId,
      organizerId,
      idempotencyKey,
      source: 'api',
      events: [event],
    });

    expect(first.deduplicated).toBe(false);
    expect(second.deduplicated).toBe(true);
    expect(second.persistedEvents).toHaveLength(0);

    const persistedEvents = await db
      .select()
      .from(moneyEvents)
      .where(eq(moneyEvents.traceId, traceId));
    expect(persistedEvents).toHaveLength(1);

    const dailyRows = await db
      .select()
      .from(paymentCaptureVolumeDaily)
      .orderBy(asc(paymentCaptureVolumeDaily.bucketDate), asc(paymentCaptureVolumeDaily.sourceCurrency));
    expect(dailyRows).toEqual([
      expect.objectContaining({
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_000,
        platformFeeMinor: 500,
        organizerProceedsMinor: 9_500,
        captureCount: 1,
      }),
    ]);

    const organizerRows = await db
      .select()
      .from(paymentCaptureVolumeOrganizerDaily)
      .where(eq(paymentCaptureVolumeOrganizerDaily.organizerId, organizerId));
    expect(organizerRows).toEqual([
      expect.objectContaining({
        organizerId,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_000,
        platformFeeMinor: 500,
        organizerProceedsMinor: 9_500,
        captureCount: 1,
      }),
    ]);

    const reconciliationRows = await db.select().from(paymentCaptureVolumeReconciliationDaily);
    expect(reconciliationRows).toEqual([
      expect.objectContaining({
        captureEventCount: 1,
        excludedEventCount: 0,
      }),
    ]);

    const [ingestion] = await db
      .select()
      .from(moneyCommandIngestions)
      .where(
        and(
          eq(moneyCommandIngestions.organizerId, organizerId),
          eq(moneyCommandIngestions.idempotencyKey, idempotencyKey),
        ),
      );
    expect(ingestion?.status).toBe('completed');

    expect(dailyRows[0]?.grossProcessedMinor).toBe(
      dailyRows[0]!.platformFeeMinor + dailyRows[0]!.organizerProceedsMinor,
    );
    expect(organizerRows[0]?.grossProcessedMinor).toBe(
      organizerRows[0]!.platformFeeMinor + organizerRows[0]!.organizerProceedsMinor,
    );
  });
});
