'server only';

import { subDays } from 'date-fns';
import { and, desc, gte, inArray, lte, sql } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { db } from '@/db';
import {
  organizations,
  paymentCaptureVolumeDaily,
  paymentCaptureVolumeOrganizerDaily,
  paymentCaptureVolumeReconciliationDaily,
} from '@/db/schema';
import { adminPaymentsCacheTags, withWindowTag } from '@/lib/payments/economics/cache-tags';

export const paymentCaptureVolumeRelevantEventNames = ['payment.captured'] as const;

type PaymentCaptureVolumeRelevantEventName = (typeof paymentCaptureVolumeRelevantEventNames)[number];

const UNSCOPED_ORGANIZER_ID = '__unscoped__';
const DEFAULT_ORGANIZER_LIMIT = 10;
const DEFAULT_ORGANIZER_PAGE_SIZE = 5;
export const MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE = 25;
const DEFAULT_SAMPLE_TRACE_LIMIT = 5;
export const ADMIN_PAYMENTS_REPORTING_TIMEZONE = 'UTC';

type CanonicalMoneyAmount = {
  amountMinor: number;
  currency: string;
};

export type PaymentCaptureVolumeProjectionEvent = {
  traceId: string;
  organizerId: string | null;
  eventName: PaymentCaptureVolumeRelevantEventName;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

export const paymentCaptureVolumeExcludedReasons = [
  'missing_organizer_id',
  'missing_gross_amount',
  'missing_fee_amount',
  'missing_net_amount',
  'currency_mismatch',
  'math_mismatch',
  'negative_amount',
] as const;

export type PaymentCaptureVolumeExcludedReason =
  (typeof paymentCaptureVolumeExcludedReasons)[number];

export type PaymentCaptureVolumeExcludedEvent = {
  traceId: string;
  organizerId: string | null;
  occurredAt: Date;
  reason: PaymentCaptureVolumeExcludedReason;
};

export type PaymentCaptureVolumeDelta = {
  traceId: string;
  organizerId: string | null;
  occurredAt: Date;
  bucketDate: string;
  sourceCurrency: string;
  grossProcessedMinor: number;
  platformFeeMinor: number;
  organizerProceedsMinor: number;
};

export type PaymentCaptureVolumeCurrencyRow = {
  sourceCurrency: string;
  grossProcessedMinor: number;
  platformFeeMinor: number;
  organizerProceedsMinor: number;
  captureCount: number;
};

export type PaymentCaptureVolumeOrganizerRow = {
  organizerId: string | null;
  organizerLabel: string;
  headlineCurrency: string;
  headlineGrossProcessedMinor: number;
  headlinePlatformFeeMinor: number;
  headlineOrganizerProceedsMinor: number;
  captureCount: number;
  currencies: PaymentCaptureVolumeCurrencyRow[];
  traceability: {
    distinctTraceCount: number;
    firstOccurredAt: Date | null;
    lastOccurredAt: Date | null;
    sampleTraceIds: string[];
  };
};

export type PaymentCaptureVolumeOrganizerPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type PaymentCaptureVolumeTraceability = {
  windowStart: Date;
  windowEnd: Date;
  eventCount: number;
  distinctTraceCount: number;
  firstOccurredAt: Date | null;
  lastOccurredAt: Date | null;
  sampleTraceIds: string[];
  excludedEventCount: number;
};

export type PaymentCaptureVolumeMetrics = {
  asOf: Date;
  windowStart: Date;
  windowEnd: Date;
  headlineCurrency: string;
  headlineGrossProcessedMinor: number;
  headlinePlatformFeeMinor: number;
  headlineOrganizerProceedsMinor: number;
  headlineCaptureCount: number;
  currencies: PaymentCaptureVolumeCurrencyRow[];
  organizers: PaymentCaptureVolumeOrganizerRow[];
  organizerPagination: PaymentCaptureVolumeOrganizerPagination;
  excludedEvents: PaymentCaptureVolumeExcludedEvent[];
  traceability: PaymentCaptureVolumeTraceability;
};

type ProjectionAttempt =
  | { ok: true; delta: PaymentCaptureVolumeDelta }
  | { ok: false; excluded: PaymentCaptureVolumeExcludedEvent };

type OrganizerAccumulator = {
  organizerId: string | null;
  organizerLabel: string;
  captureCount: number;
  currencies: Map<string, PaymentCaptureVolumeCurrencyRow>;
  traceIds: Set<string>;
  firstOccurredAt: Date | null;
  lastOccurredAt: Date | null;
};

function normalizeCurrency(rawCurrency: unknown): string | null {
  if (typeof rawCurrency !== 'string') return null;
  const value = rawCurrency.trim().toUpperCase();
  if (value.length !== 3) return null;
  return value;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizePaymentCaptureVolumeOrganizerId(value: unknown): string | null {
  return readString(value);
}

export function isPaymentCaptureVolumeExcludedReason(
  value: unknown,
): value is PaymentCaptureVolumeExcludedReason {
  return (
    typeof value === 'string' &&
    paymentCaptureVolumeExcludedReasons.includes(value as PaymentCaptureVolumeExcludedReason)
  );
}

function readCanonicalMoneyAmount(
  payload: Record<string, unknown>,
  key: string,
): CanonicalMoneyAmount | null {
  const value = payload[key];
  if (!value || typeof value !== 'object') {
    return null;
  }

  const amountMinor = (value as Record<string, unknown>).amountMinor;
  const currency = normalizeCurrency((value as Record<string, unknown>).currency);
  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor) || !currency) {
    return null;
  }

  return {
    amountMinor: Math.trunc(amountMinor),
    currency,
  };
}

