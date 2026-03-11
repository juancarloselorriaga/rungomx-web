'server only';

import { and, gte, lte, sql, type SQL } from 'drizzle-orm';
import { AnyPgColumn } from 'drizzle-orm/pg-core';

import { db } from '@/db';
import {
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';
import type { CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import { adminPaymentsCacheTags, withWindowTag } from '@/lib/payments/economics/cache-tags';
import { safeRevalidateTag } from '@/lib/next-cache';

import {
  normalizePaymentCaptureVolumeOrganizerId,
  projectPaymentCaptureVolumeDelta,
  type PaymentCaptureVolumeDelta,
  type PaymentCaptureVolumeExcludedEvent,
  type PaymentCaptureVolumeProjectionEvent,
  ADMIN_PAYMENTS_REPORTING_TIMEZONE,
} from './payment-capture-volume';

type PaymentCaptureVolumeRollupTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentCaptureVolumeRollupDbClient = typeof db | PaymentCaptureVolumeRollupTransaction;

const ROLLUP_SAMPLE_TRACE_LIMIT = 5;

export type PaymentCaptureVolumeDailyRollupRow = {
  bucketDate: Date;
  sourceCurrency: string;
  grossProcessedMinor: number;
  platformFeeMinor: number;
  organizerProceedsMinor: number;
  captureCount: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  sampleTraceIds: string[];
};

export type PaymentCaptureVolumeOrganizerDailyRollupRow = PaymentCaptureVolumeDailyRollupRow & {
  organizerId: string;
};

export type PaymentCaptureVolumeExcludedEventSampleRecord = {
  traceId: string;
  organizerId: string | null;
  occurredAt: string;
  reason: PaymentCaptureVolumeExcludedEvent['reason'];
};

export type PaymentCaptureVolumeReconciliationDailyRollupRow = {
  bucketDate: Date;
  captureEventCount: number;
  excludedEventCount: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  sampleTraceIds: string[];
  excludedEventSamplesJson: PaymentCaptureVolumeExcludedEventSampleRecord[];
};

export type PaymentCaptureVolumeRollupSet = {
  daily: PaymentCaptureVolumeDailyRollupRow[];
  organizerDaily: PaymentCaptureVolumeOrganizerDailyRollupRow[];
  reconciliationDaily: PaymentCaptureVolumeReconciliationDailyRollupRow[];
};

export type PaymentCaptureVolumeRollupBucketWindow = {
  bucketStart: Date;
  bucketEnd: Date;
};

function bucketDateToDate(bucketDate: string): Date {
  return new Date(`${bucketDate}T00:00:00.000Z`);
}

function toReportingBucketDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ADMIN_PAYMENTS_REPORTING_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function toProjectionEvent(
  event: CanonicalMoneyEventV1,
): PaymentCaptureVolumeProjectionEvent | null {
  if (event.eventName !== 'payment.captured' || event.version !== 1) {
    return null;
  }

  return {
    traceId: event.traceId,
    organizerId: normalizePaymentCaptureVolumeOrganizerId(
      (event.payload as Record<string, unknown>).organizerId,
    ),
    eventName: 'payment.captured',
    occurredAt: new Date(event.occurredAt),
    payloadJson: event.payload as Record<string, unknown>,
  };
}

function createDailyRollupRow(delta: PaymentCaptureVolumeDelta): PaymentCaptureVolumeDailyRollupRow {
  return {
    bucketDate: bucketDateToDate(delta.bucketDate),
    sourceCurrency: delta.sourceCurrency,
    grossProcessedMinor: delta.grossProcessedMinor,
    platformFeeMinor: delta.platformFeeMinor,
    organizerProceedsMinor: delta.organizerProceedsMinor,
    captureCount: 1,
    firstOccurredAt: delta.occurredAt,
    lastOccurredAt: delta.occurredAt,
    sampleTraceIds: [delta.traceId],
  };
}

function createOrganizerDailyRollupRow(
  delta: PaymentCaptureVolumeDelta,
): PaymentCaptureVolumeOrganizerDailyRollupRow {
  return {
    organizerId: delta.organizerId as string,
    ...createDailyRollupRow(delta),
  };
}

function mergeRollupRow(target: PaymentCaptureVolumeDailyRollupRow, delta: PaymentCaptureVolumeDelta) {
  target.grossProcessedMinor += delta.grossProcessedMinor;
  target.platformFeeMinor += delta.platformFeeMinor;
  target.organizerProceedsMinor += delta.organizerProceedsMinor;
  target.captureCount += 1;
  target.firstOccurredAt =
    target.firstOccurredAt.getTime() <= delta.occurredAt.getTime()
      ? target.firstOccurredAt
      : delta.occurredAt;
  target.lastOccurredAt =
    target.lastOccurredAt.getTime() >= delta.occurredAt.getTime()
      ? target.lastOccurredAt
      : delta.occurredAt;
  target.sampleTraceIds = Array.from(new Set([...target.sampleTraceIds, delta.traceId]))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, ROLLUP_SAMPLE_TRACE_LIMIT);
}

function serializeExcludedEventSample(
  event: PaymentCaptureVolumeExcludedEvent,
): PaymentCaptureVolumeExcludedEventSampleRecord {
  return {
    traceId: event.traceId,
    organizerId: event.organizerId,
    occurredAt: event.occurredAt.toISOString(),
    reason: event.reason,
  };
}

function createReconciliationDailyRollupRow(params: {
  bucketDate: string;
  traceId: string;
  occurredAt: Date;
  excludedEvent?: PaymentCaptureVolumeExcludedEvent;
}): PaymentCaptureVolumeReconciliationDailyRollupRow {
  return {
    bucketDate: bucketDateToDate(params.bucketDate),
    captureEventCount: 1,
    excludedEventCount: params.excludedEvent ? 1 : 0,
    firstOccurredAt: params.occurredAt,
    lastOccurredAt: params.occurredAt,
    sampleTraceIds: [params.traceId],
    excludedEventSamplesJson: params.excludedEvent
      ? [serializeExcludedEventSample(params.excludedEvent)]
      : [],
  };
}

function mergeExcludedEventSamples(
  existing: PaymentCaptureVolumeExcludedEventSampleRecord[],
  incoming: PaymentCaptureVolumeExcludedEventSampleRecord[],
): PaymentCaptureVolumeExcludedEventSampleRecord[] {
  return Array.from(
    new Map(
      [...existing, ...incoming].map((sample) => [
        `${sample.traceId}:${sample.reason}:${sample.occurredAt}`,
        sample,
      ]),
    ).values(),
  )
    .sort((left, right) => {
      const occurredAtDiff = left.occurredAt.localeCompare(right.occurredAt);
      if (occurredAtDiff !== 0) return occurredAtDiff;
      return left.traceId.localeCompare(right.traceId);
    })
    .slice(0, ROLLUP_SAMPLE_TRACE_LIMIT);
}

function mergeReconciliationDailyRollupRow(
  target: PaymentCaptureVolumeReconciliationDailyRollupRow,
  params: {
    traceId: string;
    occurredAt: Date;
    excludedEvent?: PaymentCaptureVolumeExcludedEvent;
  },
) {
  target.captureEventCount += 1;
  target.firstOccurredAt =
    target.firstOccurredAt.getTime() <= params.occurredAt.getTime()
      ? target.firstOccurredAt
      : params.occurredAt;
  target.lastOccurredAt =
    target.lastOccurredAt.getTime() >= params.occurredAt.getTime()
      ? target.lastOccurredAt
      : params.occurredAt;
  target.sampleTraceIds = Array.from(new Set([...target.sampleTraceIds, params.traceId]))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, ROLLUP_SAMPLE_TRACE_LIMIT);
  if (params.excludedEvent) {
    target.excludedEventCount += 1;
    target.excludedEventSamplesJson = mergeExcludedEventSamples(target.excludedEventSamplesJson, [
      serializeExcludedEventSample(params.excludedEvent),
    ]);
  }
}

