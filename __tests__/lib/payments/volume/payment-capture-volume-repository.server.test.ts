jest.mock('@/db', () => ({
  db: {
    select: jest.fn(),
  },
}));

jest.mock('@/db/schema', () => ({
  paymentCaptureVolumeDaily: {
    bucketDate: 'bucket_date',
    sourceCurrency: 'source_currency',
    grossProcessedMinor: 'gross_processed_minor',
    platformFeeMinor: 'platform_fee_minor',
    organizerProceedsMinor: 'organizer_proceeds_minor',
    captureCount: 'capture_count',
    firstOccurredAt: 'first_occurred_at',
    lastOccurredAt: 'last_occurred_at',
    sampleTraceIds: 'sample_trace_ids',
  },
  paymentCaptureVolumeOrganizerDaily: {
    bucketDate: 'bucket_date',
    organizerId: 'organizer_id',
    sourceCurrency: 'source_currency',
    grossProcessedMinor: 'gross_processed_minor',
    platformFeeMinor: 'platform_fee_minor',
    organizerProceedsMinor: 'organizer_proceeds_minor',
    captureCount: 'capture_count',
    firstOccurredAt: 'first_occurred_at',
    lastOccurredAt: 'last_occurred_at',
    sampleTraceIds: 'sample_trace_ids',
  },
  paymentCaptureVolumeReconciliationDaily: {
    bucketDate: 'bucket_date',
    captureEventCount: 'capture_event_count',
    excludedEventCount: 'excluded_event_count',
    firstOccurredAt: 'first_occurred_at',
    lastOccurredAt: 'last_occurred_at',
    sampleTraceIds: 'sample_trace_ids',
    excludedEventSamplesJson: 'excluded_event_samples_json',
  },
  organizations: {
    id: 'id',
    name: 'name',
  },
}));

import { db } from '@/db';
import {
  getAdminPaymentCaptureVolumeMetrics,
  MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE,
} from '@/lib/payments/volume/payment-capture-volume';

function createWhereQuery(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
}

function createOrganizerSummaryQuery(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    offset: jest.fn().mockResolvedValue(rows),
  };
}

