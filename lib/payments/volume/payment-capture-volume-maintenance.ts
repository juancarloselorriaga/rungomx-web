'server only';

import { addDays } from 'date-fns';
import { and, asc, eq, gte, lt, lte } from 'drizzle-orm';

import { db } from '@/db';
import {
  moneyEvents,
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';

import {
  ADMIN_PAYMENTS_REPORTING_TIMEZONE,
  isPaymentCaptureVolumeExcludedReason,
  toReportingBucketDate,
  type PaymentCaptureVolumeProjectionEvent,
} from './payment-capture-volume';
import {
  buildPaymentCaptureVolumeRollupsFromProjectionEvents,
  replacePaymentCaptureVolumeRollupsInTransaction,
  revalidateAdminPaymentCaptureVolumeCaches,
  type PaymentCaptureVolumeDailyRollupRow,
  type PaymentCaptureVolumeOrganizerDailyRollupRow,
  type PaymentCaptureVolumeReconciliationDailyRollupRow,
  type PaymentCaptureVolumeExcludedEventSampleRecord,
  type PaymentCaptureVolumeRollupSet,
} from './payment-capture-volume-rollups';

type PaymentCaptureVolumeMaintenanceTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentCaptureVolumeMaintenanceDbClient =
  | typeof db
  | PaymentCaptureVolumeMaintenanceTransaction;

type PaymentCaptureVolumeBucketWindow = {
  requestedWindowStart: Date;
  requestedWindowEnd: Date;
  bucketStart: Date;
  bucketEnd: Date;
  occurredAtStart: Date;
  occurredAtEndExclusive: Date;
};

type PaymentCaptureVolumeMismatchKey = {
  bucketDate: string;
  organizerId?: string;
  sourceCurrency?: string;
};

type LoadedReconciliationDailyRollupRow = PaymentCaptureVolumeReconciliationDailyRollupRow & {
  invalidExcludedEventSampleCount: number;
};

const PAYMENT_CAPTURE_VOLUME_REBUILD_TRANSACTION_CONFIG = {
  isolationLevel: 'repeatable read',
  accessMode: 'read write',
} as const;

const PAYMENT_CAPTURE_VOLUME_RECONCILIATION_TRANSACTION_CONFIG = {
  isolationLevel: 'repeatable read',
  accessMode: 'read only',
} as const;

export type PaymentCaptureVolumeRollupMismatch = {
  driftType: 'accepted_volume' | 'excluded_events' | 'traceability';
  rollup: 'daily' | 'organizerDaily' | 'reconciliationDaily';
  kind: 'missing_persisted_row' | 'unexpected_persisted_row' | 'field_mismatch';
  key: PaymentCaptureVolumeMismatchKey;
  field?: string;
  rawValue: unknown;
  persistedValue: unknown;
};

export type PaymentCaptureVolumeRebuildResult = {
  requestedWindowStart: Date;
  requestedWindowEnd: Date;
  bucketStart: Date;
  bucketEnd: Date;
  rawEventCount: number;
  acceptedCaptureCount: number;
  excludedEventCount: number;
  rowCounts: {
    daily: number;
    organizerDaily: number;
    reconciliationDaily: number;
  };
  wroteRollups: boolean;
};

export type PaymentCaptureVolumeReconciliationResult = {
  requestedWindowStart: Date;
  requestedWindowEnd: Date;
  bucketStart: Date;
  bucketEnd: Date;
  rawEventCount: number;
  rebuiltRowCounts: {
    daily: number;
    organizerDaily: number;
    reconciliationDaily: number;
  };
  persistedRowCounts: {
    daily: number;
    organizerDaily: number;
    reconciliationDaily: number;
  };
  mismatches: PaymentCaptureVolumeRollupMismatch[];
  acceptedVolumeMismatches: PaymentCaptureVolumeRollupMismatch[];
  excludedEventMismatches: PaymentCaptureVolumeRollupMismatch[];
  traceabilityMismatches: PaymentCaptureVolumeRollupMismatch[];
  ok: boolean;
};

function bucketDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function bucketDateToDate(bucketDate: string): Date {
  return new Date(`${bucketDate}T00:00:00.000Z`);
}

function normalizePaymentCaptureVolumeBucketWindow(params: {
  windowStart: Date;
  windowEnd: Date;
}): PaymentCaptureVolumeBucketWindow {
  if (params.windowEnd.getTime() < params.windowStart.getTime()) {
    throw new Error('Payment capture volume maintenance requires windowEnd >= windowStart.');
  }

  const bucketStartKey = toReportingBucketDate(
    params.windowStart,
    ADMIN_PAYMENTS_REPORTING_TIMEZONE,
  );
  const bucketEndKey = toReportingBucketDate(params.windowEnd, ADMIN_PAYMENTS_REPORTING_TIMEZONE);
  const bucketStart = bucketDateToDate(bucketStartKey);
  const bucketEnd = bucketDateToDate(bucketEndKey);

  // Reporting is explicitly UTC today. If that timezone changes, this boundary conversion must
  // evolve alongside the reporting contract rather than silently shifting semantics here.
  return {
    requestedWindowStart: params.windowStart,
    requestedWindowEnd: params.windowEnd,
    bucketStart,
    bucketEnd,
    occurredAtStart: bucketStart,
    occurredAtEndExclusive: addDays(bucketEnd, 1),
  };
}

function normalizeExcludedEventSamples(samples: unknown): {
  samples: PaymentCaptureVolumeExcludedEventSampleRecord[];
  invalidSampleCount: number;
} {
  if (samples == null) {
    return {
      samples: [],
      invalidSampleCount: 0,
    };
  }

  if (!Array.isArray(samples)) {
    return {
      samples: [],
      invalidSampleCount: 1,
    };
  }

  let invalidSampleCount = 0;
  const normalizedSamples = samples
    .flatMap((sample) => {
      if (!sample || typeof sample !== 'object') {
        invalidSampleCount += 1;
        return [];
      }

      const traceId = (sample as Record<string, unknown>).traceId;
      const organizerId = (sample as Record<string, unknown>).organizerId;
      const occurredAt = (sample as Record<string, unknown>).occurredAt;
      const reason = (sample as Record<string, unknown>).reason;
      if (
        typeof traceId !== 'string' ||
        (organizerId !== null && typeof organizerId !== 'string') ||
        typeof occurredAt !== 'string' ||
        typeof reason !== 'string' ||
        !isPaymentCaptureVolumeExcludedReason(reason)
      ) {
        invalidSampleCount += 1;
        return [];
      }

      return [
        {
          traceId,
          organizerId,
          occurredAt,
          reason,
        } satisfies PaymentCaptureVolumeExcludedEventSampleRecord,
      ];
    })
    .sort((left, right) => {
      const occurredAtDiff = left.occurredAt.localeCompare(right.occurredAt);
      if (occurredAtDiff !== 0) return occurredAtDiff;

      const traceIdDiff = left.traceId.localeCompare(right.traceId);
      if (traceIdDiff !== 0) return traceIdDiff;

      return left.reason.localeCompare(right.reason);
    });

  return {
    samples: normalizedSamples,
    invalidSampleCount,
  };
}

function loadAcceptedCaptureCount(rollups: PaymentCaptureVolumeRollupSet): number {
  return rollups.daily.reduce((total, row) => total + row.captureCount, 0);
}

function loadExcludedCaptureCount(rollups: PaymentCaptureVolumeRollupSet): number {
  return rollups.reconciliationDaily.reduce((total, row) => total + row.excludedEventCount, 0);
}

async function loadPaymentCaptureProjectionEventsForWindow(params: {
  dbClient: PaymentCaptureVolumeMaintenanceDbClient;
  window: PaymentCaptureVolumeBucketWindow;
}): Promise<PaymentCaptureVolumeProjectionEvent[]> {
  const rows = await params.dbClient
    .select({
      traceId: moneyEvents.traceId,
      organizerId: moneyEvents.organizerId,
      eventVersion: moneyEvents.eventVersion,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.eventName, 'payment.captured'),
        eq(moneyEvents.eventVersion, 1),
        gte(moneyEvents.occurredAt, params.window.occurredAtStart),
        lt(moneyEvents.occurredAt, params.window.occurredAtEndExclusive),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.traceId));

  return rows
    .filter((row) => row.eventVersion === 1)
    .map((row) => ({
      traceId: row.traceId,
      organizerId: row.organizerId,
      eventName: 'payment.captured',
      occurredAt: row.occurredAt,
      payloadJson: row.payloadJson,
    }));
}