function sqlTextArray(values: string[]): SQL {
  if (values.length === 0) {
    return sql`ARRAY[]::text[]`;
  }

  return sql`ARRAY[${sql.join(values.map((value) => sql`${value}`), sql`, `)}]::text[]`;
}

function sqlJsonbValue(value: unknown): SQL {
  return sql`${JSON.stringify(value)}::jsonb`;
}

function mergeSampleTraceIdsSql(existingColumn: AnyPgColumn, incomingValues: string[]): SQL {
  return sql`ARRAY(
    SELECT trace_id
    FROM (
      SELECT DISTINCT unnest(array_cat(${existingColumn}, ${sqlTextArray(incomingValues)})) AS trace_id
    ) AS merged_trace_ids
    ORDER BY trace_id
    LIMIT ${ROLLUP_SAMPLE_TRACE_LIMIT}
  )`;
}

function mergeExcludedEventSamplesSql(
  existingColumn: AnyPgColumn,
  incomingValues: PaymentCaptureVolumeExcludedEventSampleRecord[],
): SQL {
  return sql`(
    SELECT COALESCE(jsonb_agg(sample ORDER BY occurred_at, trace_id), '[]'::jsonb)
    FROM (
      SELECT DISTINCT
        sample,
        sample->>'occurredAt' AS occurred_at,
        sample->>'traceId' AS trace_id
      FROM jsonb_array_elements(
        COALESCE(${existingColumn}, '[]'::jsonb) || ${sqlJsonbValue(incomingValues)}
      ) AS merged(sample)
      ORDER BY occurred_at, trace_id
      LIMIT ${ROLLUP_SAMPLE_TRACE_LIMIT}
    ) AS merged_samples
  )`;
}