function organizerKey(organizerId: string | null): string {
  return organizerId ?? UNSCOPED_ORGANIZER_ID;
}

function resolveOrganizerLabel(
  organizerId: string | null,
  organizerLabels: Record<string, string>,
): string {
  if (!organizerId) {
    return 'Unscoped organizer';
  }
  return organizerLabels[organizerId] ?? organizerId;
}

export function toReportingBucketDate(
  value: Date,
  timeZone: string = ADMIN_PAYMENTS_REPORTING_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return `${year}-${month}-${day}`;
}

function readOrganizerId(event: PaymentCaptureVolumeProjectionEvent): string | null {
  return (
    normalizePaymentCaptureVolumeOrganizerId(event.organizerId) ??
    normalizePaymentCaptureVolumeOrganizerId(event.payloadJson.organizerId)
  );
}

function sortEventsForProjection(
  events: PaymentCaptureVolumeProjectionEvent[],
): PaymentCaptureVolumeProjectionEvent[] {
  return [...events].sort((left, right) => {
    const occurredAtDiff = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurredAtDiff !== 0) return occurredAtDiff;

    const traceDiff = left.traceId.localeCompare(right.traceId);
    if (traceDiff !== 0) return traceDiff;

    return left.eventName.localeCompare(right.eventName);
  });
}

function selectHeadlineCurrencyRow(
  rows: PaymentCaptureVolumeCurrencyRow[],
): PaymentCaptureVolumeCurrencyRow | null {
  if (rows.length === 0) return null;
  const mxnRow = rows.find((row) => row.sourceCurrency === 'MXN');
  if (mxnRow) return mxnRow;

  return [...rows].sort((left, right) => {
    const grossDiff = right.grossProcessedMinor - left.grossProcessedMinor;
    if (grossDiff !== 0) return grossDiff;
    return left.sourceCurrency.localeCompare(right.sourceCurrency);
  })[0] ?? null;
}

function getOrCreateCurrencyRow(
  rows: Map<string, PaymentCaptureVolumeCurrencyRow>,
  sourceCurrency: string,
): PaymentCaptureVolumeCurrencyRow {
  const existing = rows.get(sourceCurrency);
  if (existing) return existing;

  const created: PaymentCaptureVolumeCurrencyRow = {
    sourceCurrency,
    grossProcessedMinor: 0,
    platformFeeMinor: 0,
    organizerProceedsMinor: 0,
    captureCount: 0,
  };
  rows.set(sourceCurrency, created);
  return created;
}

function getOrCreateOrganizerAccumulator(params: {
  organizers: Map<string, OrganizerAccumulator>;
  organizerId: string | null;
  organizerLabels: Record<string, string>;
}): OrganizerAccumulator {
  const key = organizerKey(params.organizerId);
  const existing = params.organizers.get(key);
  if (existing) return existing;

  const created: OrganizerAccumulator = {
    organizerId: params.organizerId,
    organizerLabel: resolveOrganizerLabel(params.organizerId, params.organizerLabels),
    captureCount: 0,
    currencies: new Map<string, PaymentCaptureVolumeCurrencyRow>(),
    traceIds: new Set<string>(),
    firstOccurredAt: null,
    lastOccurredAt: null,
  };
  params.organizers.set(key, created);
  return created;
}

