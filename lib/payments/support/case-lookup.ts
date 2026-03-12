'server only';

import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';

import { db } from '@/db';
import {
  moneyCommandIngestions,
  moneyEvents,
  moneyTraces,
  payoutQuotes,
  payoutRequests,
} from '@/db/schema';

const DEFAULT_LOOKUP_LIMIT = 20;
const LOOKUP_SCAN_LIMIT = 80;

export const financialCaseMatchSources = [
  'trace_id',
  'root_entity_id',
  'event_entity_id',
  'event_idempotency_key',
  'command_trace_id',
  'command_idempotency_key',
  'payout_request_id',
  'payout_quote_id',
  'payout_quote_idempotency_key',
] as const;

export type FinancialCaseMatchSource = (typeof financialCaseMatchSources)[number];

export type FinancialCaseMatchEvidence = {
  traceId: string;
  identifier: string;
  source: FinancialCaseMatchSource;
};

export type FinancialCaseLookupCase = {
  traceId: string;
  organizerId: string | null;
  rootEntityType: string;
  rootEntityId: string;
  eventCount: number;
  firstOccurredAt: Date | null;
  lastOccurredAt: Date | null;
  matchedIdentifiers: string[];
  matchSources: FinancialCaseMatchSource[];
};

export type FinancialCaseDisambiguationGroup = {
  normalizedIdentifier: string;
  displayIdentifier: string;
  traceIds: string[];
  reason: string;
};

export type FinancialCaseLookupResult = {
  query: string;
  normalizedQuery: string;
  totalCaseCount: number;
  returnedCaseCount: number;
  resultLimit: number;
  isResultLimitApplied: boolean;
  cases: FinancialCaseLookupCase[];
  disambiguationGroups: FinancialCaseDisambiguationGroup[];
};

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.trunc(value);
}

function normalizeIdentifierValue(value: string): string {
  return value.trim();
}

export function normalizeFinancialCaseLookupQuery(value: string): string {
  return normalizeIdentifierValue(value).toLowerCase();
}