async function loadPersistedDailyRollups(params: {
  dbClient: PaymentCaptureVolumeMaintenanceDbClient;
  window: PaymentCaptureVolumeBucketWindow;
}): Promise<PaymentCaptureVolumeDailyRollupRow[]> {
  const rows = await params.dbClient
    .select({
      bucketDate: paymentCaptureVolumeDaily.bucketDate,
      sourceCurrency: paymentCaptureVolumeDaily.sourceCurrency,
      grossProcessedMinor: paymentCaptureVolumeDaily.grossProcessedMinor,
      platformFeeMinor: paymentCaptureVolumeDaily.platformFeeMinor,
      organizerProceedsMinor: paymentCaptureVolumeDaily.organizerProceedsMinor,
      captureCount: paymentCaptureVolumeDaily.captureCount,
      firstOccurredAt: paymentCaptureVolumeDaily.firstOccurredAt,
      lastOccurredAt: paymentCaptureVolumeDaily.lastOccurredAt,
      sampleTraceIds: paymentCaptureVolumeDaily.sampleTraceIds,
    })
    .from(paymentCaptureVolumeDaily)
    .where(
      and(
        gte(paymentCaptureVolumeDaily.bucketDate, params.window.bucketStart),
        lte(paymentCaptureVolumeDaily.bucketDate, params.window.bucketEnd),
      ),
    );

  return rows.map((row) => ({
    ...row,
    sampleTraceIds: row.sampleTraceIds ?? [],
  }));
}