export function projectPaymentCaptureVolumeDelta(
  event: PaymentCaptureVolumeProjectionEvent,
): ProjectionAttempt {
  const organizerId = readOrganizerId(event);
  if (!organizerId) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId: null,
        occurredAt: event.occurredAt,
        reason: 'missing_organizer_id',
      },
    };
  }

  const grossAmount = readCanonicalMoneyAmount(event.payloadJson, 'grossAmount');
  if (!grossAmount) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId,
        occurredAt: event.occurredAt,
        reason: 'missing_gross_amount',
      },
    };
  }

  const feeAmount = readCanonicalMoneyAmount(event.payloadJson, 'feeAmount');
  if (!feeAmount) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId,
        occurredAt: event.occurredAt,
        reason: 'missing_fee_amount',
      },
    };
  }

  const netAmount = readCanonicalMoneyAmount(event.payloadJson, 'netAmount');
  if (!netAmount) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId,
        occurredAt: event.occurredAt,
        reason: 'missing_net_amount',
      },
    };
  }

  if (
    grossAmount.currency !== feeAmount.currency ||
    grossAmount.currency !== netAmount.currency
  ) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId,
        occurredAt: event.occurredAt,
        reason: 'currency_mismatch',
      },
    };
  }

  if (
    grossAmount.amountMinor < 0 ||
    feeAmount.amountMinor < 0 ||
    netAmount.amountMinor < 0
  ) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId,
        occurredAt: event.occurredAt,
        reason: 'negative_amount',
      },
    };
  }

  if (grossAmount.amountMinor !== feeAmount.amountMinor + netAmount.amountMinor) {
    return {
      ok: false,
      excluded: {
        traceId: event.traceId,
        organizerId,
        occurredAt: event.occurredAt,
        reason: 'math_mismatch',
      },
    };
  }

  return {
    ok: true,
    delta: {
      traceId: event.traceId,
      organizerId,
      occurredAt: event.occurredAt,
      bucketDate: toReportingBucketDate(event.occurredAt),
      sourceCurrency: grossAmount.currency,
      grossProcessedMinor: grossAmount.amountMinor,
      platformFeeMinor: feeAmount.amountMinor,
      organizerProceedsMinor: netAmount.amountMinor,
    },
  };
}

export function projectPaymentCaptureVolumeMetrics(params: {
  events: PaymentCaptureVolumeProjectionEvent[];
  windowStart: Date;
  windowEnd: Date;
  organizerLabels?: Record<string, string>;
  organizerLimit?: number;
  sampleTraceLimit?: number;
  asOf?: Date;
}): PaymentCaptureVolumeMetrics {
  const orderedEvents = sortEventsForProjection(params.events);
  const organizerLabels = params.organizerLabels ?? {};
  const globalCurrencies = new Map<string, PaymentCaptureVolumeCurrencyRow>();
  const organizers = new Map<string, OrganizerAccumulator>();
  const traceIds = new Set<string>();
  const excludedEvents: PaymentCaptureVolumeExcludedEvent[] = [];

  for (const event of orderedEvents) {
    traceIds.add(event.traceId);

    const projectionAttempt = projectPaymentCaptureVolumeDelta(event);
    if (!projectionAttempt.ok) {
      excludedEvents.push(projectionAttempt.excluded);
      continue;
    }

    const { delta } = projectionAttempt;
    const globalRow = getOrCreateCurrencyRow(globalCurrencies, delta.sourceCurrency);
    globalRow.grossProcessedMinor += delta.grossProcessedMinor;
    globalRow.platformFeeMinor += delta.platformFeeMinor;
    globalRow.organizerProceedsMinor += delta.organizerProceedsMinor;
    globalRow.captureCount += 1;

    const organizerAccumulator = getOrCreateOrganizerAccumulator({
      organizers,
      organizerId: delta.organizerId,
      organizerLabels,
    });
    organizerAccumulator.captureCount += 1;
    organizerAccumulator.traceIds.add(delta.traceId);
    organizerAccumulator.firstOccurredAt =
      organizerAccumulator.firstOccurredAt &&
      organizerAccumulator.firstOccurredAt.getTime() <= delta.occurredAt.getTime()
        ? organizerAccumulator.firstOccurredAt
        : delta.occurredAt;
    organizerAccumulator.lastOccurredAt =
      organizerAccumulator.lastOccurredAt &&
      organizerAccumulator.lastOccurredAt.getTime() >= delta.occurredAt.getTime()
        ? organizerAccumulator.lastOccurredAt
        : delta.occurredAt;

    const organizerRow = getOrCreateCurrencyRow(
      organizerAccumulator.currencies,
      delta.sourceCurrency,
    );
    organizerRow.grossProcessedMinor += delta.grossProcessedMinor;
    organizerRow.platformFeeMinor += delta.platformFeeMinor;
    organizerRow.organizerProceedsMinor += delta.organizerProceedsMinor;
    organizerRow.captureCount += 1;
  }

  const currencies = Array.from(globalCurrencies.values()).sort((left, right) =>
    left.sourceCurrency.localeCompare(right.sourceCurrency),
  );
  const headlineRow = selectHeadlineCurrencyRow(currencies);
  const organizerLimit =
    typeof params.organizerLimit === 'number' && params.organizerLimit > 0
      ? Math.trunc(params.organizerLimit)
      : DEFAULT_ORGANIZER_LIMIT;
  const sampleTraceLimit =
    typeof params.sampleTraceLimit === 'number' && params.sampleTraceLimit > 0
      ? Math.trunc(params.sampleTraceLimit)
      : DEFAULT_SAMPLE_TRACE_LIMIT;

  const organizerRows = Array.from(organizers.values())
    .map((organizerAccumulator) => {
      const organizerCurrencies = Array.from(organizerAccumulator.currencies.values()).sort(
        (left, right) => left.sourceCurrency.localeCompare(right.sourceCurrency),
      );
      const organizerHeadline = selectHeadlineCurrencyRow(organizerCurrencies);
      const sampleTraceIds = Array.from(organizerAccumulator.traceIds)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, sampleTraceLimit);

      return {
        organizerId: organizerAccumulator.organizerId,
        organizerLabel: organizerAccumulator.organizerLabel,
        headlineCurrency: organizerHeadline?.sourceCurrency ?? 'MXN',
        headlineGrossProcessedMinor: organizerHeadline?.grossProcessedMinor ?? 0,
        headlinePlatformFeeMinor: organizerHeadline?.platformFeeMinor ?? 0,
        headlineOrganizerProceedsMinor: organizerHeadline?.organizerProceedsMinor ?? 0,
        captureCount: organizerAccumulator.captureCount,
        currencies: organizerCurrencies,
        traceability: {
          distinctTraceCount: organizerAccumulator.traceIds.size,
          firstOccurredAt: organizerAccumulator.firstOccurredAt,
          lastOccurredAt: organizerAccumulator.lastOccurredAt,
          sampleTraceIds,
        },
      } satisfies PaymentCaptureVolumeOrganizerRow;
    })
    .sort((left, right) => {
      const countDiff = right.captureCount - left.captureCount;
      if (countDiff !== 0) return countDiff;

      return left.organizerLabel.localeCompare(right.organizerLabel);
    })
    .slice(0, organizerLimit);

  const sampleTraceIds = Array.from(traceIds)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, sampleTraceLimit);

  return {
    asOf: params.asOf ?? params.windowEnd,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    headlineCurrency: headlineRow?.sourceCurrency ?? 'MXN',
    headlineGrossProcessedMinor: headlineRow?.grossProcessedMinor ?? 0,
    headlinePlatformFeeMinor: headlineRow?.platformFeeMinor ?? 0,
    headlineOrganizerProceedsMinor: headlineRow?.organizerProceedsMinor ?? 0,
    headlineCaptureCount: currencies.reduce((total, row) => total + row.captureCount, 0),
    currencies,
    organizers: organizerRows,
    organizerPagination: {
      page: 1,
      pageSize: organizerLimit,
      total: organizers.size,
      pageCount: organizers.size === 0 ? 0 : Math.ceil(organizers.size / organizerLimit),
    },
    excludedEvents,
    traceability: {
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      eventCount: orderedEvents.length,
      distinctTraceCount: traceIds.size,
      firstOccurredAt: orderedEvents[0]?.occurredAt ?? null,
      lastOccurredAt: orderedEvents[orderedEvents.length - 1]?.occurredAt ?? null,
      sampleTraceIds,
      excludedEventCount: excludedEvents.length,
    },
  };
}

