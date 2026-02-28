'server only';

import { subDays } from 'date-fns';
import { and, asc, gte, inArray, lte } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { db } from '@/db';
import { moneyEvents } from '@/db/schema';
import { adminPaymentsCacheTags, withWindowTag } from './cache-tags';

const MXN_CURRENCY = 'MXN';
const NATIVE_MXN_SNAPSHOT_ID = 'native:mxn';

const mxnReportingRelevantEventNames = ['payment.captured', 'financial.adjustment_posted'] as const;

type MxnReportingRelevantEventName = (typeof mxnReportingRelevantEventNames)[number];

export type MxnReportingFxSnapshot = {
  snapshotId: string;
  sourceCurrency: string;
  rateToMxn: number;
  effectiveAt: Date;
};

export type MxnReportingProjectionEvent = {
  traceId: string;
  eventName: MxnReportingRelevantEventName;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

export type MxnReportingSnapshotReference = {
  snapshotId: string;
  sourceCurrency: string;
  rateToMxn: number;
  effectiveAt: Date;
};

export type MxnReportingCurrencyRow = {
  sourceCurrency: string;
  sourceNetRecognizedFeeMinor: number;
  mxnNetRecognizedFeeMinor: number | null;
  convertedEventCount: number;
  missingSnapshotEventCount: number;
  appliedSnapshots: MxnReportingSnapshotReference[];
  sampleMissingSnapshotTraceIds: string[];
};

export type MxnNetRecognizedFeeReport = {
  asOf: Date;
  windowStart: Date;
  windowEnd: Date;
  headlineMxnNetRecognizedFeeMinor: number;
  convertedEventCount: number;
  missingSnapshotEventCount: number;
  currencies: MxnReportingCurrencyRow[];
  traceability: {
    windowStart: Date;
    windowEnd: Date;
    eventCount: number;
    distinctTraceCount: number;
    firstOccurredAt: Date | null;
    lastOccurredAt: Date | null;
    sampleTraceIds: string[];
  };
};

type CanonicalMoneyAmount = {
  amountMinor: number;
  currency: string;
};

type CurrencyAccumulator = {
  sourceCurrency: string;
  sourceNetRecognizedFeeMinor: number;
  mxnNetRecognizedFeeMinor: number;
  convertedEventCount: number;
  missingSnapshotEventCount: number;
  appliedSnapshots: Map<string, MxnReportingSnapshotReference>;
  missingSnapshotTraceIds: Set<string>;
};

const DEFAULT_EVENT_TIME_FX_SNAPSHOTS: MxnReportingFxSnapshot[] = [
  {
    snapshotId: 'fx-usd-mxn-2026-01-01',
    sourceCurrency: 'USD',
    rateToMxn: 17.1,
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    snapshotId: 'fx-usd-mxn-2026-02-01',
    sourceCurrency: 'USD',
    rateToMxn: 17.35,
    effectiveAt: new Date('2026-02-01T00:00:00.000Z'),
  },
  {
    snapshotId: 'fx-eur-mxn-2026-01-01',
    sourceCurrency: 'EUR',
    rateToMxn: 18.4,
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    snapshotId: 'fx-eur-mxn-2026-02-01',
    sourceCurrency: 'EUR',
    rateToMxn: 18.75,
    effectiveAt: new Date('2026-02-01T00:00:00.000Z'),
  },
  {
    snapshotId: 'fx-cad-mxn-2026-01-01',
    sourceCurrency: 'CAD',
    rateToMxn: 12.65,
    effectiveAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    snapshotId: 'fx-cad-mxn-2026-02-01',
    sourceCurrency: 'CAD',
    rateToMxn: 12.95,
    effectiveAt: new Date('2026-02-01T00:00:00.000Z'),
  },
];

function normalizeCurrency(rawCurrency: unknown): string | null {
  if (typeof rawCurrency !== 'string') return null;
  const value = rawCurrency.trim().toUpperCase();
  if (value.length !== 3) return null;
  return value;
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

function sortEventsForProjection(
  events: MxnReportingProjectionEvent[],
): MxnReportingProjectionEvent[] {
  return [...events].sort((left, right) => {
    const occurredAtDiff = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurredAtDiff !== 0) return occurredAtDiff;

    const traceDiff = left.traceId.localeCompare(right.traceId);
    if (traceDiff !== 0) return traceDiff;

    return left.eventName.localeCompare(right.eventName);
  });
}

function sortSnapshotsForLookup(
  snapshots: MxnReportingFxSnapshot[],
): Map<string, MxnReportingFxSnapshot[]> {
  const grouped = new Map<string, MxnReportingFxSnapshot[]>();

  for (const snapshot of snapshots) {
    const sourceCurrency = normalizeCurrency(snapshot.sourceCurrency);
    if (!sourceCurrency) continue;
    if (!Number.isFinite(snapshot.rateToMxn) || snapshot.rateToMxn <= 0) continue;
    if (!(snapshot.effectiveAt instanceof Date) || Number.isNaN(snapshot.effectiveAt.getTime())) {
      continue;
    }

    const normalized: MxnReportingFxSnapshot = {
      snapshotId: snapshot.snapshotId.trim(),
      sourceCurrency,
      rateToMxn: snapshot.rateToMxn,
      effectiveAt: snapshot.effectiveAt,
    };

    if (!grouped.has(sourceCurrency)) {
      grouped.set(sourceCurrency, []);
    }
    grouped.get(sourceCurrency)!.push(normalized);
  }

  for (const [currency, currencySnapshots] of grouped.entries()) {
    const orderedSnapshots = [...currencySnapshots].sort((left, right) => {
      const effectiveAtDiff = left.effectiveAt.getTime() - right.effectiveAt.getTime();
      if (effectiveAtDiff !== 0) return effectiveAtDiff;
      return left.snapshotId.localeCompare(right.snapshotId);
    });
    grouped.set(currency, orderedSnapshots);
  }

  return grouped;
}

function resolveSnapshotForEvent(params: {
  sourceCurrency: string;
  occurredAt: Date;
  snapshotLookup: Map<string, MxnReportingFxSnapshot[]>;
}): MxnReportingSnapshotReference | null {
  if (params.sourceCurrency === MXN_CURRENCY) {
    return {
      snapshotId: NATIVE_MXN_SNAPSHOT_ID,
      sourceCurrency: MXN_CURRENCY,
      rateToMxn: 1,
      effectiveAt: params.occurredAt,
    };
  }

  const currencySnapshots = params.snapshotLookup.get(params.sourceCurrency);
  if (!currencySnapshots || currencySnapshots.length === 0) {
    return null;
  }

  let selected: MxnReportingFxSnapshot | null = null;
  for (const snapshot of currencySnapshots) {
    if (snapshot.effectiveAt.getTime() <= params.occurredAt.getTime()) {
      selected = snapshot;
      continue;
    }
    break;
  }

  if (!selected) return null;

  return {
    snapshotId: selected.snapshotId,
    sourceCurrency: selected.sourceCurrency,
    rateToMxn: selected.rateToMxn,
    effectiveAt: selected.effectiveAt,
  };
}

function eventAmountForMxnReport(event: MxnReportingProjectionEvent): CanonicalMoneyAmount | null {
  if (event.eventName === 'payment.captured') {
    return readCanonicalMoneyAmount(event.payloadJson, 'feeAmount');
  }
  return readCanonicalMoneyAmount(event.payloadJson, 'amount');
}

function getOrCreateCurrencyAccumulator(
  byCurrency: Map<string, CurrencyAccumulator>,
  sourceCurrency: string,
): CurrencyAccumulator {
  const existing = byCurrency.get(sourceCurrency);
  if (existing) return existing;

  const created: CurrencyAccumulator = {
    sourceCurrency,
    sourceNetRecognizedFeeMinor: 0,
    mxnNetRecognizedFeeMinor: 0,
    convertedEventCount: 0,
    missingSnapshotEventCount: 0,
    appliedSnapshots: new Map<string, MxnReportingSnapshotReference>(),
    missingSnapshotTraceIds: new Set<string>(),
  };
  byCurrency.set(sourceCurrency, created);
  return created;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.trunc(value);
}

export function getConfiguredEventTimeFxSnapshots(): MxnReportingFxSnapshot[] {
  return DEFAULT_EVENT_TIME_FX_SNAPSHOTS.map((snapshot) => ({
    snapshotId: snapshot.snapshotId,
    sourceCurrency: snapshot.sourceCurrency,
    rateToMxn: snapshot.rateToMxn,
    effectiveAt: new Date(snapshot.effectiveAt.getTime()),
  }));
}

export function projectMxnNetRecognizedFeeReport(params: {
  events: MxnReportingProjectionEvent[];
  snapshots: MxnReportingFxSnapshot[];
  windowStart: Date;
  windowEnd: Date;
  asOf?: Date;
  sampleTraceLimit?: number;
  sampleMissingLimit?: number;
}): MxnNetRecognizedFeeReport {
  const orderedEvents = sortEventsForProjection(params.events);
  const snapshotLookup = sortSnapshotsForLookup(params.snapshots);
  const sampleTraceLimit = normalizeLimit(params.sampleTraceLimit, 5);
  const sampleMissingLimit = normalizeLimit(params.sampleMissingLimit, 5);

  const byCurrency = new Map<string, CurrencyAccumulator>();
  const globalTraceIds = new Set<string>();

  let headlineMxnNetRecognizedFeeMinor = 0;
  let convertedEventCount = 0;
  let missingSnapshotEventCount = 0;

  for (const event of orderedEvents) {
    globalTraceIds.add(event.traceId);

    const amount = eventAmountForMxnReport(event);
    if (!amount) continue;

    const currency = normalizeCurrency(amount.currency);
    if (!currency) continue;

    const currencyAccumulator = getOrCreateCurrencyAccumulator(byCurrency, currency);
    currencyAccumulator.sourceNetRecognizedFeeMinor += amount.amountMinor;

    const selectedSnapshot = resolveSnapshotForEvent({
      sourceCurrency: currency,
      occurredAt: event.occurredAt,
      snapshotLookup,
    });

    if (!selectedSnapshot) {
      currencyAccumulator.missingSnapshotEventCount += 1;
      currencyAccumulator.missingSnapshotTraceIds.add(event.traceId);
      missingSnapshotEventCount += 1;
      continue;
    }

    const mxnAmountMinor = Math.round(amount.amountMinor * selectedSnapshot.rateToMxn);
    currencyAccumulator.mxnNetRecognizedFeeMinor += mxnAmountMinor;
    currencyAccumulator.convertedEventCount += 1;
    currencyAccumulator.appliedSnapshots.set(selectedSnapshot.snapshotId, selectedSnapshot);

    headlineMxnNetRecognizedFeeMinor += mxnAmountMinor;
    convertedEventCount += 1;
  }

  const currencies = Array.from(byCurrency.values())
    .sort((left, right) => left.sourceCurrency.localeCompare(right.sourceCurrency))
    .map((entry) => {
      const appliedSnapshots = Array.from(entry.appliedSnapshots.values()).sort((left, right) => {
        const effectiveDiff = left.effectiveAt.getTime() - right.effectiveAt.getTime();
        if (effectiveDiff !== 0) return effectiveDiff;
        return left.snapshotId.localeCompare(right.snapshotId);
      });

      const sampleMissingSnapshotTraceIds = Array.from(entry.missingSnapshotTraceIds)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, sampleMissingLimit);

      return {
        sourceCurrency: entry.sourceCurrency,
        sourceNetRecognizedFeeMinor: entry.sourceNetRecognizedFeeMinor,
        mxnNetRecognizedFeeMinor:
          entry.convertedEventCount > 0 ? entry.mxnNetRecognizedFeeMinor : null,
        convertedEventCount: entry.convertedEventCount,
        missingSnapshotEventCount: entry.missingSnapshotEventCount,
        appliedSnapshots,
        sampleMissingSnapshotTraceIds,
      };
    });

  return {
    asOf: params.asOf ?? params.windowEnd,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    headlineMxnNetRecognizedFeeMinor,
    convertedEventCount,
    missingSnapshotEventCount,
    currencies,
    traceability: {
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      eventCount: orderedEvents.length,
      distinctTraceCount: globalTraceIds.size,
      firstOccurredAt: orderedEvents[0]?.occurredAt ?? null,
      lastOccurredAt: orderedEvents[orderedEvents.length - 1]?.occurredAt ?? null,
      sampleTraceIds: Array.from(globalTraceIds)
        .sort((left, right) => left.localeCompare(right))
        .slice(0, sampleTraceLimit),
    },
  };
}

