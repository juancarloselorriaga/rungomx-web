'server only';

import { subDays } from 'date-fns';
import { and, asc, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents } from '@/db/schema';

const economicsRelevantEventNames = [
  'payment.captured',
  'financial.adjustment_posted',
] as const;

type EconomicsRelevantEventName = (typeof economicsRelevantEventNames)[number];

export type NetRecognizedFeeProjectionEvent = {
  traceId: string;
  eventName: EconomicsRelevantEventName;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

export type NetRecognizedFeeCurrencyMetric = {
  currency: string;
  capturedFeeMinor: number;
  adjustmentsMinor: number;
  netRecognizedFeeMinor: number;
  captureEventCount: number;
  adjustmentEventCount: number;
};

export type NetRecognizedFeeAdjustmentRow = {
  currency: string;
  adjustmentCode: string;
  amountMinor: number;
  eventCount: number;
};

export type NetRecognizedFeeTraceability = {
  windowStart: Date;
  windowEnd: Date;
  eventCount: number;
  distinctTraceCount: number;
  firstOccurredAt: Date | null;
  lastOccurredAt: Date | null;
  sampleTraceIds: string[];
};

export type NetRecognizedFeeMetrics = {
  asOf: Date;
  windowStart: Date;
  windowEnd: Date;
  headlineCurrency: string;
  headlineCapturedFeeMinor: number;
  headlineAdjustmentsMinor: number;
  headlineNetRecognizedFeeMinor: number;
  currencies: NetRecognizedFeeCurrencyMetric[];
  adjustments: NetRecognizedFeeAdjustmentRow[];
  traceability: NetRecognizedFeeTraceability;
};

type CanonicalMoneyAmount = {
  amountMinor: number;
  currency: string;
};

function normalizeCurrency(rawCurrency: string): string | null {
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
  const currency = (value as Record<string, unknown>).currency;

  if (typeof amountMinor !== 'number' || !Number.isFinite(amountMinor)) {
    return null;
  }

  if (typeof currency !== 'string') {
    return null;
  }

  const normalizedCurrency = normalizeCurrency(currency);
  if (!normalizedCurrency) {
    return null;
  }

  return {
    amountMinor: Math.trunc(amountMinor),
    currency: normalizedCurrency,
  };
}

function readAdjustmentCode(payload: Record<string, unknown>): string {
  const value = payload.adjustmentCode;
  if (typeof value !== 'string') return 'unspecified';
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : 'unspecified';
}

function sortEventsForProjection(
  events: NetRecognizedFeeProjectionEvent[],
): NetRecognizedFeeProjectionEvent[] {
  return [...events].sort((left, right) => {
    const occurredAtDiff = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurredAtDiff !== 0) return occurredAtDiff;

    const traceDiff = left.traceId.localeCompare(right.traceId);
    if (traceDiff !== 0) return traceDiff;

    return left.eventName.localeCompare(right.eventName);
  });
}

