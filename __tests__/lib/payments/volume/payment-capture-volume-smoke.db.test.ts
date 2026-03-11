jest.mock('next/cache', () => ({
  cacheLife: jest.fn(),
  cacheTag: jest.fn(),
}));

import { and, asc, gte, lte } from 'drizzle-orm';
import { randomUUID } from 'crypto';

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
import { getAdminPaymentCaptureVolumeMetrics } from '@/lib/payments/volume/payment-capture-volume';
import { cleanDatabase, getTestDb } from '@/tests/helpers/db';

async function cleanupPaymentVolumeTables(dbClient: ReturnType<typeof getTestDb>) {
  await dbClient.delete(paymentCaptureVolumeOrganizerDaily);
  await dbClient.delete(paymentCaptureVolumeDaily);
  await dbClient.delete(paymentCaptureVolumeReconciliationDaily);
  await dbClient.delete(moneyCommandIngestions);
  await dbClient.delete(moneyEvents);
  await dbClient.delete(moneyTraces);
}

async function ingestCanonicalCapture(params: {
  organizerId: string;
  registrationId: string;
  occurredAt: string;
  grossMinor: number;
  feeMinor: number;
  netMinor: number;
  currency: string;
}) {
  const traceId = `trace:${params.organizerId}:${params.registrationId}`;

  await moneyMutationIngress({
    traceId,
    organizerId: params.organizerId,
    idempotencyKey: `idem:${traceId}`,
    source: 'api',
    events: [
      {
        eventId: randomUUID(),
        traceId,
        occurredAt: params.occurredAt,
        recordedAt: params.occurredAt,
        eventName: 'payment.captured',
        version: 1,
        entityType: 'registration',
        entityId: params.registrationId,
        source: 'api',
        idempotencyKey: `event:${traceId}`,
        metadata: { sourceSystem: 'db-test' },
        payload: {
          organizerId: params.organizerId,
          registrationId: params.registrationId,
          grossAmount: { amountMinor: params.grossMinor, currency: params.currency },
          feeAmount: { amountMinor: params.feeMinor, currency: params.currency },
          netAmount: { amountMinor: params.netMinor, currency: params.currency },
        },
      },
    ],
  });
}

function aggregateCurrencyRows(
  rows: Array<{
    sourceCurrency: string;
    grossProcessedMinor: number;
    platformFeeMinor: number;
    organizerProceedsMinor: number;
    captureCount: number;
  }>,
) {
  const totals = new Map<
    string,
    {
      grossProcessedMinor: number;
      platformFeeMinor: number;
      organizerProceedsMinor: number;
      captureCount: number;
    }
  >();

  for (const row of rows) {
    const current = totals.get(row.sourceCurrency) ?? {
      grossProcessedMinor: 0,
      platformFeeMinor: 0,
      organizerProceedsMinor: 0,
      captureCount: 0,
    };
    current.grossProcessedMinor += row.grossProcessedMinor;
    current.platformFeeMinor += row.platformFeeMinor;
    current.organizerProceedsMinor += row.organizerProceedsMinor;
    current.captureCount += row.captureCount;
    totals.set(row.sourceCurrency, current);
  }

  return Array.from(totals.entries())
    .map(([sourceCurrency, value]) => ({
      sourceCurrency,
      ...value,
    }))
    .sort((left, right) => left.sourceCurrency.localeCompare(right.sourceCurrency));
}