async function loadPersistedOrganizerDailyRollups(params: {
  dbClient: PaymentCaptureVolumeMaintenanceDbClient;
  window: PaymentCaptureVolumeBucketWindow;
}): Promise<PaymentCaptureVolumeOrganizerDailyRollupRow[]> {
  const rows = await params.dbClient
    .select({
      bucketDate: paymentCaptureVolumeOrganizerDaily.bucketDate,
      organizerId: paymentCaptureVolumeOrganizerDaily.organizerId,
      sourceCurrency: paymentCaptureVolumeOrganizerDaily.sourceCurrency,
      grossProcessedMinor: paymentCaptureVolumeOrganizerDaily.grossProcessedMinor,
      platformFeeMinor: paymentCaptureVolumeOrganizerDaily.platformFeeMinor,
      organizerProceedsMinor: paymentCaptureVolumeOrganizerDaily.organizerProceedsMinor,
      captureCount: paymentCaptureVolumeOrganizerDaily.captureCount,
      firstOccurredAt: paymentCaptureVolumeOrganizerDaily.firstOccurredAt,
      lastOccurredAt: paymentCaptureVolumeOrganizerDaily.lastOccurredAt,
      sampleTraceIds: paymentCaptureVolumeOrganizerDaily.sampleTraceIds,
    })
    .from(paymentCaptureVolumeOrganizerDaily)
    .where(
      and(
        gte(paymentCaptureVolumeOrganizerDaily.bucketDate, params.window.bucketStart),
        lte(paymentCaptureVolumeOrganizerDaily.bucketDate, params.window.bucketEnd),
      ),
    );

  return rows.map((row) => ({
    ...row,
    sampleTraceIds: row.sampleTraceIds ?? [],
  }));
}