type PaymentCaptureVolumeDailyRollupRecord = {
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

type PaymentCaptureVolumeOrganizerDailyRollupRecord = PaymentCaptureVolumeDailyRollupRecord & {
  organizerId: string;
};

type PaymentCaptureVolumeOrganizerSummaryRecord = {
  organizerId: string;
  grossProcessedMinor: number;
  platformFeeMinor: number;
  organizerProceedsMinor: number;
  captureCount: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
};

type PaymentCaptureVolumeExcludedEventSampleRecord = {
  traceId: string;
  organizerId: string | null;
  occurredAt: string;
  reason: PaymentCaptureVolumeExcludedReason;
};

type PaymentCaptureVolumeReconciliationDailyRollupRecord = {
  bucketDate: Date;
  captureEventCount: number;
  excludedEventCount: number;
  firstOccurredAt: Date;
  lastOccurredAt: Date;
  sampleTraceIds: string[];
  excludedEventSamplesJson: PaymentCaptureVolumeExcludedEventSampleRecord[];
};

function mergeTraceIdSamples(sampleTraceIds: string[][], sampleTraceLimit: number): string[] {
  return Array.from(new Set(sampleTraceIds.flat()))
    .sort((left, right) => left.localeCompare(right))
    .slice(0, sampleTraceLimit);
}

function normalizeExcludedEventSampleRecords(
  value: unknown,
): PaymentCaptureVolumeExcludedEventSampleRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((sample) => {
    if (!sample || typeof sample !== 'object') {
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
      typeof reason !== 'string'
    ) {
      return [];
    }

    return [
      {
        traceId,
        organizerId,
        occurredAt,
        reason: reason as PaymentCaptureVolumeExcludedReason,
      },
    ];
  });
}

function collectExcludedEventsFromReconciliationRollups(
  reconciliationRollups: PaymentCaptureVolumeReconciliationDailyRollupRecord[],
): PaymentCaptureVolumeExcludedEvent[] {
  const records: Array<[string, PaymentCaptureVolumeExcludedEvent]> = reconciliationRollups
    .flatMap((row) =>
      row.excludedEventSamplesJson.map(
        (sample): [string, PaymentCaptureVolumeExcludedEvent] => [
          `${sample.traceId}:${sample.reason}:${sample.occurredAt}`,
          {
            traceId: sample.traceId,
            organizerId: sample.organizerId,
            occurredAt: new Date(sample.occurredAt),
            reason: sample.reason,
          },
        ],
      ),
    )
    .sort((left, right) => {
      const occurredAtDiff = left[1].occurredAt.getTime() - right[1].occurredAt.getTime();
      if (occurredAtDiff !== 0) return occurredAtDiff;
      return left[1].traceId.localeCompare(right[1].traceId);
    });

  return Array.from(new Map(records).values());
}

