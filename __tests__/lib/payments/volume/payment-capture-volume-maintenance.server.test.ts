const mockSafeRevalidateTag = jest.fn();

jest.mock('@/db', () => ({
  db: {
    transaction: jest.fn(),
    select: jest.fn(),
  },
}));

jest.mock('@/lib/next-cache', () => ({
  safeRevalidateTag: (...args: unknown[]) => mockSafeRevalidateTag(...args),
}));

import { db } from '@/db';
import {
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';
import {
  rebuildPaymentCaptureVolumeRollups,
  reconcilePaymentCaptureVolumeRollups,
} from '@/lib/payments/volume/payment-capture-volume-maintenance';

type InsertCall = {
  table: unknown;
  values: unknown;
};

function createOrderedSelectQuery(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockResolvedValue(rows),
  };
}

function createWhereSelectQuery(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(rows),
  };
}

function createRebuildTransaction(params: {
  rawEventRows: Array<{
    traceId: string;
    organizerId: string | null;
    eventVersion: number;
    occurredAt: Date;
    payloadJson: Record<string, unknown>;
  }>;
  insertCalls: InsertCall[];
  deleteTables: unknown[];
}) {
  return {
    select: jest.fn().mockReturnValue(createOrderedSelectQuery(params.rawEventRows)),
    delete: jest.fn((table: unknown) => {
      params.deleteTables.push(table);
      return {
        where: jest.fn().mockResolvedValue(undefined),
      };
    }),
    insert: jest.fn((table: unknown) => ({
      values: jest.fn(async (values: unknown) => {
        params.insertCalls.push({ table, values });
        return undefined;
      }),
    })),
  };
}

function createReadTransaction(selectQueries: Array<ReturnType<typeof createWhereSelectQuery>>) {
  const select = jest.fn();
  for (const query of selectQueries) {
    select.mockReturnValueOnce(query);
  }

  return { select };
}