async function loadPersistedReconciliationDailyRollups(params: {
  dbClient: PaymentCaptureVolumeMaintenanceDbClient;
  window: PaymentCaptureVolumeBucketWindow;
}): Promise<LoadedReconciliationDailyRollupRow[]> {
  const rows = await params.dbClient
    .select({
      bucketDate: paymentCaptureVolumeReconciliationDaily.bucketDate,
      captureEventCount: paymentCaptureVolumeReconciliationDaily.captureEventCount,
      excludedEventCount: paymentCaptureVolumeReconciliationDaily.excludedEventCount,
      firstOccurredAt: paymentCaptureVolumeReconciliationDaily.firstOccurredAt,
      lastOccurredAt: paymentCaptureVolumeReconciliationDaily.lastOccurredAt,
      sampleTraceIds: paymentCaptureVolumeReconciliationDaily.sampleTraceIds,
      excludedEventSamplesJson: paymentCaptureVolumeReconciliationDaily.excludedEventSamplesJson,
    })
    .from(paymentCaptureVolumeReconciliationDaily)
    .where(
      and(
        gte(paymentCaptureVolumeReconciliationDaily.bucketDate, params.window.bucketStart),
        lte(paymentCaptureVolumeReconciliationDaily.bucketDate, params.window.bucketEnd),
      ),
    );

  return rows.map((row) => {
    const normalizedSamples = normalizeExcludedEventSamples(row.excludedEventSamplesJson);

    return {
      ...row,
      sampleTraceIds: row.sampleTraceIds ?? [],
      excludedEventSamplesJson: normalizedSamples.samples,
      invalidExcludedEventSampleCount: normalizedSamples.invalidSampleCount,
    };
  });
}

function dailyRollupKey(row: PaymentCaptureVolumeDailyRollupRow): string {
  return `${bucketDateKey(row.bucketDate)}:${row.sourceCurrency}`;
}

function organizerDailyRollupKey(row: PaymentCaptureVolumeOrganizerDailyRollupRow): string {
  return `${bucketDateKey(row.bucketDate)}:${row.organizerId}:${row.sourceCurrency}`;
}

function reconciliationDailyRollupKey(
  row: PaymentCaptureVolumeReconciliationDailyRollupRow,
): string {
  return bucketDateKey(row.bucketDate);
}

function dailyRollupKeyMeta(row: PaymentCaptureVolumeDailyRollupRow): PaymentCaptureVolumeMismatchKey {
  return {
    bucketDate: bucketDateKey(row.bucketDate),
    sourceCurrency: row.sourceCurrency,
  };
}

function organizerDailyRollupKeyMeta(
  row: PaymentCaptureVolumeOrganizerDailyRollupRow,
): PaymentCaptureVolumeMismatchKey {
  return {
    bucketDate: bucketDateKey(row.bucketDate),
    organizerId: row.organizerId,
    sourceCurrency: row.sourceCurrency,
  };
}

function reconciliationDailyRollupKeyMeta(
  row: PaymentCaptureVolumeReconciliationDailyRollupRow,
): PaymentCaptureVolumeMismatchKey {
  return {
    bucketDate: bucketDateKey(row.bucketDate),
  };
}