export function projectNetRecognizedFeeMetrics(params: {
  events: NetRecognizedFeeProjectionEvent[];
  windowStart: Date;
  windowEnd: Date;
  asOf?: Date;
  sampleTraceLimit?: number;
}): NetRecognizedFeeMetrics {
  const orderedEvents = sortEventsForProjection(params.events);
  const byCurrency = new Map<string, NetRecognizedFeeCurrencyMetric>();
  const adjustmentsByCode = new Map<string, NetRecognizedFeeAdjustmentRow>();
  const traceIds = new Set<string>();

  for (const event of orderedEvents) {
    traceIds.add(event.traceId);

    if (event.eventName === 'payment.captured') {
      const feeAmount = readCanonicalMoneyAmount(event.payloadJson, 'feeAmount');
      if (!feeAmount) continue;

      const current = byCurrency.get(feeAmount.currency) ?? {
        currency: feeAmount.currency,
        capturedFeeMinor: 0,
        adjustmentsMinor: 0,
        netRecognizedFeeMinor: 0,
        captureEventCount: 0,
        adjustmentEventCount: 0,
      };

      current.capturedFeeMinor += feeAmount.amountMinor;
      current.captureEventCount += 1;
      current.netRecognizedFeeMinor = current.capturedFeeMinor + current.adjustmentsMinor;
      byCurrency.set(feeAmount.currency, current);
      continue;
    }

    const adjustmentAmount = readCanonicalMoneyAmount(event.payloadJson, 'amount');
    if (!adjustmentAmount) continue;

    const currencyMetric = byCurrency.get(adjustmentAmount.currency) ?? {
      currency: adjustmentAmount.currency,
      capturedFeeMinor: 0,
      adjustmentsMinor: 0,
      netRecognizedFeeMinor: 0,
      captureEventCount: 0,
      adjustmentEventCount: 0,
    };

    currencyMetric.adjustmentsMinor += adjustmentAmount.amountMinor;
    currencyMetric.adjustmentEventCount += 1;
    currencyMetric.netRecognizedFeeMinor =
      currencyMetric.capturedFeeMinor + currencyMetric.adjustmentsMinor;
    byCurrency.set(adjustmentAmount.currency, currencyMetric);

    const adjustmentCode = readAdjustmentCode(event.payloadJson);
    const adjustmentKey = `${adjustmentAmount.currency}:${adjustmentCode}`;
    const adjustmentRow = adjustmentsByCode.get(adjustmentKey) ?? {
      currency: adjustmentAmount.currency,
      adjustmentCode,
      amountMinor: 0,
      eventCount: 0,
    };
    adjustmentRow.amountMinor += adjustmentAmount.amountMinor;
    adjustmentRow.eventCount += 1;
    adjustmentsByCode.set(adjustmentKey, adjustmentRow);
  }

  const currencies = Array.from(byCurrency.values()).sort((left, right) =>
    left.currency.localeCompare(right.currency),
  );
  const adjustments = Array.from(adjustmentsByCode.values()).sort((left, right) => {
    const currencyDiff = left.currency.localeCompare(right.currency);
    if (currencyDiff !== 0) return currencyDiff;

    const magnitudeDiff = Math.abs(right.amountMinor) - Math.abs(left.amountMinor);
    if (magnitudeDiff !== 0) return magnitudeDiff;

    return left.adjustmentCode.localeCompare(right.adjustmentCode);
  });

  const headlineMetric =
    currencies.find((entry) => entry.currency === 'MXN') ??
    currencies[0] ?? {
      currency: 'MXN',
      capturedFeeMinor: 0,
      adjustmentsMinor: 0,
      netRecognizedFeeMinor: 0,
      captureEventCount: 0,
      adjustmentEventCount: 0,
    };

  const sampleTraceLimit =
    typeof params.sampleTraceLimit === 'number' && params.sampleTraceLimit > 0
      ? Math.trunc(params.sampleTraceLimit)
      : 5;

  const sampleTraceIds = Array.from(traceIds).sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    asOf: params.asOf ?? params.windowEnd,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    headlineCurrency: headlineMetric.currency,
    headlineCapturedFeeMinor: headlineMetric.capturedFeeMinor,
    headlineAdjustmentsMinor: headlineMetric.adjustmentsMinor,
    headlineNetRecognizedFeeMinor: headlineMetric.netRecognizedFeeMinor,
    currencies,
    adjustments,
    traceability: {
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      eventCount: orderedEvents.length,
      distinctTraceCount: traceIds.size,
      firstOccurredAt: orderedEvents[0]?.occurredAt ?? null,
      lastOccurredAt: orderedEvents[orderedEvents.length - 1]?.occurredAt ?? null,
      sampleTraceIds: sampleTraceIds.slice(0, sampleTraceLimit),
    },
  };
}

async function loadEconomicsEvents(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<NetRecognizedFeeProjectionEvent[]> {
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
        inArray(moneyEvents.eventName, economicsRelevantEventNames),
        gte(moneyEvents.occurredAt, params.windowStart),
        lte(moneyEvents.occurredAt, params.windowEnd),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id));

  return rows.map((row) => ({
    traceId: row.traceId,
    eventName: row.eventName as EconomicsRelevantEventName,
    occurredAt: row.occurredAt,
    payloadJson: row.payloadJson,
  }));
}

export async function getAdminNetRecognizedFeeMetrics(params?: {
  days?: number;
  now?: Date;
}): Promise<NetRecognizedFeeMetrics> {
  const now = params?.now ?? new Date();
  const days =
    typeof params?.days === 'number' && Number.isFinite(params.days) && params.days > 0
      ? Math.trunc(params.days)
      : 30;

  const windowStart = subDays(now, days - 1);
  const windowEnd = now;
  const events = await loadEconomicsEvents({
    windowStart,
    windowEnd,
  });

  return projectNetRecognizedFeeMetrics({
    events,
    windowStart,
    windowEnd,
    asOf: now,
  });
}