function aggregateMetricsFromRollups(params: {
  dailyRollups: PaymentCaptureVolumeDailyRollupRecord[];
  organizerRollups: PaymentCaptureVolumeOrganizerDailyRollupRecord[];
  reconciliationRollups: PaymentCaptureVolumeReconciliationDailyRollupRecord[];
  excludedEvents: PaymentCaptureVolumeExcludedEvent[];
  organizerLabels: Record<string, string>;
  organizerLimit: number;
  sampleTraceLimit: number;
  windowStart: Date;
  windowEnd: Date;
  asOf: Date;
}): PaymentCaptureVolumeMetrics {
  const currenciesByCode = new Map<string, PaymentCaptureVolumeCurrencyRow>();
  const organizers = new Map<string, OrganizerAccumulator>();
  let headlineCaptureCount = 0;

  for (const row of params.dailyRollups) {
    const currencyRow = getOrCreateCurrencyRow(currenciesByCode, row.sourceCurrency);
    currencyRow.grossProcessedMinor += row.grossProcessedMinor;
    currencyRow.platformFeeMinor += row.platformFeeMinor;
    currencyRow.organizerProceedsMinor += row.organizerProceedsMinor;
    currencyRow.captureCount += row.captureCount;
    headlineCaptureCount += row.captureCount;
  }

  for (const row of params.organizerRollups) {
    const organizerAccumulator = getOrCreateOrganizerAccumulator({
      organizers,
      organizerId: row.organizerId,
      organizerLabels: params.organizerLabels,
    });

    organizerAccumulator.captureCount += row.captureCount;
    organizerAccumulator.firstOccurredAt =
      organizerAccumulator.firstOccurredAt &&
      organizerAccumulator.firstOccurredAt.getTime() <= row.firstOccurredAt.getTime()
        ? organizerAccumulator.firstOccurredAt
        : row.firstOccurredAt;
    organizerAccumulator.lastOccurredAt =
      organizerAccumulator.lastOccurredAt &&
      organizerAccumulator.lastOccurredAt.getTime() >= row.lastOccurredAt.getTime()
        ? organizerAccumulator.lastOccurredAt
        : row.lastOccurredAt;

    for (const traceId of row.sampleTraceIds) {
      organizerAccumulator.traceIds.add(traceId);
    }

    const organizerCurrencyRow = getOrCreateCurrencyRow(
      organizerAccumulator.currencies,
      row.sourceCurrency,
    );
    organizerCurrencyRow.grossProcessedMinor += row.grossProcessedMinor;
    organizerCurrencyRow.platformFeeMinor += row.platformFeeMinor;
    organizerCurrencyRow.organizerProceedsMinor += row.organizerProceedsMinor;
    organizerCurrencyRow.captureCount += row.captureCount;
  }

  const currencies = Array.from(currenciesByCode.values()).sort((left, right) =>
    left.sourceCurrency.localeCompare(right.sourceCurrency),
  );
  const headlineRow = selectHeadlineCurrencyRow(currencies);
  const traceabilityEventCount = params.reconciliationRollups.reduce(
    (total, row) => total + row.captureEventCount,
    0,
  );
  const excludedEventCount = params.reconciliationRollups.reduce(
    (total, row) => total + row.excludedEventCount,
    0,
  );
  const firstOccurredAt = params.reconciliationRollups.reduce<Date | null>((earliest, row) => {
    if (!earliest) return row.firstOccurredAt;
    return earliest.getTime() <= row.firstOccurredAt.getTime() ? earliest : row.firstOccurredAt;
  }, null);
  const lastOccurredAt = params.reconciliationRollups.reduce<Date | null>((latest, row) => {
    if (!latest) return row.lastOccurredAt;
    return latest.getTime() >= row.lastOccurredAt.getTime() ? latest : row.lastOccurredAt;
  }, null);
  const organizerRows = Array.from(organizers.values())
    .map((organizerAccumulator) => {
      const organizerCurrencies = Array.from(organizerAccumulator.currencies.values()).sort(
        (left, right) => left.sourceCurrency.localeCompare(right.sourceCurrency),
      );
      const organizerHeadline = selectHeadlineCurrencyRow(organizerCurrencies);

      return {
        organizerId: organizerAccumulator.organizerId,
        organizerLabel: organizerAccumulator.organizerLabel,
        headlineCurrency: organizerHeadline?.sourceCurrency ?? 'MXN',
        headlineGrossProcessedMinor: organizerHeadline?.grossProcessedMinor ?? 0,
        headlinePlatformFeeMinor: organizerHeadline?.platformFeeMinor ?? 0,
        headlineOrganizerProceedsMinor: organizerHeadline?.organizerProceedsMinor ?? 0,
        captureCount: organizerAccumulator.captureCount,
        currencies: organizerCurrencies,
        traceability: {
          // `payment.captured` is unique per trace by schema, so capture counts are exact trace counts.
          distinctTraceCount: organizerAccumulator.captureCount,
          firstOccurredAt: organizerAccumulator.firstOccurredAt,
          lastOccurredAt: organizerAccumulator.lastOccurredAt,
          sampleTraceIds: Array.from(organizerAccumulator.traceIds)
            .sort((left, right) => left.localeCompare(right))
            .slice(0, params.sampleTraceLimit),
        },
      } satisfies PaymentCaptureVolumeOrganizerRow;
    })
    .sort((left, right) => {
      const countDiff = right.captureCount - left.captureCount;
      if (countDiff !== 0) return countDiff;

      return left.organizerLabel.localeCompare(right.organizerLabel);
    })
    .slice(0, params.organizerLimit);

  return {
    asOf: params.asOf,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    headlineCurrency: headlineRow?.sourceCurrency ?? 'MXN',
    headlineGrossProcessedMinor: headlineRow?.grossProcessedMinor ?? 0,
    headlinePlatformFeeMinor: headlineRow?.platformFeeMinor ?? 0,
    headlineOrganizerProceedsMinor: headlineRow?.organizerProceedsMinor ?? 0,
    headlineCaptureCount,
    currencies,
    organizers: organizerRows,
    organizerPagination: {
      page: 1,
      pageSize: params.organizerLimit,
      total: organizers.size,
      pageCount: organizers.size === 0 ? 0 : Math.ceil(organizers.size / params.organizerLimit),
    },
    excludedEvents: params.excludedEvents,
    traceability: {
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      // `payment.captured` is unique per trace by schema, so capture counts are exact trace counts.
      eventCount: traceabilityEventCount,
      distinctTraceCount: traceabilityEventCount,
      firstOccurredAt,
      lastOccurredAt,
      sampleTraceIds: mergeTraceIdSamples(
        params.reconciliationRollups.map((row) => row.sampleTraceIds),
        params.sampleTraceLimit,
      ),
      excludedEventCount,
    },
  };
}