function compareAcceptedVolumeRollups(
  params: {
    rollup: 'daily' | 'organizerDaily';
    rawRows: PaymentCaptureVolumeDailyRollupRow[] | PaymentCaptureVolumeOrganizerDailyRollupRow[];
    persistedRows:
      | PaymentCaptureVolumeDailyRollupRow[]
      | PaymentCaptureVolumeOrganizerDailyRollupRow[];
  },
): PaymentCaptureVolumeRollupMismatch[] {
  const rawRows = params.rawRows as Array<
    PaymentCaptureVolumeDailyRollupRow | PaymentCaptureVolumeOrganizerDailyRollupRow
  >;
  const persistedRows = params.persistedRows as Array<
    PaymentCaptureVolumeDailyRollupRow | PaymentCaptureVolumeOrganizerDailyRollupRow
  >;
  const keyOf = params.rollup === 'daily' ? dailyRollupKey : organizerDailyRollupKey;
  const keyMetaOf =
    params.rollup === 'daily' ? dailyRollupKeyMeta : organizerDailyRollupKeyMeta;
  const rawByKey = new Map(rawRows.map((row) => [keyOf(row as never), row]));
  const persistedByKey = new Map(persistedRows.map((row) => [keyOf(row as never), row]));
  const mismatches: PaymentCaptureVolumeRollupMismatch[] = [];

  for (const key of Array.from(new Set([...rawByKey.keys(), ...persistedByKey.keys()])).sort()) {
    const rawRow = rawByKey.get(key);
    const persistedRow = persistedByKey.get(key);

    if (!rawRow && persistedRow) {
      mismatches.push({
        driftType: 'accepted_volume',
        rollup: params.rollup,
        kind: 'unexpected_persisted_row',
        key: keyMetaOf(persistedRow as never),
        rawValue: null,
        persistedValue: persistedRow,
      });
      continue;
    }

    if (rawRow && !persistedRow) {
      mismatches.push({
        driftType: 'accepted_volume',
        rollup: params.rollup,
        kind: 'missing_persisted_row',
        key: keyMetaOf(rawRow as never),
        rawValue: rawRow,
        persistedValue: null,
      });
      continue;
    }

    if (!rawRow || !persistedRow) continue;

    const fieldChecks = [
      ['grossProcessedMinor', rawRow.grossProcessedMinor, persistedRow.grossProcessedMinor],
      ['platformFeeMinor', rawRow.platformFeeMinor, persistedRow.platformFeeMinor],
      ['organizerProceedsMinor', rawRow.organizerProceedsMinor, persistedRow.organizerProceedsMinor],
      ['captureCount', rawRow.captureCount, persistedRow.captureCount],
      ['firstOccurredAt', rawRow.firstOccurredAt.toISOString(), persistedRow.firstOccurredAt.toISOString()],
      ['lastOccurredAt', rawRow.lastOccurredAt.toISOString(), persistedRow.lastOccurredAt.toISOString()],
      [
        'sampleTraceIds',
        JSON.stringify([...rawRow.sampleTraceIds]),
        JSON.stringify([...persistedRow.sampleTraceIds]),
      ],
    ] as const;

    for (const [field, rawValue, persistedValue] of fieldChecks) {
      if (rawValue === persistedValue) continue;
      mismatches.push({
        driftType: 'accepted_volume',
        rollup: params.rollup,
        kind: 'field_mismatch',
        key: keyMetaOf(rawRow as never),
        field,
        rawValue,
        persistedValue,
      });
    }
  }

  return mismatches;
}