describe('payment capture volume maintenance', () => {
  const mockDb = db as unknown as {
    transaction: jest.Mock;
    select: jest.Mock;
  };

  const rawEventRows = [
    {
      traceId: 'trace-good-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventVersion: 1,
      occurredAt: new Date('2026-03-05T10:00:00.000Z'),
      payloadJson: {
        organizerId: '22222222-2222-4222-8222-222222222222',
        registrationId: '33333333-3333-4333-8333-333333333333',
        grossAmount: { amountMinor: 10_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_500, currency: 'MXN' },
      },
    },
    {
      traceId: 'trace-bad-1',
      organizerId: '22222222-2222-4222-8222-222222222222',
      eventVersion: 1,
      occurredAt: new Date('2026-03-05T11:00:00.000Z'),
      payloadJson: {
        organizerId: '22222222-2222-4222-8222-222222222222',
        registrationId: '44444444-4444-4444-8444-444444444444',
        grossAmount: { amountMinor: 11_000, currency: 'MXN' },
        feeAmount: { amountMinor: 500, currency: 'MXN' },
        netAmount: { amountMinor: 9_000, currency: 'MXN' },
      },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rebuilds a selected window deterministically from canonical payment captures', async () => {
    const firstInsertCalls: InsertCall[] = [];
    const firstDeleteTables: unknown[] = [];
    const secondInsertCalls: InsertCall[] = [];
    const secondDeleteTables: unknown[] = [];

    mockDb.transaction
      .mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(
          createRebuildTransaction({
            rawEventRows,
            insertCalls: firstInsertCalls,
            deleteTables: firstDeleteTables,
          }),
        ),
      )
      .mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback(
          createRebuildTransaction({
            rawEventRows,
            insertCalls: secondInsertCalls,
            deleteTables: secondDeleteTables,
          }),
        ),
      );

    const first = await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T09:30:00.000Z'),
      windowEnd: new Date('2026-03-05T23:00:00.000Z'),
    });
    const second = await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T09:30:00.000Z'),
      windowEnd: new Date('2026-03-05T23:00:00.000Z'),
    });

    expect(first).toEqual(second);
    expect(first).toEqual({
      requestedWindowStart: new Date('2026-03-05T09:30:00.000Z'),
      requestedWindowEnd: new Date('2026-03-05T23:00:00.000Z'),
      bucketStart: new Date('2026-03-05T00:00:00.000Z'),
      bucketEnd: new Date('2026-03-05T00:00:00.000Z'),
      rawEventCount: 2,
      acceptedCaptureCount: 1,
      excludedEventCount: 1,
      rowCounts: {
        daily: 1,
        organizerDaily: 1,
        reconciliationDaily: 1,
      },
      wroteRollups: true,
    });

    expect(firstDeleteTables).toEqual([
      paymentCaptureVolumeDaily,
      paymentCaptureVolumeOrganizerDaily,
      paymentCaptureVolumeReconciliationDaily,
    ]);
    expect(secondDeleteTables).toEqual(firstDeleteTables);
    expect(firstInsertCalls).toEqual(secondInsertCalls);
    expect(firstInsertCalls).toEqual([
      {
        table: paymentCaptureVolumeDaily,
        values: [
          expect.objectContaining({
            bucketDate: new Date('2026-03-05T00:00:00.000Z'),
            sourceCurrency: 'MXN',
            grossProcessedMinor: 10_000,
            platformFeeMinor: 500,
            organizerProceedsMinor: 9_500,
            captureCount: 1,
            sampleTraceIds: ['trace-good-1'],
          }),
        ],
      },
      {
        table: paymentCaptureVolumeOrganizerDaily,
        values: [
          expect.objectContaining({
            bucketDate: new Date('2026-03-05T00:00:00.000Z'),
            organizerId: '22222222-2222-4222-8222-222222222222',
            sourceCurrency: 'MXN',
            grossProcessedMinor: 10_000,
            platformFeeMinor: 500,
            organizerProceedsMinor: 9_500,
            captureCount: 1,
            sampleTraceIds: ['trace-good-1'],
          }),
        ],
      },
      {
        table: paymentCaptureVolumeReconciliationDaily,
        values: [
          expect.objectContaining({
            bucketDate: new Date('2026-03-05T00:00:00.000Z'),
            captureEventCount: 2,
            excludedEventCount: 1,
            sampleTraceIds: ['trace-bad-1', 'trace-good-1'],
            excludedEventSamplesJson: [
              {
                traceId: 'trace-bad-1',
                organizerId: '22222222-2222-4222-8222-222222222222',
                occurredAt: '2026-03-05T11:00:00.000Z',
                reason: 'math_mismatch',
              },
            ],
          }),
        ],
      },
    ]);

    expect(mockSafeRevalidateTag).toHaveBeenCalled();
    expect(mockDb.transaction).toHaveBeenNthCalledWith(
      1,
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: 'repeatable read',
        accessMode: 'read write',
      }),
    );
  });

  it('reports rebuild writes even when the selected window rebuilds to empty rollups', async () => {
    const deleteTables: unknown[] = [];
    const insertCalls: InsertCall[] = [];

    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createRebuildTransaction({
          rawEventRows: [],
          insertCalls,
          deleteTables,
        }),
      ),
    );

    const result = await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result).toEqual({
      requestedWindowStart: new Date('2026-03-05T00:00:00.000Z'),
      requestedWindowEnd: new Date('2026-03-05T23:59:59.999Z'),
      bucketStart: new Date('2026-03-05T00:00:00.000Z'),
      bucketEnd: new Date('2026-03-05T00:00:00.000Z'),
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
    expect(deleteTables).toEqual([
      paymentCaptureVolumeDaily,
      paymentCaptureVolumeOrganizerDaily,
      paymentCaptureVolumeReconciliationDaily,
    ]);
    expect(insertCalls).toEqual([]);
  });

  it('surfaces accepted-volume, excluded-event, and traceability drift from persisted rollups', async () => {
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createReadTransaction([
          createOrderedSelectQuery(rawEventRows),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 700,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              captureEventCount: 1,
              excludedEventCount: 0,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
              excludedEventSamplesJson: [],
            },
          ]),
        ]),
      ),
    );

    const result = await reconcilePaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result.ok).toBe(false);
    expect(result.rebuiltRowCounts).toEqual({
      daily: 1,
      organizerDaily: 1,
      reconciliationDaily: 1,
    });
    expect(result.persistedRowCounts).toEqual({
      daily: 1,
      organizerDaily: 0,
      reconciliationDaily: 1,
    });
    expect(result.acceptedVolumeMismatches).toEqual([
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
          organizerId: '22222222-2222-4222-8222-222222222222',
          sourceCurrency: 'MXN',
        },
      }),
    ]);
    expect(result.excludedEventMismatches).toEqual([
      expect.objectContaining({
        driftType: 'excluded_events',
        rollup: 'reconciliationDaily',
        kind: 'field_mismatch',
        field: 'excludedEventCount',
        rawValue: 1,
        persistedValue: 0,
      }),
      expect.objectContaining({
        driftType: 'excluded_events',
        rollup: 'reconciliationDaily',
        kind: 'field_mismatch',
        field: 'excludedEventSamplesJson',
      }),
    ]);
    expect(result.traceabilityMismatches).toEqual([
      expect.objectContaining({
        driftType: 'traceability',
        rollup: 'reconciliationDaily',
        kind: 'field_mismatch',
        field: 'captureEventCount',
        rawValue: 2,
        persistedValue: 1,
      }),
      expect.objectContaining({
        driftType: 'traceability',
        rollup: 'reconciliationDaily',
        kind: 'field_mismatch',
        field: 'lastOccurredAt',
      }),
      expect.objectContaining({
        driftType: 'traceability',
        rollup: 'reconciliationDaily',
        kind: 'field_mismatch',
        field: 'sampleTraceIds',
      }),
    ]);
    expect(result.mismatches).toHaveLength(7);
    expect(mockDb.transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: 'repeatable read',
        accessMode: 'read only',
      }),
    );
  });

  it('classifies missing reconciliation rows with excluded captures as both excluded-event and traceability drift', async () => {
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createReadTransaction([
          createOrderedSelectQuery(rawEventRows),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 500,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              organizerId: '22222222-2222-4222-8222-222222222222',
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 500,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([]),
        ]),
      ),
    );

    const result = await reconcilePaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result.excludedEventMismatches).toEqual([
      expect.objectContaining({
        driftType: 'excluded_events',
        rollup: 'reconciliationDaily',
        kind: 'missing_persisted_row',
        key: { bucketDate: '2026-03-05' },
      }),
    ]);
    expect(result.traceabilityMismatches).toEqual([
      expect.objectContaining({
        driftType: 'traceability',
        rollup: 'reconciliationDaily',
        kind: 'missing_persisted_row',
        key: { bucketDate: '2026-03-05' },
      }),
    ]);
  });

  it('reuses shared projector semantics for missing organizer exclusions during reconciliation', async () => {
    const rawRowsWithMissingOrganizer = [
      {
        traceId: 'trace-missing-organizer-1',
        organizerId: '   ',
        eventVersion: 1,
        occurredAt: new Date('2026-03-05T12:00:00.000Z'),
        payloadJson: {
          organizerId: '   ',
          registrationId: '55555555-5555-4555-8555-555555555555',
          grossAmount: { amountMinor: 5_000, currency: 'MXN' },
          feeAmount: { amountMinor: 250, currency: 'MXN' },
          netAmount: { amountMinor: 4_750, currency: 'MXN' },
        },
      },
    ];

    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createReadTransaction([
          createOrderedSelectQuery(rawRowsWithMissingOrganizer),
          createWhereSelectQuery([]),
          createWhereSelectQuery([]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              captureEventCount: 1,
              excludedEventCount: 1,
              firstOccurredAt: new Date('2026-03-05T12:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T12:00:00.000Z'),
              sampleTraceIds: ['trace-missing-organizer-1'],
              excludedEventSamplesJson: [
                {
                  traceId: 'trace-missing-organizer-1',
                  organizerId: null,
                  occurredAt: '2026-03-05T12:00:00.000Z',
                  reason: 'missing_organizer_id',
                },
              ],
            },
          ]),
        ]),
      ),
    );

    const result = await reconcilePaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result.ok).toBe(true);
    expect(result.excludedEventMismatches).toEqual([]);
    expect(result.traceabilityMismatches).toEqual([]);
    expect(result.acceptedVolumeMismatches).toEqual([]);
  });

  it('ignores non-v1 payment.captured rows during rebuild', async () => {
    const deleteTables: unknown[] = [];
    const insertCalls: InsertCall[] = [];
    const mixedVersionRows = [
      ...rawEventRows,
      {
        traceId: 'trace-v2-ignored',
        organizerId: '22222222-2222-4222-8222-222222222222',
        eventVersion: 2,
        occurredAt: new Date('2026-03-05T12:00:00.000Z'),
        payloadJson: {
          organizerId: '22222222-2222-4222-8222-222222222222',
          registrationId: '66666666-6666-4666-8666-666666666666',
          grossAmount: { amountMinor: 12_000, currency: 'MXN' },
          feeAmount: { amountMinor: 600, currency: 'MXN' },
          netAmount: { amountMinor: 11_400, currency: 'MXN' },
        },
      },
    ];

    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createRebuildTransaction({
          rawEventRows: mixedVersionRows,
          insertCalls,
          deleteTables,
        }),
      ),
    );

    const result = await rebuildPaymentCaptureVolumeRollups({
      windowStart: new Date('2026-03-05T00:00:00.000Z'),
      windowEnd: new Date('2026-03-05T23:59:59.999Z'),
    });

    expect(result.rawEventCount).toBe(2);
    expect(result.acceptedCaptureCount).toBe(1);
    expect(result.excludedEventCount).toBe(1);
    expect(deleteTables).toEqual([
      paymentCaptureVolumeDaily,
      paymentCaptureVolumeOrganizerDaily,
      paymentCaptureVolumeReconciliationDaily,
    ]);
    expect(insertCalls).toHaveLength(3);
  });

  it('surfaces malformed persisted excluded-event samples as explicit reconciliation drift', async () => {
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createReadTransaction([
          createOrderedSelectQuery(rawEventRows),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 500,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              organizerId: '22222222-2222-4222-8222-222222222222',
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 500,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              captureEventCount: 2,
              excludedEventCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T11:00:00.000Z'),
              sampleTraceIds: ['trace-bad-1', 'trace-good-1'],
              excludedEventSamplesJson: [
                {
                  traceId: 'trace-bad-1',
                  organizerId: '22222222-2222-4222-8222-222222222222',
                  occurredAt: '2026-03-05T11:00:00.000Z',
                  reason: 'math_mismatch',
                },
                {
                  traceId: 'trace-corrupt',
                  organizerId: '22222222-2222-4222-8222-222222222222',
                  occurredAt: '2026-03-05T11:05:00.000Z',
                  reason: 42,
                },
              ],
            },
          ]),
        ]),
      ),
    );

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
  });

  it('surfaces non-array persisted excluded-event samples as explicit reconciliation drift', async () => {
    mockDb.transaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(
        createReadTransaction([
          createOrderedSelectQuery(rawEventRows),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 500,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              organizerId: '22222222-2222-4222-8222-222222222222',
              sourceCurrency: 'MXN',
              grossProcessedMinor: 10_000,
              platformFeeMinor: 500,
              organizerProceedsMinor: 9_500,
              captureCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              sampleTraceIds: ['trace-good-1'],
            },
          ]),
          createWhereSelectQuery([
            {
              bucketDate: new Date('2026-03-05T00:00:00.000Z'),
              captureEventCount: 2,
              excludedEventCount: 1,
              firstOccurredAt: new Date('2026-03-05T10:00:00.000Z'),
              lastOccurredAt: new Date('2026-03-05T11:00:00.000Z'),
              sampleTraceIds: ['trace-bad-1', 'trace-good-1'],
              excludedEventSamplesJson: 'corrupt-json',
            },
          ]),
        ]),
      ),
    );

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
  });
});