function buildPaginatedOrganizerRows(params: {
  summaryRows: PaymentCaptureVolumeOrganizerSummaryRecord[];
  organizerRollups: PaymentCaptureVolumeOrganizerDailyRollupRecord[];
  organizerLabels: Record<string, string>;
  sampleTraceLimit: number;
}): PaymentCaptureVolumeOrganizerRow[] {
  const currenciesByOrganizer = new Map<string, Map<string, PaymentCaptureVolumeCurrencyRow>>();
  const sampleTracesByOrganizer = new Map<string, Set<string>>();

  for (const row of params.organizerRollups) {
    const organizerCurrencies =
      currenciesByOrganizer.get(row.organizerId) ?? new Map<string, PaymentCaptureVolumeCurrencyRow>();
    currenciesByOrganizer.set(row.organizerId, organizerCurrencies);
    const currencyRow = getOrCreateCurrencyRow(organizerCurrencies, row.sourceCurrency);
    currencyRow.grossProcessedMinor += row.grossProcessedMinor;
    currencyRow.platformFeeMinor += row.platformFeeMinor;
    currencyRow.organizerProceedsMinor += row.organizerProceedsMinor;
    currencyRow.captureCount += row.captureCount;

    const traceIds = sampleTracesByOrganizer.get(row.organizerId) ?? new Set<string>();
    for (const traceId of row.sampleTraceIds) {
      traceIds.add(traceId);
    }
    sampleTracesByOrganizer.set(row.organizerId, traceIds);
  }

  return params.summaryRows.map((summaryRow) => {
    const organizerCurrencies = Array.from(
      currenciesByOrganizer.get(summaryRow.organizerId)?.values() ?? [],
    ).sort((left, right) => left.sourceCurrency.localeCompare(right.sourceCurrency));
    const organizerHeadline = selectHeadlineCurrencyRow(organizerCurrencies);
    const sampleTraceIds = Array.from(sampleTracesByOrganizer.get(summaryRow.organizerId) ?? [])
      .sort((left, right) => left.localeCompare(right))
      .slice(0, params.sampleTraceLimit);

    return {
      organizerId: summaryRow.organizerId,
      organizerLabel: resolveOrganizerLabel(summaryRow.organizerId, params.organizerLabels),
      headlineCurrency: organizerHeadline?.sourceCurrency ?? 'MXN',
      headlineGrossProcessedMinor: organizerHeadline?.grossProcessedMinor ?? 0,
      headlinePlatformFeeMinor: organizerHeadline?.platformFeeMinor ?? 0,
      headlineOrganizerProceedsMinor: organizerHeadline?.organizerProceedsMinor ?? 0,
      captureCount: summaryRow.captureCount,
      currencies: organizerCurrencies,
      traceability: {
        distinctTraceCount: summaryRow.captureCount,
        firstOccurredAt: summaryRow.firstOccurredAt,
        lastOccurredAt: summaryRow.lastOccurredAt,
        sampleTraceIds,
      },
    } satisfies PaymentCaptureVolumeOrganizerRow;
  });
}