function compareReconciliationRollups(params: {
  rawRows: LoadedReconciliationDailyRollupRow[];
  persistedRows: LoadedReconciliationDailyRollupRow[];
}): PaymentCaptureVolumeRollupMismatch[] {
  const rawByKey = new Map(params.rawRows.map((row) => [reconciliationDailyRollupKey(row), row]));
  const persistedByKey = new Map(
    params.persistedRows.map((row) => [reconciliationDailyRollupKey(row), row]),
  );
  const mismatches: PaymentCaptureVolumeRollupMismatch[] = [];
  const rowHasExcludedEventDrift = (row: LoadedReconciliationDailyRollupRow) =>
    row.excludedEventCount > 0 ||
    row.excludedEventSamplesJson.length > 0 ||
    row.invalidExcludedEventSampleCount > 0;

  for (const key of Array.from(new Set([...rawByKey.keys(), ...persistedByKey.keys()])).sort()) {
    const rawRow = rawByKey.get(key);
    const persistedRow = persistedByKey.get(key);

    if (!rawRow && persistedRow) {
      const traceabilityMismatch = {
        driftType: 'traceability',
        rollup: 'reconciliationDaily',
        kind: 'unexpected_persisted_row',
        key: reconciliationDailyRollupKeyMeta(persistedRow),
        rawValue: null,
        persistedValue: persistedRow,
      } satisfies PaymentCaptureVolumeRollupMismatch;
      mismatches.push(traceabilityMismatch);
      if (rowHasExcludedEventDrift(persistedRow)) {
        mismatches.push({
          ...traceabilityMismatch,
          driftType: 'excluded_events',
        });
      }
      continue;
    }

    if (rawRow && !persistedRow) {
      const traceabilityMismatch = {
        driftType: 'traceability',
        rollup: 'reconciliationDaily',
        kind: 'missing_persisted_row',
        key: reconciliationDailyRollupKeyMeta(rawRow),
        rawValue: rawRow,
        persistedValue: null,
      } satisfies PaymentCaptureVolumeRollupMismatch;
      mismatches.push(traceabilityMismatch);
      if (rowHasExcludedEventDrift(rawRow)) {
        mismatches.push({
          ...traceabilityMismatch,
          driftType: 'excluded_events',
        });
      }
      continue;
    }

    if (!rawRow || !persistedRow) continue;

    const fieldChecks: Array<{
      field: string;
      driftType: PaymentCaptureVolumeRollupMismatch['driftType'];
      rawValue: unknown;
      persistedValue: unknown;
    }> = [
      {
        field: 'captureEventCount',
        driftType: 'traceability',
        rawValue: rawRow.captureEventCount,
        persistedValue: persistedRow.captureEventCount,
      },
      {
        field: 'excludedEventCount',
        driftType: 'excluded_events',
        rawValue: rawRow.excludedEventCount,
        persistedValue: persistedRow.excludedEventCount,
      },
      {
        field: 'firstOccurredAt',
        driftType: 'traceability',
        rawValue: rawRow.firstOccurredAt.toISOString(),
        persistedValue: persistedRow.firstOccurredAt.toISOString(),
      },
      {
        field: 'lastOccurredAt',
        driftType: 'traceability',
        rawValue: rawRow.lastOccurredAt.toISOString(),
        persistedValue: persistedRow.lastOccurredAt.toISOString(),
      },
      {
        field: 'sampleTraceIds',
        driftType: 'traceability',
        rawValue: JSON.stringify([...rawRow.sampleTraceIds]),
        persistedValue: JSON.stringify([...persistedRow.sampleTraceIds]),
      },
      {
        field: 'excludedEventSamplesJson',
        driftType: 'excluded_events',
        rawValue: JSON.stringify(rawRow.excludedEventSamplesJson),
        persistedValue: JSON.stringify(persistedRow.excludedEventSamplesJson),
      },
      {
        field: 'invalidExcludedEventSampleCount',
        driftType: 'excluded_events',
        rawValue: rawRow.invalidExcludedEventSampleCount,
        persistedValue: persistedRow.invalidExcludedEventSampleCount,
      },
    ];

    for (const fieldCheck of fieldChecks) {
      if (fieldCheck.rawValue === fieldCheck.persistedValue) continue;
      mismatches.push({
        driftType: fieldCheck.driftType,
        rollup: 'reconciliationDaily',
        kind: 'field_mismatch',
        key: reconciliationDailyRollupKeyMeta(rawRow),
        field: fieldCheck.field,
        rawValue: fieldCheck.rawValue,
        persistedValue: fieldCheck.persistedValue,
      });
    }
  }

  return mismatches;
}