export function buildPaymentCaptureVolumeRollupsFromProjectionEvents(
  events: PaymentCaptureVolumeProjectionEvent[],
): PaymentCaptureVolumeRollupSet {
  const daily = new Map<string, PaymentCaptureVolumeDailyRollupRow>();
  const organizerDaily = new Map<string, PaymentCaptureVolumeOrganizerDailyRollupRow>();
  const reconciliationDaily = new Map<string, PaymentCaptureVolumeReconciliationDailyRollupRow>();

  for (const projectionEvent of events) {
    const reconciliationBucketDate = toReportingBucketDate(projectionEvent.occurredAt);
    const projectionAttempt = projectPaymentCaptureVolumeDelta(projectionEvent);
    const existingReconciliation = reconciliationDaily.get(reconciliationBucketDate);
    if (!projectionAttempt.ok) {
      if (existingReconciliation) {
        mergeReconciliationDailyRollupRow(existingReconciliation, {
          traceId: projectionEvent.traceId,
          occurredAt: projectionEvent.occurredAt,
          excludedEvent: projectionAttempt.excluded,
        });
      } else {
        reconciliationDaily.set(
          reconciliationBucketDate,
          createReconciliationDailyRollupRow({
            bucketDate: reconciliationBucketDate,
            traceId: projectionEvent.traceId,
            occurredAt: projectionEvent.occurredAt,
            excludedEvent: projectionAttempt.excluded,
          }),
        );
      }
      continue;
    }

    const { delta } = projectionAttempt;
    if (existingReconciliation) {
      mergeReconciliationDailyRollupRow(existingReconciliation, {
        traceId: delta.traceId,
        occurredAt: delta.occurredAt,
      });
    } else {
      reconciliationDaily.set(
        reconciliationBucketDate,
        createReconciliationDailyRollupRow({
          bucketDate: reconciliationBucketDate,
          traceId: delta.traceId,
          occurredAt: delta.occurredAt,
        }),
      );
    }
    if (!delta.organizerId) continue;

    const dailyKey = `${delta.bucketDate}:${delta.sourceCurrency}`;
    const organizerKey = `${delta.bucketDate}:${delta.organizerId}:${delta.sourceCurrency}`;

    const existingDaily = daily.get(dailyKey);
    if (existingDaily) {
      mergeRollupRow(existingDaily, delta);
    } else {
      daily.set(dailyKey, createDailyRollupRow(delta));
    }

    const existingOrganizerDaily = organizerDaily.get(organizerKey);
    if (existingOrganizerDaily) {
      mergeRollupRow(existingOrganizerDaily, delta);
    } else {
      organizerDaily.set(organizerKey, createOrganizerDailyRollupRow(delta));
    }
  }

  return {
    daily: Array.from(daily.values()),
    organizerDaily: Array.from(organizerDaily.values()),
    reconciliationDaily: Array.from(reconciliationDaily.values()),
  };
}

export function buildPaymentCaptureVolumeRollupsFromCanonicalEvents(
  events: CanonicalMoneyEventV1[],
): PaymentCaptureVolumeRollupSet {
  return buildPaymentCaptureVolumeRollupsFromProjectionEvents(
    events.flatMap((event) => {
      const projectionEvent = toProjectionEvent(event);
      return projectionEvent ? [projectionEvent] : [];
    }),
  );
}

