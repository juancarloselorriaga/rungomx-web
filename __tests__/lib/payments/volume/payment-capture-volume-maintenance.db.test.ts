import { randomUUID } from 'crypto';

import {
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';
import {
  rebuildPaymentCaptureVolumeRollups,
  reconcilePaymentCaptureVolumeRollups,
} from '@/lib/payments/volume/payment-capture-volume-maintenance';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';
import { asc, eq } from 'drizzle-orm';

async function cleanupPaymentVolumeTables(db: ReturnType<typeof getTestDb>) {
  await db.delete(paymentCaptureVolumeOrganizerDaily);
  await db.delete(paymentCaptureVolumeDaily);
  await db.delete(paymentCaptureVolumeReconciliationDaily);
  await db.delete(moneyCommandIngestions);
  await db.delete(moneyEvents);
  await db.delete(moneyTraces);
}

async function seedPaymentCapturedEvent(params: {
  db: ReturnType<typeof getTestDb>;
  traceId: string;
  organizerId: string | null;
  registrationId: string;
  occurredAt: Date;
  eventVersion: number;
  payloadJson: Record<string, unknown>;
}) {
  await params.db.insert(moneyTraces).values({
    traceId: params.traceId,
    organizerId: params.organizerId,
    rootEntityType: 'registration',
    rootEntityId: params.registrationId,
    createdBySource: 'api',
    metadataJson: { sourceSystem: 'db-test' },
    createdAt: params.occurredAt,
  });

  await params.db.insert(moneyEvents).values({
    traceId: params.traceId,
    organizerId: params.organizerId,
    eventName: 'payment.captured',
    eventVersion: params.eventVersion,
    entityType: 'registration',
    entityId: params.registrationId,
    source: 'api',
    idempotencyKey: `idem:${params.traceId}`,
    occurredAt: params.occurredAt,
    payloadJson: params.payloadJson,
    metadataJson: { sourceSystem: 'db-test' },
    createdAt: params.occurredAt,
  });
}

describe('payment capture volume maintenance (database)', () => {
  const db = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(db);
    await cleanupPaymentVolumeTables(db);
  });

  afterAll(async () => {
    await cleanDatabase(db);
    await cleanupPaymentVolumeTables(db);
  });

  it('rebuilds the selected bucket window from canonical v1 captures and replaces stale rollups', async () => {
    const organizerId = randomUUID();
    const insideBucket = new Date('2026-03-05T10:00:00.000Z');
    const insideBucketBad = new Date('2026-03-05T11:00:00.000Z');
    const insideBucketLegacy = new Date('2026-03-05T12:00:00.000Z');
    const outsideBucket = new Date('2026-03-06T09:00:00.000Z');
    const bucketDate = new Date('2026-03-05T00:00:00.000Z');
    const outsideBucketDate = new Date('2026-03-06T00:00:00.000Z');

    await db.insert(paymentCaptureVolumeDaily).values([
      {
        bucketDate,
        sourceCurrency: 'USD',
        grossProcessedMinor: 99_999,
        platformFeeMinor: 9_999,
        organizerProceedsMinor: 90_000,
        captureCount: 9,
        firstOccurredAt: new Date('2026-03-05T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T08:30:00.000Z'),
        sampleTraceIds: ['stale-trace'],
      },
      {
        bucketDate: outsideBucketDate,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 77_777,
        platformFeeMinor: 7_777,
        organizerProceedsMinor: 70_000,
        captureCount: 7,
        firstOccurredAt: new Date('2026-03-06T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T08:30:00.000Z'),
        sampleTraceIds: ['preserved-trace'],
      },
    ]);

    await db.insert(paymentCaptureVolumeOrganizerDaily).values({
      bucketDate,
      organizerId,
      sourceCurrency: 'USD',
      grossProcessedMinor: 99_999,
      platformFeeMinor: 9_999,
      organizerProceedsMinor: 90_000,
      captureCount: 9,
      firstOccurredAt: new Date('2026-03-05T08:00:00.000Z'),
      lastOccurredAt: new Date('2026-03-05T08:30:00.000Z'),
      sampleTraceIds: ['stale-trace'],
    });

    await db.insert(paymentCaptureVolumeReconciliationDaily).values({
      bucketDate,
      captureEventCount: 9,
      excludedEventCount: 0,
      firstOccurredAt: new Date('2026-03-05T08:00:00.000Z'),
      lastOccurredAt: new Date('2026-03-05T08:30:00.000Z'),
      sampleTraceIds: ['stale-trace'],
      excludedEventSamplesJson: [],
    });

    const acceptedRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-accepted-v1',
      organizerId,
      registrationId: acceptedRegistrationId,
      occurredAt: insideBucket,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: acceptedRegistrationId,
        grossAmount: { amountMinor: 10_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_500, currency: 'MXN' },
      },
    });

    const excludedRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-excluded-v1',
      organizerId,
      registrationId: excludedRegistrationId,
      occurredAt: insideBucketBad,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: excludedRegistrationId,
        grossAmount: { amountMinor: 11_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_000, currency: 'MXN' },
      },
    });

    const legacyRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-legacy-v2',
      organizerId,
      registrationId: legacyRegistrationId,
      occurredAt: insideBucketLegacy,
      eventVersion: 2,
      payloadJson: {
        organizerId,
        registrationId: legacyRegistrationId,
        grossAmount: { amountMinor: 12_000, currency: 'MXN' },
        feeAmount: { amountMinor: 600, currency: 'MXN' },
        netAmount: { amountMinor: 11_400, currency: 'MXN' },
      },
    });

    const outsideRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-outside-window',
      organizerId,
      registrationId: outsideRegistrationId,
      occurredAt: outsideBucket,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: outsideRegistrationId,
        grossAmount: { amountMinor: 13_000, currency: 'MXN' },
        feeAmount: { amountMinor: 650, currency: 'MXN' },
        netAmount: { amountMinor: 12_350, currency: 'MXN' },
      },
    });

    const result = await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T09:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result).toEqual(
      expect.objectContaining({
        rawEventCount: 2,
        acceptedCaptureCount: 1,
        excludedEventCount: 1,
        wroteRollups: true,
      }),
    );

    const dailyRows = await db
      .select()
      .from(paymentCaptureVolumeDaily)
      .orderBy(asc(paymentCaptureVolumeDaily.bucketDate), asc(paymentCaptureVolumeDaily.sourceCurrency));
    expect(dailyRows).toHaveLength(2);
    expect(dailyRows[0]).toEqual(
      expect.objectContaining({
        bucketDate,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_000,
        platformFeeMinor: 500,
        organizerProceedsMinor: 9_500,
        captureCount: 1,
        sampleTraceIds: ['trace-accepted-v1'],
      }),
    );
    expect(dailyRows[1]).toEqual(
      expect.objectContaining({
        bucketDate: outsideBucketDate,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 77_777,
        platformFeeMinor: 7_777,
        organizerProceedsMinor: 70_000,
        captureCount: 7,
        sampleTraceIds: ['preserved-trace'],
      }),
    );

    const organizerRows = await db
      .select()
      .from(paymentCaptureVolumeOrganizerDaily)
      .where(eq(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketDate));
    expect(organizerRows).toEqual([
      expect.objectContaining({
        bucketDate,
        organizerId,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_000,
        platformFeeMinor: 500,
        organizerProceedsMinor: 9_500,
        captureCount: 1,
        sampleTraceIds: ['trace-accepted-v1'],
      }),
    ]);

    const [reconciliationRow] = await db
      .select()
      .from(paymentCaptureVolumeReconciliationDaily)
      .where(eq(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketDate));
    expect(reconciliationRow).toEqual(
      expect.objectContaining({
        bucketDate,
        captureEventCount: 2,
        excludedEventCount: 1,
        sampleTraceIds: ['trace-accepted-v1', 'trace-excluded-v1'],
        excludedEventSamplesJson: [
          {
            traceId: 'trace-excluded-v1',
            organizerId,
            occurredAt: insideBucketBad.toISOString(),
            reason: 'math_mismatch',
          },
        ],
      }),
    );
  });

  it('deletes stale rollups when the selected bucket rebuilds to an empty window', async () => {
    const organizerId = randomUUID();
    const bucketDate = new Date('2026-03-07T00:00:00.000Z');
    const outsideBucketDate = new Date('2026-03-08T00:00:00.000Z');

    await db.insert(paymentCaptureVolumeDaily).values([
      {
        bucketDate,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 22_000,
        platformFeeMinor: 1_100,
        organizerProceedsMinor: 20_900,
        captureCount: 2,
        firstOccurredAt: new Date('2026-03-07T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-07T09:00:00.000Z'),
        sampleTraceIds: ['stale-delete-trace'],
      },
      {
        bucketDate: outsideBucketDate,
        sourceCurrency: 'USD',
        grossProcessedMinor: 33_000,
        platformFeeMinor: 1_650,
        organizerProceedsMinor: 31_350,
        captureCount: 3,
        firstOccurredAt: new Date('2026-03-08T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-08T09:00:00.000Z'),
        sampleTraceIds: ['preserved-delete-trace'],
      },
    ]);

    await db.insert(paymentCaptureVolumeOrganizerDaily).values([
      {
        bucketDate,
        organizerId,
        sourceCurrency: 'MXN',
        grossProcessedMinor: 22_000,
        platformFeeMinor: 1_100,
        organizerProceedsMinor: 20_900,
        captureCount: 2,
        firstOccurredAt: new Date('2026-03-07T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-07T09:00:00.000Z'),
        sampleTraceIds: ['stale-delete-trace'],
      },
      {
        bucketDate: outsideBucketDate,
        organizerId,
        sourceCurrency: 'USD',
        grossProcessedMinor: 33_000,
        platformFeeMinor: 1_650,
        organizerProceedsMinor: 31_350,
        captureCount: 3,
        firstOccurredAt: new Date('2026-03-08T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-08T09:00:00.000Z'),
        sampleTraceIds: ['preserved-delete-trace'],
      },
    ]);

    await db.insert(paymentCaptureVolumeReconciliationDaily).values([
      {
        bucketDate,
        captureEventCount: 2,
        excludedEventCount: 0,
        firstOccurredAt: new Date('2026-03-07T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-07T09:00:00.000Z'),
        sampleTraceIds: ['stale-delete-trace'],
        excludedEventSamplesJson: [],
      },
      {
        bucketDate: outsideBucketDate,
        captureEventCount: 3,
        excludedEventCount: 0,
        firstOccurredAt: new Date('2026-03-08T08:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-08T09:00:00.000Z'),
        sampleTraceIds: ['preserved-delete-trace'],
        excludedEventSamplesJson: [],
      },
    ]);

    const result = await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-07T00:00:00.000Z'),
      windowEnd: new Date('2026-03-07T23:59:59.999Z'),
    });

    expect(result).toEqual({
      requestedWindowStart: new Date('2026-03-07T00:00:00.000Z'),
      requestedWindowEnd: new Date('2026-03-07T23:59:59.999Z'),
      bucketStart: bucketDate,
      bucketEnd: bucketDate,
      rawEventCount: 0,
      acceptedCaptureCount: 0,
      excludedEventCount: 0,
      rowCounts: {
        daily: 0,
        organizerDaily: 0,
        reconciliationDaily: 0,
      },
      wroteRollups: true,
    });

    const dailyRows = await db
      .select()
      .from(paymentCaptureVolumeDaily)
      .orderBy(asc(paymentCaptureVolumeDaily.bucketDate), asc(paymentCaptureVolumeDaily.sourceCurrency));
    expect(dailyRows).toEqual([
      expect.objectContaining({
        bucketDate: outsideBucketDate,
        sourceCurrency: 'USD',
        sampleTraceIds: ['preserved-delete-trace'],
      }),
    ]);

    const organizerRows = await db
      .select()
      .from(paymentCaptureVolumeOrganizerDaily)
      .orderBy(
        asc(paymentCaptureVolumeOrganizerDaily.bucketDate),
        asc(paymentCaptureVolumeOrganizerDaily.sourceCurrency),
      );
    expect(organizerRows).toEqual([
      expect.objectContaining({
        bucketDate: outsideBucketDate,
        organizerId,
        sourceCurrency: 'USD',
        sampleTraceIds: ['preserved-delete-trace'],
      }),
    ]);

    const reconciliationRows = await db
      .select()
      .from(paymentCaptureVolumeReconciliationDaily)
      .orderBy(asc(paymentCaptureVolumeReconciliationDaily.bucketDate));
    expect(reconciliationRows).toEqual([
      expect.objectContaining({
        bucketDate: outsideBucketDate,
        captureEventCount: 3,
        sampleTraceIds: ['preserved-delete-trace'],
      }),
    ]);
  });

  it('surfaces accepted-volume and traceability drift from persisted rollups in the database', async () => {
    const organizerId = randomUUID();
    const acceptedAt = new Date('2026-03-05T10:00:00.000Z');
    const excludedAt = new Date('2026-03-05T11:00:00.000Z');
    const bucketDate = new Date('2026-03-05T00:00:00.000Z');

    const acceptedRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-drift-accepted',
      organizerId,
      registrationId: acceptedRegistrationId,
      occurredAt: acceptedAt,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: acceptedRegistrationId,
        grossAmount: { amountMinor: 10_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_500, currency: 'MXN' },
      },
    });

    const excludedRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-drift-excluded',
      organizerId,
      registrationId: excludedRegistrationId,
      occurredAt: excludedAt,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: excludedRegistrationId,
        grossAmount: { amountMinor: 11_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_000, currency: 'MXN' },
      },
    });

    await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    await db
      .update(paymentCaptureVolumeDaily)
      .set({
        platformFeeMinor: 700,
      })
      .where(eq(paymentCaptureVolumeDaily.bucketDate, bucketDate));

    await db
      .delete(paymentCaptureVolumeOrganizerDaily)
      .where(eq(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketDate));

    await db
      .update(paymentCaptureVolumeReconciliationDaily)
      .set({
        captureEventCount: 1,
      })
      .where(eq(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketDate));

    const result = await reconcilePaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.acceptedVolumeMismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: 'accepted_volume',
          rollup: 'daily',
          kind: 'field_mismatch',
          field: 'platformFeeMinor',
          rawValue: 500,
          persistedValue: 700,
        }),
        expect.objectContaining({
          driftType: 'accepted_volume',
          rollup: 'organizerDaily',
          kind: 'missing_persisted_row',
          key: {
            bucketDate: '2026-03-05',
            organizerId,
            sourceCurrency: 'MXN',
          },
        }),
      ]),
    );
    expect(result.traceabilityMismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: 'traceability',
          rollup: 'reconciliationDaily',
          kind: 'field_mismatch',
          field: 'captureEventCount',
          rawValue: 2,
          persistedValue: 1,
        }),
      ]),
    );
    expect(result.excludedEventMismatches).toEqual([]);
  });

  it('surfaces persisted reconciliation JSON corruption in DB-backed reconciliation', async () => {
    const organizerId = randomUUID();
    const acceptedAt = new Date('2026-03-05T10:00:00.000Z');
    const excludedAt = new Date('2026-03-05T11:00:00.000Z');
    const bucketDate = new Date('2026-03-05T00:00:00.000Z');

    const acceptedRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-db-accepted',
      organizerId,
      registrationId: acceptedRegistrationId,
      occurredAt: acceptedAt,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: acceptedRegistrationId,
        grossAmount: { amountMinor: 10_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_500, currency: 'MXN' },
      },
    });

    const excludedRegistrationId = randomUUID();
    await seedPaymentCapturedEvent({
      db,
      traceId: 'trace-db-excluded',
      organizerId,
      registrationId: excludedRegistrationId,
      occurredAt: excludedAt,
      eventVersion: 1,
      payloadJson: {
        organizerId,
        registrationId: excludedRegistrationId,
        grossAmount: { amountMinor: 11_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_000, currency: 'MXN' },
      },
    });

    await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    await db
      .update(paymentCaptureVolumeReconciliationDaily)
      .set({
        excludedEventSamplesJson: { corrupted: true } as unknown as Record<string, unknown>[],
      })
      .where(eq(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketDate));

    const result = await reconcilePaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.excludedEventMismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          driftType: 'excluded_events',
          rollup: 'reconciliationDaily',
          kind: 'field_mismatch',
          field: 'invalidExcludedEventSampleCount',
          rawValue: 0,
          persistedValue: 1,
        }),
      ]),
    );
    expect(result.traceabilityMismatches).toEqual([]);
    expect(result.acceptedVolumeMismatches).toEqual([]);

    const [persistedRow] = await db
      .select()
      .from(paymentCaptureVolumeReconciliationDaily)
      .where(eq(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketDate));
    expect(persistedRow?.excludedEventSamplesJson).toEqual({ corrupted: true });
  });
});
