'server only';

import { subDays } from 'date-fns';
import { and, asc, desc, eq, gte, inArray, lte } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { db } from '@/db';
import { moneyEvents, paymentFxRates } from '@/db/schema';
import { createAuditLog } from '@/lib/audit';
import { adminPaymentsCacheTags, withWindowTag } from './cache-tags';

const FX_TARGET_CURRENCY = 'MXN';
const RATE_SCALE = 1_000_000;

const fxCoverageRelevantEventNames = ['payment.captured', 'financial.adjustment_posted'] as const;

type FxCoverageRelevantEventName = (typeof fxCoverageRelevantEventNames)[number];

type CanonicalMoneyAmount = {
  amountMinor: number;
  currency: string;
};

export type DailyFxRateRecord = {
  id: string;
  sourceCurrency: string;
  quoteCurrency: string;
  effectiveDate: Date;
  rateMicroMxn: number;
  rateToMxn: number;
  updatedReason: string | null;
  updatedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type FxSnapshotForReporting = {
  snapshotId: string;
  sourceCurrency: string;
  rateToMxn: number;
  effectiveAt: Date;
};

export type FxRateActionFlags = {
  checkedCurrencies: string[];
  missingRates: Array<{
    sourceCurrency: string;
    missingEventDates: string[];
  }>;
  staleRates: Array<{
    sourceCurrency: string;
    latestEffectiveDate: string;
    daysStale: number;
  }>;
  hasActions: boolean;
};

type FxCoverageEvent = {
  eventName: FxCoverageRelevantEventName;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

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

function eventAmountForFxCoverage(event: FxCoverageEvent): CanonicalMoneyAmount | null {
  if (event.eventName === 'payment.captured') {
    return readCanonicalMoneyAmount(event.payloadJson, 'feeAmount');
  }
  return readCanonicalMoneyAmount(event.payloadJson, 'amount');
}

function toUtcDateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function parseUtcDateKey(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toUtcDateOnly(value: Date): Date {
  return parseUtcDateKey(toUtcDateKey(value));
}

function daysBetweenUtc(from: Date, to: Date): number {
  const fromUtc = toUtcDateOnly(from).getTime();
  const toUtc = toUtcDateOnly(to).getTime();
  return Math.max(Math.floor((toUtc - fromUtc) / 86_400_000), 0);
}

function toRateMicroMxn(rateToMxn: number): number {
  if (!Number.isFinite(rateToMxn) || rateToMxn <= 0) {
    throw new Error('Rate must be a positive finite number');
  }

  const scaled = Math.round(rateToMxn * RATE_SCALE);
  if (scaled <= 0) {
    throw new Error('Rate precision is too small');
  }
  return scaled;
}

function fromRateMicroMxn(rateMicroMxn: number): number {
  return rateMicroMxn / RATE_SCALE;
}

function mapDailyFxRateRow(row: typeof paymentFxRates.$inferSelect): DailyFxRateRecord {
  return {
    id: row.id,
    sourceCurrency: row.sourceCurrency,
    quoteCurrency: row.quoteCurrency,
    effectiveDate: row.effectiveDate,
    rateMicroMxn: row.rateMicroMxn,
    rateToMxn: fromRateMicroMxn(row.rateMicroMxn),
    updatedReason: row.updatedReason,
    updatedByUserId: row.updatedByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.trunc(value);
}

function sortRatesByEffectiveDate(rates: DailyFxRateRecord[]): DailyFxRateRecord[] {
  return [...rates].sort((left, right) => {
    const dateDiff = left.effectiveDate.getTime() - right.effectiveDate.getTime();
    if (dateDiff !== 0) return dateDiff;
    return left.id.localeCompare(right.id);
  });
}

export function projectFxRateActionFlags(params: {
  requiredEventDatesByCurrency: Record<string, string[]>;
  ratesByCurrency: Record<string, Array<Pick<DailyFxRateRecord, 'effectiveDate'>>>;
  now?: Date;
  staleAfterDays?: number;
}): FxRateActionFlags {
  const now = params.now ?? new Date();
  const staleAfterDays = normalizeLimit(params.staleAfterDays, 3);
  const checkedCurrencies = Object.keys(params.requiredEventDatesByCurrency).sort((a, b) =>
    a.localeCompare(b),
  );

  const missingRates: FxRateActionFlags['missingRates'] = [];
  const staleRates: FxRateActionFlags['staleRates'] = [];

  for (const sourceCurrency of checkedCurrencies) {
    const eventDates = Array.from(
      new Set(params.requiredEventDatesByCurrency[sourceCurrency] ?? []),
    ).sort((a, b) => a.localeCompare(b));
    const rates = sortRatesByEffectiveDate(
      (params.ratesByCurrency[sourceCurrency] ?? []).map((rate, index) => ({
        id: `${sourceCurrency}-${index}`,
        sourceCurrency,
        quoteCurrency: FX_TARGET_CURRENCY,
        effectiveDate: toUtcDateOnly(rate.effectiveDate),
        rateMicroMxn: RATE_SCALE,
        rateToMxn: 1,
        updatedReason: null,
        updatedByUserId: null,
        createdAt: rate.effectiveDate,
        updatedAt: rate.effectiveDate,
      })),
    );

    const missingEventDates: string[] = [];
    for (const eventDateKey of eventDates) {
      const eventDate = parseUtcDateKey(eventDateKey);
      const hasApplicableRate = rates.some(
        (rate) => rate.effectiveDate.getTime() <= eventDate.getTime(),
      );
      if (!hasApplicableRate) {
        missingEventDates.push(eventDateKey);
      }
    }

    if (missingEventDates.length > 0) {
      missingRates.push({
        sourceCurrency,
        missingEventDates,
      });
    }

    const latestRate = rates[rates.length - 1];
    if (!latestRate) {
      continue;
    }

    const daysStale = daysBetweenUtc(latestRate.effectiveDate, now);
    if (daysStale > staleAfterDays) {
      staleRates.push({
        sourceCurrency,
        latestEffectiveDate: toUtcDateKey(latestRate.effectiveDate),
        daysStale,
      });
    }
  }

  return {
    checkedCurrencies,
    missingRates,
    staleRates,
    hasActions: missingRates.length > 0 || staleRates.length > 0,
  };
}

async function loadFxCoverageEvents(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<FxCoverageEvent[]> {
  const rows = await db
    .select({
      eventName: moneyEvents.eventName,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        inArray(moneyEvents.eventName, fxCoverageRelevantEventNames),
        gte(moneyEvents.occurredAt, params.windowStart),
        lte(moneyEvents.occurredAt, params.windowEnd),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id));

  return rows.map((row) => ({
    eventName: row.eventName as FxCoverageRelevantEventName,
    occurredAt: row.occurredAt,
    payloadJson: row.payloadJson,
  }));
}

function collectRequiredEventDatesByCurrency(events: FxCoverageEvent[]): Record<string, string[]> {
  const byCurrency = new Map<string, Set<string>>();

  for (const event of events) {
    const amount = eventAmountForFxCoverage(event);
    if (!amount) continue;
    if (amount.currency === FX_TARGET_CURRENCY) continue;

    if (!byCurrency.has(amount.currency)) {
      byCurrency.set(amount.currency, new Set<string>());
    }
    byCurrency.get(amount.currency)!.add(toUtcDateKey(event.occurredAt));
  }

  const result: Record<string, string[]> = {};
  for (const [currency, dates] of byCurrency.entries()) {
    result[currency] = Array.from(dates).sort((left, right) => left.localeCompare(right));
  }
  return result;
}

async function loadRatesByCurrency(
  currencies: string[],
): Promise<Record<string, DailyFxRateRecord[]>> {
  if (currencies.length === 0) {
    return {};
  }

  const rows = await db
    .select()
    .from(paymentFxRates)
    .where(
      and(
        eq(paymentFxRates.quoteCurrency, FX_TARGET_CURRENCY),
        inArray(paymentFxRates.sourceCurrency, currencies),
      ),
    )
    .orderBy(
      asc(paymentFxRates.sourceCurrency),
      asc(paymentFxRates.effectiveDate),
      asc(paymentFxRates.updatedAt),
      asc(paymentFxRates.id),
    );

  const result: Record<string, DailyFxRateRecord[]> = {};
  for (const row of rows) {
    const mapped = mapDailyFxRateRow(row);
    if (!result[mapped.sourceCurrency]) {
      result[mapped.sourceCurrency] = [];
    }
    result[mapped.sourceCurrency]!.push(mapped);
  }

  return result;
}

export async function listDailyFxRatesForAdmin(params?: {
  limit?: number;
}): Promise<DailyFxRateRecord[]> {
  'use cache: remote';

  const limit = normalizeLimit(params?.limit, 180);
  cacheTag(adminPaymentsCacheTags.fxRates, `${adminPaymentsCacheTags.fxRates}-${limit}`);
  cacheLife({ expire: 180 });

  const rows = await db
    .select()
    .from(paymentFxRates)
    .where(eq(paymentFxRates.quoteCurrency, FX_TARGET_CURRENCY))
    .orderBy(
      desc(paymentFxRates.effectiveDate),
      asc(paymentFxRates.sourceCurrency),
      desc(paymentFxRates.updatedAt),
      desc(paymentFxRates.id),
    )
    .limit(limit);

  return rows.map(mapDailyFxRateRow);
}

export async function listEventTimeFxSnapshotsFromDailyRates(): Promise<FxSnapshotForReporting[]> {
  'use cache: remote';

  cacheTag(adminPaymentsCacheTags.fxSnapshots);
  cacheLife({ expire: 180 });

  const rows = await db
    .select({
      id: paymentFxRates.id,
      sourceCurrency: paymentFxRates.sourceCurrency,
      effectiveDate: paymentFxRates.effectiveDate,
      rateMicroMxn: paymentFxRates.rateMicroMxn,
    })
    .from(paymentFxRates)
    .where(eq(paymentFxRates.quoteCurrency, FX_TARGET_CURRENCY))
    .orderBy(
      asc(paymentFxRates.sourceCurrency),
      asc(paymentFxRates.effectiveDate),
      asc(paymentFxRates.id),
    );

  return rows.map((row) => ({
    snapshotId: `fx-rate:${row.id}`,
    sourceCurrency: row.sourceCurrency,
    rateToMxn: fromRateMicroMxn(row.rateMicroMxn),
    effectiveAt: toUtcDateOnly(row.effectiveDate),
  }));
}

export async function getFxRateActionFlagsForAdmin(params?: {
  windowDays?: number;
  staleAfterDays?: number;
  now?: Date;
}): Promise<FxRateActionFlags> {
  'use cache: remote';

  const now = params?.now ?? new Date();
  const windowDays = normalizeLimit(params?.windowDays, 30);
  cacheTag(
    adminPaymentsCacheTags.fxActionFlags,
    withWindowTag(adminPaymentsCacheTags.fxActionFlags, windowDays),
  );
  cacheLife({ expire: 120 });

  const windowStart = subDays(now, windowDays - 1);
  const windowEnd = now;

  const coverageEvents = await loadFxCoverageEvents({
    windowStart,
    windowEnd,
  });
  const requiredEventDatesByCurrency = collectRequiredEventDatesByCurrency(coverageEvents);
  const checkedCurrencies = Object.keys(requiredEventDatesByCurrency);
  const ratesByCurrency = await loadRatesByCurrency(checkedCurrencies);

  return projectFxRateActionFlags({
    requiredEventDatesByCurrency,
    ratesByCurrency,
    now,
    staleAfterDays: params?.staleAfterDays,
  });
}

export async function upsertDailyFxRateForAdmin(params: {
  sourceCurrency: string;
  effectiveDate: Date;
  rateToMxn: number;
  reason: string;
  actorUserId: string;
  request?: {
    ipAddress?: string;
    userAgent?: string;
  };
}): Promise<DailyFxRateRecord> {
  const sourceCurrency = normalizeCurrency(params.sourceCurrency);
  if (!sourceCurrency || sourceCurrency === FX_TARGET_CURRENCY) {
    throw new Error('Invalid source currency');
  }

  if (!(params.effectiveDate instanceof Date) || Number.isNaN(params.effectiveDate.getTime())) {
    throw new Error('Invalid effective date');
  }

  const normalizedReason = params.reason.trim();
  if (normalizedReason.length < 3) {
    throw new Error('Reason must be at least 3 characters');
  }

  const normalizedEffectiveDate = toUtcDateOnly(params.effectiveDate);
  const rateMicroMxn = toRateMicroMxn(params.rateToMxn);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(paymentFxRates)
      .where(
        and(
          eq(paymentFxRates.sourceCurrency, sourceCurrency),
          eq(paymentFxRates.quoteCurrency, FX_TARGET_CURRENCY),
          eq(paymentFxRates.effectiveDate, normalizedEffectiveDate),
        ),
      )
      .limit(1);

    const [persisted] = existing
      ? await tx
          .update(paymentFxRates)
          .set({
            rateMicroMxn,
            updatedReason: normalizedReason,
            updatedByUserId: params.actorUserId,
            updatedAt: new Date(),
          })
          .where(eq(paymentFxRates.id, existing.id))
          .returning()
      : await tx
          .insert(paymentFxRates)
          .values({
            sourceCurrency,
            quoteCurrency: FX_TARGET_CURRENCY,
            effectiveDate: normalizedEffectiveDate,
            rateMicroMxn,
            updatedReason: normalizedReason,
            updatedByUserId: params.actorUserId,
          })
          .returning();

    const auditResult = await createAuditLog(
      {
        organizationId: null,
        actorUserId: params.actorUserId,
        action: 'policy.update',
        entityType: 'payment_fx_rate',
        entityId: persisted.id,
        before: existing
          ? {
              sourceCurrency: existing.sourceCurrency,
              effectiveDate: toUtcDateKey(existing.effectiveDate),
              rateMicroMxn: existing.rateMicroMxn,
              updatedReason: existing.updatedReason,
            }
          : undefined,
        after: {
          sourceCurrency: persisted.sourceCurrency,
          effectiveDate: toUtcDateKey(persisted.effectiveDate),
          rateMicroMxn: persisted.rateMicroMxn,
          rateToMxn: fromRateMicroMxn(persisted.rateMicroMxn),
          reason: normalizedReason,
        },
        request: params.request,
      },
      tx,
    );

    if (!auditResult.ok) {
      throw new Error(auditResult.error ?? 'Failed to create audit log');
    }

    return mapDailyFxRateRow(persisted);
  });
}