describe('payment capture volume repository', () => {
  const mockDb = db as unknown as {
    select: jest.Mock;
  };

  function expectVolumeRowInvariant(row: {
    grossProcessedMinor: number;
    platformFeeMinor: number;
    organizerProceedsMinor: number;
  }) {
    expect(row.grossProcessedMinor).toBe(
      row.platformFeeMinor + row.organizerProceedsMinor,
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns the repository contract shape with organizer labels and traceability', async () => {
    const dailyRollupRows = [
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-1'],
      },
      {
        bucketDate: new Date('2026-03-06T00:00:00.000Z'),
        sourceCurrency: 'USD',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        sampleTraceIds: ['trace-2'],
      },
    ];

    const organizerSummaryRows = [
      {
        organizerId: 'org-1',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
      },
      {
        organizerId: 'org-2',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
      },
    ];

    const organizerRollupRows = [
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        organizerId: 'org-1',
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-1'],
      },
      {
        bucketDate: new Date('2026-03-06T00:00:00.000Z'),
        organizerId: 'org-2',
        sourceCurrency: 'USD',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        sampleTraceIds: ['trace-2'],
      },
    ];

    const reconciliationRollupRows = [
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        captureEventCount: 2,
        excludedEventCount: 1,
        firstOccurredAt: new Date('2026-03-05T09:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-1', 'trace-bad'],
        excludedEventSamplesJson: [
          {
            traceId: 'trace-bad',
            organizerId: 'org-1',
            occurredAt: '2026-03-05T09:00:00.000Z',
            reason: 'math_mismatch',
          },
        ],
      },
      {
        bucketDate: new Date('2026-03-06T00:00:00.000Z'),
        captureEventCount: 1,
        excludedEventCount: 0,
        firstOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        sampleTraceIds: ['trace-2'],
        excludedEventSamplesJson: [],
      },
    ];

    const organizationRows = [
      { id: 'org-1', name: 'Organizer One' },
      { id: 'org-2', name: 'Organizer Two' },
    ];

    const dailyRollupsQuery = createWhereQuery(dailyRollupRows);
    const organizerTotalsQuery = createWhereQuery([{ total: 2 }]);
    const organizerSummaryQuery = createOrganizerSummaryQuery(organizerSummaryRows);
    const organizerRollupsQuery = createWhereQuery(organizerRollupRows);
    const reconciliationRollupsQuery = createWhereQuery(reconciliationRollupRows);
    const organizationsQuery = createWhereQuery(organizationRows);

    mockDb.select
      .mockReturnValueOnce(dailyRollupsQuery)
      .mockReturnValueOnce(organizerTotalsQuery)
      .mockReturnValueOnce(reconciliationRollupsQuery)
      .mockReturnValueOnce(organizerSummaryQuery)
      .mockReturnValueOnce(organizerRollupsQuery)
      .mockReturnValueOnce(organizationsQuery);

    const result = await getAdminPaymentCaptureVolumeMetrics({
      days: 7,
      now: new Date('2026-03-10T00:00:00.000Z'),
      organizerLimit: 10,
      sampleTraceLimit: 3,
    });

    expect(result.headlineCurrency).toBe('MXN');
    expect(result.headlineGrossProcessedMinor).toBe(10_500);
    expect(result.headlinePlatformFeeMinor).toBe(500);
    expect(result.headlineOrganizerProceedsMinor).toBe(10_000);
    expect(result.headlineCaptureCount).toBe(2);
    expect(result.organizers.map((row) => row.organizerLabel)).toEqual([
      'Organizer One',
      'Organizer Two',
    ]);
    expect(result.organizerPagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 2,
      pageCount: 1,
    });
    expect(result.excludedEvents).toEqual([
      {
        traceId: 'trace-bad',
        organizerId: 'org-1',
        occurredAt: new Date('2026-03-05T09:00:00.000Z'),
        reason: 'math_mismatch',
      },
    ]);
    expect(result.traceability.eventCount).toBe(3);
    expect(result.traceability.distinctTraceCount).toBe(3);
    expect(result.traceability.excludedEventCount).toBe(1);
    expect(result.traceability.sampleTraceIds).toEqual(['trace-1', 'trace-2', 'trace-bad']);
    expect(mockDb.select).toHaveBeenCalledTimes(6);
    for (const row of result.currencies) {
      expectVolumeRowInvariant(row);
    }
    for (const organizer of result.organizers) {
      expectVolumeRowInvariant({
        grossProcessedMinor: organizer.headlineGrossProcessedMinor,
        platformFeeMinor: organizer.headlinePlatformFeeMinor,
        organizerProceedsMinor: organizer.headlineOrganizerProceedsMinor,
      });
      for (const row of organizer.currencies) {
        expectVolumeRowInvariant(row);
      }
    }
  });

  it('derives trace counts and excluded events from rollup rows', async () => {
    const dailyRollupRows = [
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        sourceCurrency: 'MXN',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 2,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:05:00.000Z'),
        sampleTraceIds: ['trace-1', 'trace-2'],
      },
    ];

    const organizerSummaryRows = [
      {
        organizerId: 'org-1',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 2,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:05:00.000Z'),
      },
    ];

    const organizerRollupRows = [
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        organizerId: 'org-1',
        sourceCurrency: 'MXN',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 2,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:05:00.000Z'),
        sampleTraceIds: ['trace-1', 'trace-2'],
      },
    ];

    const reconciliationRollupRows = [
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        captureEventCount: 3,
        excludedEventCount: 1,
        firstOccurredAt: new Date('2026-03-05T09:55:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:05:00.000Z'),
        sampleTraceIds: ['trace-1', 'trace-2', 'trace-bad'],
        excludedEventSamplesJson: [
          {
            traceId: 'trace-bad',
            organizerId: 'org-1',
            occurredAt: '2026-03-05T09:55:00.000Z',
            reason: 'negative_amount',
          },
        ],
      },
    ];

    const organizationRows = [{ id: 'org-1', name: 'Organizer One' }];

    const dailyRollupsQuery = createWhereQuery(dailyRollupRows);
    const organizerTotalsQuery = createWhereQuery([{ total: 1 }]);
    const organizerSummaryQuery = createOrganizerSummaryQuery(organizerSummaryRows);
    const organizerRollupsQuery = createWhereQuery(organizerRollupRows);
    const reconciliationRollupsQuery = createWhereQuery(reconciliationRollupRows);
    const organizationsQuery = createWhereQuery(organizationRows);

    mockDb.select
      .mockReturnValueOnce(dailyRollupsQuery)
      .mockReturnValueOnce(organizerTotalsQuery)
      .mockReturnValueOnce(reconciliationRollupsQuery)
      .mockReturnValueOnce(organizerSummaryQuery)
      .mockReturnValueOnce(organizerRollupsQuery)
      .mockReturnValueOnce(organizationsQuery);

    const result = await getAdminPaymentCaptureVolumeMetrics({
      days: 7,
      now: new Date('2026-03-10T00:00:00.000Z'),
      organizerLimit: 10,
      sampleTraceLimit: 5,
    });

    expect(result.headlineCaptureCount).toBe(2);
    expect(result.traceability.eventCount).toBe(3);
    expect(result.traceability.distinctTraceCount).toBe(3);
    expect(result.traceability.excludedEventCount).toBe(1);
    expect(result.traceability.sampleTraceIds).toEqual(['trace-1', 'trace-2', 'trace-bad']);
    expect(result.excludedEvents).toEqual([
      {
        traceId: 'trace-bad',
        organizerId: 'org-1',
        occurredAt: new Date('2026-03-05T09:55:00.000Z'),
        reason: 'negative_amount',
      },
    ]);
    expect(result.organizers[0]?.captureCount).toBe(2);
    expect(result.organizers[0]?.traceability.distinctTraceCount).toBe(2);
    expect(result.organizers[0]?.traceability.sampleTraceIds).toEqual(['trace-1', 'trace-2']);
    expect(result.organizerPagination).toEqual({
      page: 1,
      pageSize: 10,
      total: 1,
      pageCount: 1,
    });
    for (const row of result.currencies) {
      expectVolumeRowInvariant(row);
    }
    for (const organizer of result.organizers) {
      expectVolumeRowInvariant({
        grossProcessedMinor: organizer.headlineGrossProcessedMinor,
        platformFeeMinor: organizer.headlinePlatformFeeMinor,
        organizerProceedsMinor: organizer.headlineOrganizerProceedsMinor,
      });
      for (const row of organizer.currencies) {
        expectVolumeRowInvariant(row);
      }
    }
  });

  it('aligns the reported window start to the rollup bucket boundary for non-midnight now', async () => {
    const dailyRollupsQuery = createWhereQuery([]);
    const organizerTotalsQuery = createWhereQuery([{ total: 0 }]);
    const reconciliationRollupsQuery = createWhereQuery([]);

    mockDb.select
      .mockReturnValueOnce(dailyRollupsQuery)
      .mockReturnValueOnce(organizerTotalsQuery)
      .mockReturnValueOnce(reconciliationRollupsQuery);

    const result = await getAdminPaymentCaptureVolumeMetrics({
      days: 2,
      now: new Date('2026-03-10T14:09:00.000Z'),
    });

    expect(result.windowStart).toEqual(new Date('2026-03-09T00:00:00.000Z'));
    expect(result.windowEnd).toEqual(new Date('2026-03-10T14:09:00.000Z'));
    expect(result.organizerPagination).toEqual({
      page: 1,
      pageSize: 5,
      total: 0,
      pageCount: 0,
    });
  });

  it('keeps organizer headline amounts aligned to the selected headline currency when organizer totals span currencies', async () => {
    const dailyRollupsQuery = createWhereQuery([
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-mxn'],
      },
      {
        bucketDate: new Date('2026-03-06T00:00:00.000Z'),
        sourceCurrency: 'USD',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        sampleTraceIds: ['trace-usd'],
      },
    ]);
    const organizerTotalsQuery = createWhereQuery([{ total: 1 }]);
    const reconciliationRollupsQuery = createWhereQuery([
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        captureEventCount: 2,
        excludedEventCount: 0,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        sampleTraceIds: ['trace-mxn', 'trace-usd'],
        excludedEventSamplesJson: [],
      },
    ]);
    const organizerSummaryQuery = createOrganizerSummaryQuery([
      {
        organizerId: 'org-1',
        grossProcessedMinor: 30_500,
        platformFeeMinor: 1_500,
        organizerProceedsMinor: 29_000,
        captureCount: 2,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
      },
    ]);
    const organizerRollupsQuery = createWhereQuery([
      {
        bucketDate: new Date('2026-03-05T00:00:00.000Z'),
        organizerId: 'org-1',
        sourceCurrency: 'MXN',
        grossProcessedMinor: 10_500,
        platformFeeMinor: 500,
        organizerProceedsMinor: 10_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
        sampleTraceIds: ['trace-mxn'],
      },
      {
        bucketDate: new Date('2026-03-06T00:00:00.000Z'),
        organizerId: 'org-1',
        sourceCurrency: 'USD',
        grossProcessedMinor: 20_000,
        platformFeeMinor: 1_000,
        organizerProceedsMinor: 19_000,
        captureCount: 1,
        firstOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        lastOccurredAt: new Date('2026-03-06T10:00:00.000Z'),
        sampleTraceIds: ['trace-usd'],
      },
    ]);
    const organizationsQuery = createWhereQuery([{ id: 'org-1', name: 'Organizer One' }]);

    mockDb.select
      .mockReturnValueOnce(dailyRollupsQuery)
      .mockReturnValueOnce(organizerTotalsQuery)
      .mockReturnValueOnce(reconciliationRollupsQuery)
      .mockReturnValueOnce(organizerSummaryQuery)
      .mockReturnValueOnce(organizerRollupsQuery)
      .mockReturnValueOnce(organizationsQuery);

    const result = await getAdminPaymentCaptureVolumeMetrics({
      days: 7,
      now: new Date('2026-03-10T00:00:00.000Z'),
      organizerPage: 1,
      organizerPageSize: 5,
      sampleTraceLimit: 5,
    });

    expect(result.organizers).toEqual([
      expect.objectContaining({
        organizerId: 'org-1',
        organizerLabel: 'Organizer One',
        headlineCurrency: 'MXN',
        headlineGrossProcessedMinor: 10_500,
        headlinePlatformFeeMinor: 500,
        headlineOrganizerProceedsMinor: 10_000,
        captureCount: 2,
      }),
    ]);
  });

  it('clamps organizer page size requests so ranking queries stay bounded', async () => {
    const dailyRollupsQuery = createWhereQuery([]);
    const organizerTotalsQuery = createWhereQuery([{ total: 60 }]);
    const reconciliationRollupsQuery = createWhereQuery([]);
    const organizerSummaryQuery = createOrganizerSummaryQuery([]);

    mockDb.select
      .mockReturnValueOnce(dailyRollupsQuery)
      .mockReturnValueOnce(organizerTotalsQuery)
      .mockReturnValueOnce(reconciliationRollupsQuery)
      .mockReturnValueOnce(organizerSummaryQuery);

    const result = await getAdminPaymentCaptureVolumeMetrics({
      days: 7,
      now: new Date('2026-03-10T00:00:00.000Z'),
      organizerPage: 2,
      organizerPageSize: 999,
    });

    expect(result.organizerPagination).toEqual({
      page: 2,
      pageSize: MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE,
      total: 60,
      pageCount: 3,
    });
    expect(organizerSummaryQuery.limit).toHaveBeenCalledWith(
      MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE,
    );
    expect(organizerSummaryQuery.offset).toHaveBeenCalledWith(
      MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE,
    );
    expect(result.organizers).toEqual([]);
  });
});