function toBucketDateForQuery(value: Date): Date {
  return new Date(`${toReportingBucketDate(value)}T00:00:00.000Z`);
}

async function loadPaymentCaptureVolumeDailyRollups(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<PaymentCaptureVolumeDailyRollupRecord[]> {
  const bucketStart = toBucketDateForQuery(params.windowStart);
  const bucketEnd = toBucketDateForQuery(params.windowEnd);

  const rows = await db
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
        gte(paymentCaptureVolumeDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeDaily.bucketDate, bucketEnd),
      ),
    );

  return rows.map((row) => ({
    ...row,
    sampleTraceIds: row.sampleTraceIds ?? [],
  }));
}

async function loadPaymentCaptureVolumeOrganizerRollups(params: {
  windowStart: Date;
  windowEnd: Date;
  organizerIds?: string[];
}): Promise<PaymentCaptureVolumeOrganizerDailyRollupRecord[]> {
  const bucketStart = toBucketDateForQuery(params.windowStart);
  const bucketEnd = toBucketDateForQuery(params.windowEnd);
  const filters = [
    gte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketStart),
    lte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketEnd),
  ];
  if (params.organizerIds && params.organizerIds.length > 0) {
    filters.push(inArray(paymentCaptureVolumeOrganizerDaily.organizerId, params.organizerIds));
  }

  const rows = await db
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
    .where(and(...filters));

  return rows.map((row) => ({
    ...row,
    sampleTraceIds: row.sampleTraceIds ?? [],
  }));
}

async function loadPaginatedOrganizerRanking(params: {
  windowStart: Date;
  windowEnd: Date;
  requestedPage: number;
  pageSize: number;
}): Promise<{
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
  summaryRows: PaymentCaptureVolumeOrganizerSummaryRecord[];
}> {
  const bucketStart = toBucketDateForQuery(params.windowStart);
  const bucketEnd = toBucketDateForQuery(params.windowEnd);
  const [totalsRow] = await db
    .select({
      total: sql<number>`count(distinct ${paymentCaptureVolumeOrganizerDaily.organizerId})::int`,
    })
    .from(paymentCaptureVolumeOrganizerDaily)
    .where(
      and(
        gte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketEnd),
      ),
    );

  const total = totalsRow?.total ?? 0;
  if (total === 0) {
    return {
      page: 1,
      pageSize: params.pageSize,
      pageCount: 0,
      total: 0,
      summaryRows: [],
    };
  }

  const pageCount = Math.ceil(total / params.pageSize);
  const page = Math.min(Math.max(params.requestedPage, 1), pageCount);
  const offset = (page - 1) * params.pageSize;
  const captureCountSum = sql<number>`coalesce(sum(${paymentCaptureVolumeOrganizerDaily.captureCount}), 0)::int`;
  const grossProcessedSum = sql<number>`coalesce(sum(${paymentCaptureVolumeOrganizerDaily.grossProcessedMinor}), 0)::int`;
  const platformFeeSum = sql<number>`coalesce(sum(${paymentCaptureVolumeOrganizerDaily.platformFeeMinor}), 0)::int`;
  const organizerProceedsSum =
    sql<number>`coalesce(sum(${paymentCaptureVolumeOrganizerDaily.organizerProceedsMinor}), 0)::int`;

  const summaryRows = await db
    .select({
      organizerId: paymentCaptureVolumeOrganizerDaily.organizerId,
      grossProcessedMinor: grossProcessedSum,
      platformFeeMinor: platformFeeSum,
      organizerProceedsMinor: organizerProceedsSum,
      captureCount: captureCountSum,
      firstOccurredAt: sql<Date>`min(${paymentCaptureVolumeOrganizerDaily.firstOccurredAt})`,
      lastOccurredAt: sql<Date>`max(${paymentCaptureVolumeOrganizerDaily.lastOccurredAt})`,
    })
    .from(paymentCaptureVolumeOrganizerDaily)
    .where(
      and(
        gte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeOrganizerDaily.bucketDate, bucketEnd),
      ),
    )
    .groupBy(paymentCaptureVolumeOrganizerDaily.organizerId)
    .orderBy(
      desc(captureCountSum),
      desc(grossProcessedSum),
      paymentCaptureVolumeOrganizerDaily.organizerId,
    )
    .limit(params.pageSize)
    .offset(offset);

  return {
    page,
    pageSize: params.pageSize,
    pageCount,
    total,
    summaryRows,
  };
}