async function upsertDailyRollups(
  tx: PaymentCaptureVolumeRollupDbClient,
  rows: PaymentCaptureVolumeDailyRollupRow[],
) {
  for (const row of rows) {
    await tx
      .insert(paymentCaptureVolumeDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [paymentCaptureVolumeDaily.bucketDate, paymentCaptureVolumeDaily.sourceCurrency],
        set: {
          grossProcessedMinor: sql`${paymentCaptureVolumeDaily.grossProcessedMinor} + ${row.grossProcessedMinor}`,
          platformFeeMinor: sql`${paymentCaptureVolumeDaily.platformFeeMinor} + ${row.platformFeeMinor}`,
          organizerProceedsMinor: sql`${paymentCaptureVolumeDaily.organizerProceedsMinor} + ${row.organizerProceedsMinor}`,
          captureCount: sql`${paymentCaptureVolumeDaily.captureCount} + ${row.captureCount}`,
          firstOccurredAt: sql`least(${paymentCaptureVolumeDaily.firstOccurredAt}, ${row.firstOccurredAt})`,
          lastOccurredAt: sql`greatest(${paymentCaptureVolumeDaily.lastOccurredAt}, ${row.lastOccurredAt})`,
          sampleTraceIds: mergeSampleTraceIdsSql(
            paymentCaptureVolumeDaily.sampleTraceIds,
            row.sampleTraceIds,
          ),
          updatedAt: new Date(),
        },
      });
  }
}

async function upsertOrganizerDailyRollups(
  tx: PaymentCaptureVolumeRollupDbClient,
  rows: PaymentCaptureVolumeOrganizerDailyRollupRow[],
) {
  for (const row of rows) {
    await tx
      .insert(paymentCaptureVolumeOrganizerDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [
          paymentCaptureVolumeOrganizerDaily.bucketDate,
          paymentCaptureVolumeOrganizerDaily.organizerId,
          paymentCaptureVolumeOrganizerDaily.sourceCurrency,
        ],
        set: {
          grossProcessedMinor: sql`${paymentCaptureVolumeOrganizerDaily.grossProcessedMinor} + ${row.grossProcessedMinor}`,
          platformFeeMinor: sql`${paymentCaptureVolumeOrganizerDaily.platformFeeMinor} + ${row.platformFeeMinor}`,
          organizerProceedsMinor: sql`${paymentCaptureVolumeOrganizerDaily.organizerProceedsMinor} + ${row.organizerProceedsMinor}`,
          captureCount: sql`${paymentCaptureVolumeOrganizerDaily.captureCount} + ${row.captureCount}`,
          firstOccurredAt: sql`least(${paymentCaptureVolumeOrganizerDaily.firstOccurredAt}, ${row.firstOccurredAt})`,
          lastOccurredAt: sql`greatest(${paymentCaptureVolumeOrganizerDaily.lastOccurredAt}, ${row.lastOccurredAt})`,
          sampleTraceIds: mergeSampleTraceIdsSql(
            paymentCaptureVolumeOrganizerDaily.sampleTraceIds,
            row.sampleTraceIds,
          ),
          updatedAt: new Date(),
        },
      });
  }
}

async function upsertReconciliationDailyRollups(
  tx: PaymentCaptureVolumeRollupDbClient,
  rows: PaymentCaptureVolumeReconciliationDailyRollupRow[],
) {
  for (const row of rows) {
    await tx
      .insert(paymentCaptureVolumeReconciliationDaily)
      .values(row)
      .onConflictDoUpdate({
        target: [paymentCaptureVolumeReconciliationDaily.bucketDate],
        set: {
          captureEventCount: sql`${paymentCaptureVolumeReconciliationDaily.captureEventCount} + ${row.captureEventCount}`,
          excludedEventCount: sql`${paymentCaptureVolumeReconciliationDaily.excludedEventCount} + ${row.excludedEventCount}`,
          firstOccurredAt: sql`least(${paymentCaptureVolumeReconciliationDaily.firstOccurredAt}, ${row.firstOccurredAt})`,
          lastOccurredAt: sql`greatest(${paymentCaptureVolumeReconciliationDaily.lastOccurredAt}, ${row.lastOccurredAt})`,
          sampleTraceIds: mergeSampleTraceIdsSql(
            paymentCaptureVolumeReconciliationDaily.sampleTraceIds,
            row.sampleTraceIds,
          ),
          excludedEventSamplesJson: mergeExcludedEventSamplesSql(
            paymentCaptureVolumeReconciliationDaily.excludedEventSamplesJson,
            row.excludedEventSamplesJson,
          ),
          updatedAt: new Date(),
        },
      });
  }
}