function aggregateOrganizerRows(
  rows: Array<{
    organizerId: string;
    sourceCurrency: string;
    grossProcessedMinor: number;
    platformFeeMinor: number;
    organizerProceedsMinor: number;
    captureCount: number;
  }>,
) {
  const totals = new Map<
    string,
    {
      organizerId: string;
      captureCount: number;
      currencies: Map<
        string,
        {
          grossProcessedMinor: number;
          platformFeeMinor: number;
          organizerProceedsMinor: number;
        }
      >;
    }
  >();

  for (const row of rows) {
    const current = totals.get(row.organizerId) ?? {
      organizerId: row.organizerId,
      captureCount: 0,
      currencies: new Map(),
    };
    current.captureCount += row.captureCount;
    const currentCurrency = current.currencies.get(row.sourceCurrency) ?? {
      grossProcessedMinor: 0,
      platformFeeMinor: 0,
      organizerProceedsMinor: 0,
    };
    currentCurrency.grossProcessedMinor += row.grossProcessedMinor;
    currentCurrency.platformFeeMinor += row.platformFeeMinor;
    currentCurrency.organizerProceedsMinor += row.organizerProceedsMinor;
    current.currencies.set(row.sourceCurrency, currentCurrency);
    totals.set(row.organizerId, current);
  }

  return Array.from(totals.values())
    .map((row) => {
      const currencies = Array.from(row.currencies.entries()).map(([sourceCurrency, value]) => ({
        sourceCurrency,
        ...value,
      }));
      const headlineCurrency =
        currencies.find((currency) => currency.sourceCurrency === 'MXN')?.sourceCurrency ??
        [...currencies].sort((left, right) => {
          const grossDiff = right.grossProcessedMinor - left.grossProcessedMinor;
          if (grossDiff !== 0) return grossDiff;
          return left.sourceCurrency.localeCompare(right.sourceCurrency);
        })[0]?.sourceCurrency ??
        'MXN';
      const headline = currencies.find((currency) => currency.sourceCurrency === headlineCurrency) ?? {
        grossProcessedMinor: 0,
        platformFeeMinor: 0,
        organizerProceedsMinor: 0,
      };

      return {
        organizerId: row.organizerId,
        captureCount: row.captureCount,
        headlineCurrency,
        headlineGrossProcessedMinor: headline.grossProcessedMinor,
        headlinePlatformFeeMinor: headline.platformFeeMinor,
        headlineOrganizerProceedsMinor: headline.organizerProceedsMinor,
      };
    })
    .sort((left, right) => {
      const countDiff = right.captureCount - left.captureCount;
      if (countDiff !== 0) return countDiff;

      const grossDiff = right.headlineGrossProcessedMinor - left.headlineGrossProcessedMinor;
      if (grossDiff !== 0) return grossDiff;

      return left.organizerId.localeCompare(right.organizerId);
    });
}