export async function rebuildPaymentCaptureVolumeRollups(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<PaymentCaptureVolumeRebuildResult> {
  const window = normalizePaymentCaptureVolumeBucketWindow(params);

  const result = await db.transaction(
    async (tx) => {
      const projectionEvents = await loadPaymentCaptureProjectionEventsForWindow({
        dbClient: tx,
        window,
      });
      const rollups = buildPaymentCaptureVolumeRollupsFromProjectionEvents(projectionEvents);
      const replaceResult = await replacePaymentCaptureVolumeRollupsInTransaction(tx, {
        window: {
          bucketStart: window.bucketStart,
          bucketEnd: window.bucketEnd,
        },
        rollups,
      });

      return {
        requestedWindowStart: window.requestedWindowStart,
        requestedWindowEnd: window.requestedWindowEnd,
        bucketStart: window.bucketStart,
        bucketEnd: window.bucketEnd,
        rawEventCount: projectionEvents.length,
        acceptedCaptureCount: loadAcceptedCaptureCount(rollups),
        excludedEventCount: loadExcludedCaptureCount(rollups),
        rowCounts: {
          daily: rollups.daily.length,
          organizerDaily: rollups.organizerDaily.length,
          reconciliationDaily: rollups.reconciliationDaily.length,
        },
        wroteRollups: replaceResult.wroteRollups,
      } satisfies PaymentCaptureVolumeRebuildResult;
    },
    PAYMENT_CAPTURE_VOLUME_REBUILD_TRANSACTION_CONFIG,
  );

  revalidateAdminPaymentCaptureVolumeCaches();
  return result;
}

export async function reconcilePaymentCaptureVolumeRollups(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<PaymentCaptureVolumeReconciliationResult> {
  const window = normalizePaymentCaptureVolumeBucketWindow(params);

  return db.transaction(
    async (tx) => {
      const [projectionEvents, persistedDaily, persistedOrganizerDaily, persistedReconciliationDaily] =
        await Promise.all([
          loadPaymentCaptureProjectionEventsForWindow({
            dbClient: tx,
            window,
          }),
          loadPersistedDailyRollups({
            dbClient: tx,
            window,
          }),
          loadPersistedOrganizerDailyRollups({
            dbClient: tx,
            window,
          }),
          loadPersistedReconciliationDailyRollups({
            dbClient: tx,
            window,
          }),
        ]);

      const rebuilt = buildPaymentCaptureVolumeRollupsFromProjectionEvents(projectionEvents);
      const rebuiltReconciliationRows: LoadedReconciliationDailyRollupRow[] =
        rebuilt.reconciliationDaily.map((row) => ({
          ...row,
          invalidExcludedEventSampleCount: 0,
        }));
      const acceptedVolumeMismatches = [
        ...compareAcceptedVolumeRollups({
          rollup: 'daily',
          rawRows: rebuilt.daily,
          persistedRows: persistedDaily,
        }),
        ...compareAcceptedVolumeRollups({
          rollup: 'organizerDaily',
          rawRows: rebuilt.organizerDaily,
          persistedRows: persistedOrganizerDaily,
        }),
      ];
      const reconciliationMismatches = compareReconciliationRollups({
        rawRows: rebuiltReconciliationRows,
        persistedRows: persistedReconciliationDaily,
      });
      const excludedEventMismatches = reconciliationMismatches.filter(
        (mismatch) => mismatch.driftType === 'excluded_events',
      );
      const traceabilityMismatches = reconciliationMismatches.filter(
        (mismatch) => mismatch.driftType === 'traceability',
      );
      const mismatches = [
        ...acceptedVolumeMismatches,
        ...excludedEventMismatches,
        ...traceabilityMismatches,
      ];

      return {
        requestedWindowStart: window.requestedWindowStart,
        requestedWindowEnd: window.requestedWindowEnd,
        bucketStart: window.bucketStart,
        bucketEnd: window.bucketEnd,
        rawEventCount: projectionEvents.length,
        rebuiltRowCounts: {
          daily: rebuilt.daily.length,
          organizerDaily: rebuilt.organizerDaily.length,
          reconciliationDaily: rebuiltReconciliationRows.length,
        },
        persistedRowCounts: {
          daily: persistedDaily.length,
          organizerDaily: persistedOrganizerDaily.length,
          reconciliationDaily: persistedReconciliationDaily.length,
        },
        mismatches,
        acceptedVolumeMismatches,
        excludedEventMismatches,
        traceabilityMismatches,
        ok: mismatches.length === 0,
      };
    },
    PAYMENT_CAPTURE_VOLUME_RECONCILIATION_TRANSACTION_CONFIG,
  );
}