async function insertDailyRollupsExactly(
  tx: PaymentCaptureVolumeRollupDbClient,
  rows: PaymentCaptureVolumeDailyRollupRow[],
) {
  if (rows.length === 0) {
    return;
  }

  await tx.insert(paymentCaptureVolumeDaily).values(rows);
}

async function insertOrganizerDailyRollupsExactly(
  tx: PaymentCaptureVolumeRollupDbClient,
  rows: PaymentCaptureVolumeOrganizerDailyRollupRow[],
) {
  if (rows.length === 0) {
    return;
  }

  await tx.insert(paymentCaptureVolumeOrganizerDaily).values(rows);
}

async function insertReconciliationDailyRollupsExactly(
  tx: PaymentCaptureVolumeRollupDbClient,
  rows: PaymentCaptureVolumeReconciliationDailyRollupRow[],
) {
  if (rows.length === 0) {
    return;
  }

  await tx.insert(paymentCaptureVolumeReconciliationDaily).values(rows);
}

export async function upsertPaymentCaptureVolumeRollupsInTransaction(
  tx: PaymentCaptureVolumeRollupDbClient,
  events: CanonicalMoneyEventV1[],
) {
  const rollups = buildPaymentCaptureVolumeRollupsFromCanonicalEvents(events);
  if (
    rollups.daily.length === 0 &&
    rollups.organizerDaily.length === 0 &&
    rollups.reconciliationDaily.length === 0
  ) {
    return { wroteRollups: false };
  }

  if (rollups.daily.length > 0) {
    await upsertDailyRollups(tx, rollups.daily);
  }
  if (rollups.organizerDaily.length > 0) {
    await upsertOrganizerDailyRollups(tx, rollups.organizerDaily);
  }
  if (rollups.reconciliationDaily.length > 0) {
    await upsertReconciliationDailyRollups(tx, rollups.reconciliationDaily);
  }

  return {
    wroteRollups:
      rollups.daily.length > 0 ||
      rollups.organizerDaily.length > 0 ||
      rollups.reconciliationDaily.length > 0,
  };
}

export async function replacePaymentCaptureVolumeRollupsInTransaction(
  tx: PaymentCaptureVolumeRollupDbClient,
  params: {
    window: PaymentCaptureVolumeRollupBucketWindow;
    rollups: PaymentCaptureVolumeRollupSet;
  },
) {
  const { bucketStart, bucketEnd } = params.window;

  await tx
    .delete(paymentCaptureVolumeDaily)
    .where(
      and(
        gte(paymentCaptureVolumeDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeDaily.bucketDate, bucketEnd),
      ),
    );
  await tx
    .delete(paymentCaptureVolumeOrganizerDaily)
    .where(
      and(
        gte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketEnd),
      ),
    );
  await tx
    .delete(paymentCaptureVolumeReconciliationDaily)
    .where(
      and(
        gte(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketEnd),
      ),
    );

  await insertDailyRollupsExactly(tx, params.rollups.daily);
  await insertOrganizerDailyRollupsExactly(tx, params.rollups.organizerDaily);
  await insertReconciliationDailyRollupsExactly(tx, params.rollups.reconciliationDaily);

  return {
    // Rebuilds always execute a delete-and-replace cycle for the selected window.
    // Report that as a write even when the rebuilt rollup set is empty.
    wroteRollups: true,
  };
}

export function revalidateAdminPaymentCaptureVolumeCaches(
  windowDays?: readonly number[],
) {
  const tags = [
    adminPaymentsCacheTags.paymentCaptureVolume,
    adminPaymentsCacheTags.paymentCaptureVolumeOrganizers,
  ] as const;

  for (const tag of tags) {
    safeRevalidateTag(tag, { expire: 0 });

    for (const days of windowDays ?? []) {
      safeRevalidateTag(withWindowTag(tag, days), { expire: 0 });
    }
  }
}