function redactIdentifier(value: string): string {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export function applyRoleMetadataPolicy(params: {
  value: FinancialCaseLookupCase;
  includeSensitiveMetadata: boolean;
}): FinancialCaseLookupCase {
  if (params.includeSensitiveMetadata) {
    return params.value;
  }

  return {
    ...params.value,
    organizerId: params.value.organizerId ? redactIdentifier(params.value.organizerId) : null,
    rootEntityId: redactIdentifier(params.value.rootEntityId),
    matchedIdentifiers: params.value.matchedIdentifiers.map(redactIdentifier),
  };
}

function dedupeEvidence(entries: FinancialCaseMatchEvidence[]): FinancialCaseMatchEvidence[] {
  const seen = new Set<string>();
  const unique: FinancialCaseMatchEvidence[] = [];

  for (const entry of entries) {
    const identifier = normalizeIdentifierValue(entry.identifier);
    if (!identifier) continue;

    const key = `${entry.traceId}|${entry.source}|${identifier.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    unique.push({
      ...entry,
      identifier,
    });
  }

  return unique;
}

export function projectFinancialCaseDisambiguationGroups(
  evidence: FinancialCaseMatchEvidence[],
): FinancialCaseDisambiguationGroup[] {
  const byIdentifier = new Map<string, { displayIdentifier: string; traceIds: Set<string> }>();

  for (const entry of evidence) {
    const normalizedIdentifier = normalizeFinancialCaseLookupQuery(entry.identifier);
    if (!normalizedIdentifier) continue;

    if (!byIdentifier.has(normalizedIdentifier)) {
      byIdentifier.set(normalizedIdentifier, {
        displayIdentifier: normalizeIdentifierValue(entry.identifier),
        traceIds: new Set<string>(),
      });
    }

    byIdentifier.get(normalizedIdentifier)!.traceIds.add(entry.traceId);
  }

  const groups: FinancialCaseDisambiguationGroup[] = [];
  for (const [normalizedIdentifier, context] of byIdentifier.entries()) {
    const traceIds = Array.from(context.traceIds).sort((left, right) => left.localeCompare(right));
    if (traceIds.length <= 1) continue;

    groups.push({
      normalizedIdentifier,
      displayIdentifier: context.displayIdentifier,
      traceIds,
      reason: `${traceIds.length} traces matched this identifier`,
    });
  }

  return groups.sort((left, right) =>
    left.normalizedIdentifier.localeCompare(right.normalizedIdentifier),
  );
}

function looksLikeUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function containsNormalized(haystack: string | null, normalizedNeedle: string): boolean {
  if (!haystack) return false;
  return haystack.toLowerCase().includes(normalizedNeedle);
}

function dateLikeToEpoch(value: Date | string | null | undefined): number {
  if (!value) return 0;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  const normalized = new Date(value);
  return Number.isNaN(normalized.getTime()) ? 0 : normalized.getTime();
}

export async function lookupFinancialCases(params: {
  query: string;
  limit?: number;
  includeSensitiveMetadata?: boolean;
}): Promise<FinancialCaseLookupResult> {
  const rawQuery = normalizeIdentifierValue(params.query);
  const normalizedQuery = normalizeFinancialCaseLookupQuery(params.query);
  const limit = normalizeLimit(params.limit, DEFAULT_LOOKUP_LIMIT);
  const includeSensitiveMetadata = params.includeSensitiveMetadata ?? false;

  if (!normalizedQuery) {
    return {
      query: rawQuery,
      normalizedQuery,
      totalCaseCount: 0,
      returnedCaseCount: 0,
      resultLimit: limit,
      isResultLimitApplied: false,
      cases: [],
      disambiguationGroups: [],
    };
  }

  const likePattern = `%${rawQuery}%`;
  const maxScan = Math.max(limit * 4, LOOKUP_SCAN_LIMIT);

  const [traceRows, eventRows, commandRows, quoteRows] = await Promise.all([
    db
      .select({
        traceId: moneyTraces.traceId,
        rootEntityId: moneyTraces.rootEntityId,
      })
      .from(moneyTraces)
      .where(or(ilike(moneyTraces.traceId, likePattern), ilike(moneyTraces.rootEntityId, likePattern)))
      .orderBy(desc(moneyTraces.createdAt))
      .limit(maxScan),
    db
      .select({
        traceId: moneyEvents.traceId,
        entityId: moneyEvents.entityId,
        idempotencyKey: moneyEvents.idempotencyKey,
      })
      .from(moneyEvents)
      .where(
        or(
          ilike(moneyEvents.traceId, likePattern),
          ilike(moneyEvents.entityId, likePattern),
          ilike(moneyEvents.idempotencyKey, likePattern),
        ),
      )
      .orderBy(desc(moneyEvents.occurredAt), desc(moneyEvents.createdAt))
      .limit(maxScan),
    db
      .select({
        traceId: moneyCommandIngestions.traceId,
        idempotencyKey: moneyCommandIngestions.idempotencyKey,
      })
      .from(moneyCommandIngestions)
      .where(
        or(
          ilike(moneyCommandIngestions.traceId, likePattern),
          ilike(moneyCommandIngestions.idempotencyKey, likePattern),
        ),
      )
      .orderBy(desc(moneyCommandIngestions.lastSeenAt))
      .limit(maxScan),
    db
      .select({
        traceId: payoutRequests.traceId,
        payoutRequestId: payoutRequests.id,
        payoutQuoteId: payoutQuotes.id,
        payoutQuoteIdempotencyKey: payoutQuotes.idempotencyKey,
      })
      .from(payoutRequests)
      .innerJoin(payoutQuotes, eq(payoutRequests.payoutQuoteId, payoutQuotes.id))
      .where(
        and(
          isNull(payoutRequests.deletedAt),
          isNull(payoutQuotes.deletedAt),
          or(
            sql`${payoutRequests.id}::text ILIKE ${likePattern}`,
            sql`${payoutRequests.payoutQuoteId}::text ILIKE ${likePattern}`,
            ilike(payoutQuotes.idempotencyKey, likePattern),
          ),
        ),
      )
      .orderBy(desc(payoutRequests.requestedAt), desc(payoutRequests.createdAt))
      .limit(maxScan),
  ]);

  const evidence: FinancialCaseMatchEvidence[] = [];

  for (const row of traceRows) {
    if (containsNormalized(row.traceId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.traceId,
        source: 'trace_id',
      });
    }

    if (containsNormalized(row.rootEntityId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.rootEntityId,
        source: 'root_entity_id',
      });
    }
  }

  for (const row of eventRows) {
    if (containsNormalized(row.entityId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.entityId,
        source: 'event_entity_id',
      });
    }

    if (containsNormalized(row.idempotencyKey ?? null, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.idempotencyKey!,
        source: 'event_idempotency_key',
      });
    }

    if (containsNormalized(row.traceId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.traceId,
        source: 'trace_id',
      });
    }
  }

  for (const row of commandRows) {
    if (containsNormalized(row.traceId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.traceId,
        source: 'command_trace_id',
      });
    }

    if (containsNormalized(row.idempotencyKey, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.idempotencyKey,
        source: 'command_idempotency_key',
      });
    }
  }

  for (const row of quoteRows) {
    if (containsNormalized(row.payoutRequestId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.payoutRequestId,
        source: 'payout_request_id',
      });
    }

    if (containsNormalized(row.payoutQuoteId, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.payoutQuoteId,
        source: 'payout_quote_id',
      });
    }

    if (containsNormalized(row.payoutQuoteIdempotencyKey, normalizedQuery)) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.payoutQuoteIdempotencyKey,
        source: 'payout_quote_idempotency_key',
      });
    }
  }

  if (looksLikeUuid(rawQuery)) {
    const [exactPayoutRequestRows, exactPayoutQuoteRows] = await Promise.all([
      db
        .select({
          traceId: payoutRequests.traceId,
          payoutRequestId: payoutRequests.id,
        })
        .from(payoutRequests)
        .where(and(eq(payoutRequests.id, rawQuery), isNull(payoutRequests.deletedAt)))
        .limit(maxScan),
      db
        .select({
          traceId: payoutRequests.traceId,
          payoutQuoteId: payoutRequests.payoutQuoteId,
        })
        .from(payoutRequests)
        .where(and(eq(payoutRequests.payoutQuoteId, rawQuery), isNull(payoutRequests.deletedAt)))
        .limit(maxScan),
    ]);

    for (const row of exactPayoutRequestRows) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.payoutRequestId,
        source: 'payout_request_id',
      });
    }

    for (const row of exactPayoutQuoteRows) {
      evidence.push({
        traceId: row.traceId,
        identifier: row.payoutQuoteId,
        source: 'payout_quote_id',
      });
    }
  }

  const dedupedEvidence = dedupeEvidence(evidence);
  const matchedTraceIds = Array.from(new Set(dedupedEvidence.map((entry) => entry.traceId)));

  if (matchedTraceIds.length === 0) {
    return {
      query: rawQuery,
      normalizedQuery,
      totalCaseCount: 0,
      returnedCaseCount: 0,
      resultLimit: limit,
      isResultLimitApplied: false,
      cases: [],
      disambiguationGroups: [],
    };
  }

  const [traceDetailsRows, eventAggregateRows] = await Promise.all([
    db
      .select({
        traceId: moneyTraces.traceId,
        organizerId: moneyTraces.organizerId,
        rootEntityType: moneyTraces.rootEntityType,
        rootEntityId: moneyTraces.rootEntityId,
        createdAt: moneyTraces.createdAt,
      })
      .from(moneyTraces)
      .where(inArray(moneyTraces.traceId, matchedTraceIds))
      .orderBy(desc(moneyTraces.createdAt))
      .limit(Math.max(limit, matchedTraceIds.length)),
    db
      .select({
        traceId: moneyEvents.traceId,
        eventCount: sql<number>`count(*)::int`,
        firstOccurredAt: sql<Date | null>`min(${moneyEvents.occurredAt})`,
        lastOccurredAt: sql<Date | null>`max(${moneyEvents.occurredAt})`,
      })
      .from(moneyEvents)
      .where(inArray(moneyEvents.traceId, matchedTraceIds))
      .groupBy(moneyEvents.traceId),
  ]);

  const aggregateByTraceId = new Map(
    eventAggregateRows.map((row) => [
      row.traceId,
      {
        eventCount: row.eventCount,
        firstOccurredAt: row.firstOccurredAt,
        lastOccurredAt: row.lastOccurredAt,
      },
    ]),
  );

  const evidenceByTraceId = new Map<string, FinancialCaseMatchEvidence[]>();
  for (const row of dedupedEvidence) {
    if (!evidenceByTraceId.has(row.traceId)) {
      evidenceByTraceId.set(row.traceId, []);
    }
    evidenceByTraceId.get(row.traceId)!.push(row);
  }

  const totalCaseCount = traceDetailsRows.length;
  const cases: FinancialCaseLookupCase[] = traceDetailsRows
    .map((row) => {
      const aggregate = aggregateByTraceId.get(row.traceId);
      const traceEvidence = evidenceByTraceId.get(row.traceId) ?? [];
      const matchedIdentifiers = Array.from(
        new Set(traceEvidence.map((entry) => normalizeIdentifierValue(entry.identifier))),
      ).sort((left, right) => left.localeCompare(right));
      const matchSources = Array.from(new Set(traceEvidence.map((entry) => entry.source))).sort(
        (left, right) => left.localeCompare(right),
      ) as FinancialCaseMatchSource[];

      return {
        traceId: row.traceId,
        organizerId: row.organizerId ?? null,
        rootEntityType: row.rootEntityType,
        rootEntityId: row.rootEntityId,
        eventCount: aggregate?.eventCount ?? 0,
        firstOccurredAt: aggregate?.firstOccurredAt ?? null,
        lastOccurredAt: aggregate?.lastOccurredAt ?? null,
        matchedIdentifiers,
        matchSources,
      };
    })
    .sort((left, right) => {
      const leftTime = dateLikeToEpoch(left.lastOccurredAt);
      const rightTime = dateLikeToEpoch(right.lastOccurredAt);
      if (leftTime !== rightTime) return rightTime - leftTime;
      return left.traceId.localeCompare(right.traceId);
    })
    .slice(0, limit)
    .map((row) =>
      applyRoleMetadataPolicy({
        value: row,
        includeSensitiveMetadata,
      }),
    );

  const disambiguationGroups = projectFinancialCaseDisambiguationGroups(dedupedEvidence).map(
    (group) => ({
      ...group,
      displayIdentifier: includeSensitiveMetadata
        ? group.displayIdentifier
        : redactIdentifier(group.displayIdentifier),
    }),
  );

  return {
    query: rawQuery,
    normalizedQuery,
    totalCaseCount,
    returnedCaseCount: cases.length,
    resultLimit: limit,
    isResultLimitApplied: totalCaseCount > cases.length,
    cases,
    disambiguationGroups,
  };
}