async function loadMxnReportEvents(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<MxnReportingProjectionEvent[]> {
  const rows = await db
    .select({
      traceId: moneyEvents.traceId,
      eventName: moneyEvents.eventName,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        inArray(moneyEvents.eventName, mxnReportingRelevantEventNames),
        gte(moneyEvents.occurredAt, params.windowStart),
        lte(moneyEvents.occurredAt, params.windowEnd),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id));

  return rows.map((row) => ({
    traceId: row.traceId,
    eventName: row.eventName as MxnReportingRelevantEventName,
    occurredAt: row.occurredAt,
    payloadJson: row.payloadJson,
  }));
}

export async function getAdminMxnNetRecognizedFeeReport(params?: {
  days?: number;
  now?: Date;
  snapshots?: MxnReportingFxSnapshot[];
}): Promise<MxnNetRecognizedFeeReport> {
  'use cache: remote';

  const now = params?.now ?? new Date();
  const days =
    typeof params?.days === 'number' && Number.isFinite(params.days) && params.days > 0
      ? Math.trunc(params.days)
      : 30;
  cacheTag(adminPaymentsCacheTags.mxnReport, withWindowTag(adminPaymentsCacheTags.mxnReport, days));
  cacheLife({ expire: 180 });

  const windowStart = subDays(now, days - 1);
  const windowEnd = now;
  const events = await loadMxnReportEvents({
    windowStart,
    windowEnd,
  });

  const snapshots =
    params?.snapshots && params.snapshots.length > 0
      ? params.snapshots
      : getConfiguredEventTimeFxSnapshots();

  return projectMxnNetRecognizedFeeReport({
    events,
    snapshots,
    windowStart,
    windowEnd,
    asOf: now,
  });
}