describe('payment capture volume smoke (database)', () => {
  const testDb = getTestDb();

  beforeEach(async () => {
    await cleanDatabase(testDb);
    await cleanupPaymentVolumeTables(testDb);
  });

  afterAll(async () => {
    await cleanDatabase(testDb);
    await cleanupPaymentVolumeTables(testDb);
  });

  it('returns rollup-backed totals and paginated organizer rankings for seeded multi-organizer captures', async () => {
    const organizers = Array.from({ length: 6 }, () => randomUUID());
    const registrationIds = Array.from({ length: 8 }, () => randomUUID());

    await ingestCanonicalCapture({
      organizerId: organizers[0]!,
      registrationId: registrationIds[0]!,
      occurredAt: '2026-03-09T10:00:00.000Z',
      grossMinor: 12_000,
      feeMinor: 600,
      netMinor: 11_400,
      currency: 'MXN',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[0]!,
      registrationId: registrationIds[1]!,
      occurredAt: '2026-03-10T10:00:00.000Z',
      grossMinor: 8_000,
      feeMinor: 400,
      netMinor: 7_600,
      currency: 'MXN',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[1]!,
      registrationId: registrationIds[2]!,
      occurredAt: '2026-03-09T11:00:00.000Z',
      grossMinor: 15_000,
      feeMinor: 750,
      netMinor: 14_250,
      currency: 'MXN',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[1]!,
      registrationId: registrationIds[3]!,
      occurredAt: '2026-03-10T11:00:00.000Z',
      grossMinor: 17_000,
      feeMinor: 850,
      netMinor: 16_150,
      currency: 'MXN',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[2]!,
      registrationId: registrationIds[4]!,
      occurredAt: '2026-03-10T12:00:00.000Z',
      grossMinor: 25_000,
      feeMinor: 1_000,
      netMinor: 24_000,
      currency: 'USD',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[3]!,
      registrationId: registrationIds[5]!,
      occurredAt: '2026-03-10T13:00:00.000Z',
      grossMinor: 9_000,
      feeMinor: 450,
      netMinor: 8_550,
      currency: 'MXN',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[4]!,
      registrationId: registrationIds[6]!,
      occurredAt: '2026-03-10T14:00:00.000Z',
      grossMinor: 7_000,
      feeMinor: 350,
      netMinor: 6_650,
      currency: 'MXN',
    });
    await ingestCanonicalCapture({
      organizerId: organizers[5]!,
      registrationId: registrationIds[7]!,
      occurredAt: '2026-03-10T15:00:00.000Z',
      grossMinor: 5_000,
      feeMinor: 250,
      netMinor: 4_750,
      currency: 'USD',
    });

    const windowStart = new Date('2026-03-09T00:00:00.000Z');
    const windowEnd = new Date('2026-03-10T23:59:59.999Z');
    const dailyRows = await db
      .select()
      .from(paymentCaptureVolumeDaily)
      .where(
        and(
          gte(paymentCaptureVolumeDaily.bucketDate, windowStart),
          lte(paymentCaptureVolumeDaily.bucketDate, windowEnd),
        ),
      )
      .orderBy(
        asc(paymentCaptureVolumeDaily.bucketDate),
        asc(paymentCaptureVolumeDaily.sourceCurrency),
      );
    const organizerRows = await db
      .select()
      .from(paymentCaptureVolumeOrganizerDaily)
      .where(
        and(
          gte(paymentCaptureVolumeOrganizerDaily.bucketDate, windowStart),
          lte(paymentCaptureVolumeOrganizerDaily.bucketDate, windowEnd),
        ),
      );

    const expectedCurrencies = aggregateCurrencyRows(dailyRows);
    const expectedOrganizers = aggregateOrganizerRows(organizerRows);
    const expectedHeadlineRow = expectedCurrencies.find((row) => row.sourceCurrency === 'MXN');

    const firstPage = await getAdminPaymentCaptureVolumeMetrics({
      days: 2,
      now: new Date('2026-03-10T23:59:59.999Z'),
      organizerPage: 1,
      organizerPageSize: 3,
      sampleTraceLimit: 5,
    });
    const secondPage = await getAdminPaymentCaptureVolumeMetrics({
      days: 2,
      now: new Date('2026-03-10T23:59:59.999Z'),
      organizerPage: 2,
      organizerPageSize: 3,
      sampleTraceLimit: 5,
    });

    expect(firstPage.currencies).toEqual(expectedCurrencies);
    expect(firstPage.headlineCurrency).toBe('MXN');
    expect(firstPage.headlineGrossProcessedMinor).toBe(expectedHeadlineRow?.grossProcessedMinor ?? 0);
    expect(firstPage.headlinePlatformFeeMinor).toBe(expectedHeadlineRow?.platformFeeMinor ?? 0);
    expect(firstPage.headlineOrganizerProceedsMinor).toBe(
      expectedHeadlineRow?.organizerProceedsMinor ?? 0,
    );
    expect(firstPage.headlineCaptureCount).toBe(8);
    expect(firstPage.organizerPagination).toEqual({
      page: 1,
      pageSize: 3,
      total: 6,
      pageCount: 2,
    });
    expect(firstPage.organizers.map((row) => row.organizerId)).toEqual(
      expectedOrganizers.slice(0, 3).map((row) => row.organizerId),
    );
    expect(firstPage.organizers.map((row) => row.captureCount)).toEqual(
      expectedOrganizers.slice(0, 3).map((row) => row.captureCount),
    );
    expect(firstPage.organizers.map((row) => row.headlineGrossProcessedMinor)).toEqual(
      expectedOrganizers.slice(0, 3).map((row) => row.headlineGrossProcessedMinor),
    );
    expect(secondPage.organizerPagination).toEqual({
      page: 2,
      pageSize: 3,
      total: 6,
      pageCount: 2,
    });
    expect(secondPage.organizers.map((row) => row.organizerId)).toEqual(
      expectedOrganizers.slice(3, 6).map((row) => row.organizerId),
    );
    expect(secondPage.organizers).toHaveLength(3);
  });
});