async function loadPaymentCaptureVolumeReconciliationRollups(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<PaymentCaptureVolumeReconciliationDailyRollupRecord[]> {
  const bucketStart = toBucketDateForQuery(params.windowStart);
  const bucketEnd = toBucketDateForQuery(params.windowEnd);

  const rows = await db
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
        gte(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketStart),
        lte(paymentCaptureVolumeReconciliationDaily.bucketDate, bucketEnd),
      ),
    );

  return rows.map((row) => ({
    ...row,
    sampleTraceIds: row.sampleTraceIds ?? [],
    excludedEventSamplesJson: normalizeExcludedEventSampleRecords(row.excludedEventSamplesJson),
  }));
}

async function loadOrganizerLabelsFromIds(organizerIds: string[]): Promise<Record<string, string>> {
  if (organizerIds.length === 0) {
    return {};
  }

  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
    })
    .from(organizations)
    .where(inArray(organizations.id, organizerIds));

  return rows.reduce<Record<string, string>>((accumulator, row) => {
    accumulator[row.id] = row.name;
    return accumulator;
  }, {});
}

export async function getAdminPaymentCaptureVolumeMetrics(params?: {
  days?: number;
  now?: Date;
  organizerLimit?: number;
  organizerPage?: number;
  organizerPageSize?: number;
  sampleTraceLimit?: number;
}): Promise<PaymentCaptureVolumeMetrics> {
  'use cache: remote';

  const now = params?.now ?? new Date();
  const days =
    typeof params?.days === 'number' && Number.isFinite(params.days) && params.days > 0
      ? Math.trunc(params.days)
      : 30;
  const organizerPage =
    typeof params?.organizerPage === 'number' &&
    Number.isFinite(params.organizerPage) &&
    params.organizerPage > 0
      ? Math.trunc(params.organizerPage)
      : 1;
  const organizerPageSize =
    typeof params?.organizerPageSize === 'number' &&
    Number.isFinite(params.organizerPageSize) &&
    params.organizerPageSize > 0
      ? Math.min(
          Math.trunc(params.organizerPageSize),
          MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE,
        )
      : typeof params?.organizerLimit === 'number' &&
          Number.isFinite(params.organizerLimit) &&
          params.organizerLimit > 0
        ? Math.min(
            Math.trunc(params.organizerLimit),
            MAX_PAYMENT_CAPTURE_VOLUME_ORGANIZER_PAGE_SIZE,
          )
        : DEFAULT_ORGANIZER_PAGE_SIZE;
  const sampleTraceLimit =
    typeof params?.sampleTraceLimit === 'number' &&
    Number.isFinite(params.sampleTraceLimit) &&
    params.sampleTraceLimit > 0
      ? Math.trunc(params.sampleTraceLimit)
      : DEFAULT_SAMPLE_TRACE_LIMIT;

  cacheTag(
    adminPaymentsCacheTags.paymentCaptureVolume,
    withWindowTag(adminPaymentsCacheTags.paymentCaptureVolume, days),
    adminPaymentsCacheTags.paymentCaptureVolumeOrganizers,
    withWindowTag(adminPaymentsCacheTags.paymentCaptureVolumeOrganizers, days),
  );
  cacheLife({ expire: 180 });

  const windowStart = toBucketDateForQuery(subDays(now, days - 1));
  const windowEnd = now;
  const [dailyRollups, organizerRanking, reconciliationRollups] = await Promise.all([
    loadPaymentCaptureVolumeDailyRollups({
      windowStart,
      windowEnd,
    }),
    loadPaginatedOrganizerRanking({
      windowStart,
      windowEnd,
      requestedPage: organizerPage,
      pageSize: organizerPageSize,
    }),
    loadPaymentCaptureVolumeReconciliationRollups({
      windowStart,
      windowEnd,
    }),
  ]);
  const organizerIds = organizerRanking.summaryRows.map((row) => row.organizerId);
  const organizerRollups =
    organizerIds.length > 0
      ? await loadPaymentCaptureVolumeOrganizerRollups({
          windowStart,
          windowEnd,
          organizerIds,
        })
      : [];
  const organizerLabels = await loadOrganizerLabelsFromIds(organizerIds);

  const metrics = aggregateMetricsFromRollups({
    dailyRollups,
    organizerRollups,
    reconciliationRollups,
    excludedEvents: collectExcludedEventsFromReconciliationRollups(reconciliationRollups),
    windowStart,
    windowEnd,
    organizerLabels,
    organizerLimit: organizerPageSize,
    sampleTraceLimit,
    asOf: now,
  });
  return {
    ...metrics,
    organizers: buildPaginatedOrganizerRows({
      summaryRows: organizerRanking.summaryRows,
      organizerRollups,
      organizerLabels,
      sampleTraceLimit,
    }),
    organizerPagination: {
      page: organizerRanking.page,
      pageSize: organizerRanking.pageSize,
      total: organizerRanking.total,
      pageCount: organizerRanking.pageCount,
    },
  };
}
