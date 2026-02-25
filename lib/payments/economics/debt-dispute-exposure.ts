'server only';

import { subDays } from 'date-fns';
import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@/db';
import { eventEditions, eventSeries, moneyEvents, organizations, registrations } from '@/db/schema';

const DEFAULT_CURRENCY = 'MXN';
const UNSCOPED_EVENT_ID = 'unscoped';
const UNSCOPED_ORGANIZER_ID = 'unscoped';

const exposureRelevantEventNames = [
  'dispute.opened',
  'dispute.funds_released',
  'dispute.debt_posted',
  'debt_control.pause_required',
  'debt_control.resume_allowed',
] as const;

type ExposureRelevantEventName = (typeof exposureRelevantEventNames)[number];

export type DebtDisputeExposureProjectionEvent = {
  traceId: string;
  organizerId: string | null;
  eventName: ExposureRelevantEventName;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
  entityType: string;
  entityId: string;
};

export type DebtDisputeExposureCurrencyMetric = {
  currency: string;
  openDisputeAtRiskMinor: number;
  debtPostedMinor: number;
  exposureScoreMinor: number;
};

export type DebtDisputeExposureTraceability = {
  distinctTraceCount: number;
  distinctDisputeCaseCount: number;
  sampleTraceIds: string[];
  sampleDisputeCaseIds: string[];
};

export type DebtDisputeOrganizerExposureRow = {
  organizerId: string;
  organizerLabel: string;
  openDisputeCaseCount: number;
  pauseRequiredCount: number;
  resumeAllowedCount: number;
  headlineCurrency: string;
  headlineOpenDisputeAtRiskMinor: number;
  headlineDebtPostedMinor: number;
  headlineExposureScoreMinor: number;
  currencies: DebtDisputeExposureCurrencyMetric[];
  traceability: DebtDisputeExposureTraceability;
};

export type DebtDisputeEventExposureRow = {
  eventEditionId: string | null;
  eventLabel: string;
  openDisputeCaseCount: number;
  pauseRequiredCount: number;
  resumeAllowedCount: number;
  headlineCurrency: string;
  headlineOpenDisputeAtRiskMinor: number;
  headlineDebtPostedMinor: number;
  headlineExposureScoreMinor: number;
  currencies: DebtDisputeExposureCurrencyMetric[];
  traceability: DebtDisputeExposureTraceability;
};

export type DebtDisputeExposureTotals = {
  openDisputeCaseCount: number;
  pauseRequiredCount: number;
  resumeAllowedCount: number;
  headlineCurrency: string;
  headlineOpenDisputeAtRiskMinor: number;
  headlineDebtPostedMinor: number;
  headlineExposureScoreMinor: number;
  currencies: DebtDisputeExposureCurrencyMetric[];
};

export type DebtDisputeExposureMetrics = {
  asOf: Date;
  windowStart: Date;
  windowEnd: Date;
  totals: DebtDisputeExposureTotals;
  organizers: DebtDisputeOrganizerExposureRow[];
  events: DebtDisputeEventExposureRow[];
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

type GroupAccumulator = {
  id: string;
  label: string;
  openDisputeCaseIds: Set<string>;
  pauseRequiredCount: number;
  resumeAllowedCount: number;
  openDisputeAtRiskByCurrency: Map<string, number>;
  debtPostedByCurrency: Map<string, number>;
  traceIds: Set<string>;
  disputeCaseIds: Set<string>;
};

type DisputeCaseState = {
  disputeCaseId: string;
  organizerId: string;
  eventEditionId: string;
  outstandingCurrency: string;
  outstandingAtRiskMinor: number;
  traceIds: Set<string>;
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

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result = value
    .map((item) => readString(item))
    .filter((item): item is string => item !== null);
  return Array.from(new Set(result)).sort((left, right) => left.localeCompare(right));
}

function readOrganizerId(event: DebtDisputeExposureProjectionEvent): string {
  const fromPayload = readString(event.payloadJson.organizerId);
  return event.organizerId ?? fromPayload ?? UNSCOPED_ORGANIZER_ID;
}

function readDisputeCaseId(event: DebtDisputeExposureProjectionEvent): string | null {
  const fromPayload = readString(event.payloadJson.disputeCaseId);
  if (fromPayload) return fromPayload;
  if (event.entityType === 'dispute') {
    return readString(event.entityId);
  }
  return null;
}

function readRegistrationId(event: DebtDisputeExposureProjectionEvent): string | null {
  return readString(event.payloadJson.registrationId);
}

function readAffectedEditionIds(event: DebtDisputeExposureProjectionEvent): string[] {
  return readStringArray(event.payloadJson.affectedEditionIds);
}

function sortEventsForProjection(
  events: DebtDisputeExposureProjectionEvent[],
): DebtDisputeExposureProjectionEvent[] {
  return [...events].sort((left, right) => {
    const occurredAtDiff = left.occurredAt.getTime() - right.occurredAt.getTime();
    if (occurredAtDiff !== 0) return occurredAtDiff;

    const traceDiff = left.traceId.localeCompare(right.traceId);
    if (traceDiff !== 0) return traceDiff;

    const eventNameDiff = left.eventName.localeCompare(right.eventName);
    if (eventNameDiff !== 0) return eventNameDiff;

    const entityDiff = left.entityId.localeCompare(right.entityId);
    if (entityDiff !== 0) return entityDiff;

    return left.entityType.localeCompare(right.entityType);
  });
}

function createGroupAccumulator(params: {
  id: string;
  label: string;
}): GroupAccumulator {
  return {
    id: params.id,
    label: params.label,
    openDisputeCaseIds: new Set<string>(),
    pauseRequiredCount: 0,
    resumeAllowedCount: 0,
    openDisputeAtRiskByCurrency: new Map<string, number>(),
    debtPostedByCurrency: new Map<string, number>(),
    traceIds: new Set<string>(),
    disputeCaseIds: new Set<string>(),
  };
}

function getOrCreateGroup(
  groups: Map<string, GroupAccumulator>,
  params: { id: string; label: string },
): GroupAccumulator {
  const existing = groups.get(params.id);
  if (existing) return existing;

  const created = createGroupAccumulator(params);
  groups.set(params.id, created);
  return created;
}

function addMinorAmount(map: Map<string, number>, currency: string, amountMinor: number): void {
  if (!Number.isFinite(amountMinor)) return;
  const normalizedAmount = Math.trunc(amountMinor);
  if (normalizedAmount <= 0) return;

  map.set(currency, (map.get(currency) ?? 0) + normalizedAmount);
}

function readHeadlineCurrency(
  currencies: DebtDisputeExposureCurrencyMetric[],
): DebtDisputeExposureCurrencyMetric {
  if (currencies.length === 0) {
    return {
      currency: DEFAULT_CURRENCY,
      openDisputeAtRiskMinor: 0,
      debtPostedMinor: 0,
      exposureScoreMinor: 0,
    };
  }

  const preferredMxn = currencies.find((entry) => entry.currency === DEFAULT_CURRENCY);
  if (preferredMxn) return preferredMxn;

  return [...currencies].sort((left, right) => {
    const exposureDiff = Math.abs(right.exposureScoreMinor) - Math.abs(left.exposureScoreMinor);
    if (exposureDiff !== 0) return exposureDiff;
    return left.currency.localeCompare(right.currency);
  })[0]!;
}

function buildCurrencyMetrics(params: {
  openDisputeAtRiskByCurrency: Map<string, number>;
  debtPostedByCurrency: Map<string, number>;
}): DebtDisputeExposureCurrencyMetric[] {
  const currencies = new Set<string>([
    ...params.openDisputeAtRiskByCurrency.keys(),
    ...params.debtPostedByCurrency.keys(),
  ]);

  return Array.from(currencies)
    .sort((left, right) => left.localeCompare(right))
    .map((currency) => {
      const openDisputeAtRiskMinor = params.openDisputeAtRiskByCurrency.get(currency) ?? 0;
      const debtPostedMinor = params.debtPostedByCurrency.get(currency) ?? 0;
      return {
        currency,
        openDisputeAtRiskMinor,
        debtPostedMinor,
        exposureScoreMinor: openDisputeAtRiskMinor + debtPostedMinor,
      };
    });
}

function buildTraceability(params: {
  traceIds: Set<string>;
  disputeCaseIds: Set<string>;
  sampleTraceLimit: number;
  sampleCaseLimit: number;
}): DebtDisputeExposureTraceability {
  const sortedTraceIds = Array.from(params.traceIds).sort((left, right) =>
    left.localeCompare(right),
  );
  const sortedDisputeCaseIds = Array.from(params.disputeCaseIds).sort((left, right) =>
    left.localeCompare(right),
  );

  return {
    distinctTraceCount: sortedTraceIds.length,
    distinctDisputeCaseCount: sortedDisputeCaseIds.length,
    sampleTraceIds: sortedTraceIds.slice(0, params.sampleTraceLimit),
    sampleDisputeCaseIds: sortedDisputeCaseIds.slice(0, params.sampleCaseLimit),
  };
}

function resolveEventEditionIds(params: {
  event: DebtDisputeExposureProjectionEvent;
  registrationToEditionId: Record<string, string>;
  fallbackEventEditionId: string | null;
}): string[] {
  const ids = new Set<string>();
  const registrationId = readRegistrationId(params.event);
  if (registrationId) {
    const editionId = params.registrationToEditionId[registrationId];
    if (editionId) {
      ids.add(editionId);
    }
  }

  for (const editionId of readAffectedEditionIds(params.event)) {
    ids.add(editionId);
  }

  if (ids.size === 0 && params.fallbackEventEditionId) {
    ids.add(params.fallbackEventEditionId);
  }

  if (ids.size === 0) {
    ids.add(UNSCOPED_EVENT_ID);
  }

  return Array.from(ids).sort((left, right) => left.localeCompare(right));
}

function resolveOrganizerLabel(
  organizerId: string,
  organizerLabels: Record<string, string>,
): string {
  if (organizerId === UNSCOPED_ORGANIZER_ID) {
    return 'Unscoped organizer';
  }

  return organizerLabels[organizerId] ?? organizerId;
}

function resolveEventLabel(eventEditionId: string, eventLabels: Record<string, string>): string {
  if (eventEditionId === UNSCOPED_EVENT_ID) {
    return 'Unscoped event';
  }

  return eventLabels[eventEditionId] ?? eventEditionId;
}

function normalizeLimit(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.trunc(value);
}

function collectRegistrationToEditionId(params: {
  events: DebtDisputeExposureProjectionEvent[];
  registrationToEditionId: Record<string, string>;
}): Set<string> {
  const editionIds = new Set<string>();
  for (const event of params.events) {
    const registrationId = readRegistrationId(event);
    if (!registrationId) continue;

    const editionId = params.registrationToEditionId[registrationId];
    if (!editionId) continue;
    editionIds.add(editionId);
  }

  return editionIds;
}

export function projectDebtDisputeExposureMetrics(params: {
  events: DebtDisputeExposureProjectionEvent[];
  windowStart: Date;
  windowEnd: Date;
  organizerLabels?: Record<string, string>;
  eventLabels?: Record<string, string>;
  registrationToEditionId?: Record<string, string>;
  asOf?: Date;
  sampleTraceLimit?: number;
  sampleCaseLimit?: number;
}): DebtDisputeExposureMetrics {
  const orderedEvents = sortEventsForProjection(params.events);
  const organizerLabels = params.organizerLabels ?? {};
  const eventLabels = params.eventLabels ?? {};
  const registrationToEditionId = params.registrationToEditionId ?? {};
  const sampleTraceLimit = normalizeLimit(params.sampleTraceLimit, 5);
  const sampleCaseLimit = normalizeLimit(params.sampleCaseLimit, 5);

  const organizerGroups = new Map<string, GroupAccumulator>();
  const eventGroups = new Map<string, GroupAccumulator>();
  const disputeCaseStates = new Map<string, DisputeCaseState>();
  const globalTraceIds = new Set<string>();
  const globalDebtPostedByCurrency = new Map<string, number>();

  for (const event of orderedEvents) {
    globalTraceIds.add(event.traceId);

    const organizerId = readOrganizerId(event);
    const disputeCaseId = readDisputeCaseId(event);
    const existingCaseState = disputeCaseId ? disputeCaseStates.get(disputeCaseId) ?? null : null;
    const eventEditionIds = resolveEventEditionIds({
      event,
      registrationToEditionId,
      fallbackEventEditionId: existingCaseState?.eventEditionId ?? null,
    });

    const organizerGroup = getOrCreateGroup(organizerGroups, {
      id: organizerId,
      label: resolveOrganizerLabel(organizerId, organizerLabels),
    });
    organizerGroup.traceIds.add(event.traceId);
    if (disputeCaseId) {
      organizerGroup.disputeCaseIds.add(disputeCaseId);
    }

    const scopedEventGroups = eventEditionIds.map((eventEditionId) => {
      const group = getOrCreateGroup(eventGroups, {
        id: eventEditionId,
        label: resolveEventLabel(eventEditionId, eventLabels),
      });
      group.traceIds.add(event.traceId);
      if (disputeCaseId) {
        group.disputeCaseIds.add(disputeCaseId);
      }
      return group;
    });

    if (event.eventName === 'debt_control.pause_required') {
      organizerGroup.pauseRequiredCount += 1;
      for (const group of scopedEventGroups) {
        group.pauseRequiredCount += 1;
      }
    }

    if (event.eventName === 'debt_control.resume_allowed') {
      organizerGroup.resumeAllowedCount += 1;
      for (const group of scopedEventGroups) {
        group.resumeAllowedCount += 1;
      }
    }

    if (event.eventName === 'dispute.debt_posted') {
      const debtAmount = readCanonicalMoneyAmount(event.payloadJson, 'debtAmount');
      if (debtAmount && debtAmount.amountMinor > 0) {
        addMinorAmount(
          organizerGroup.debtPostedByCurrency,
          debtAmount.currency,
          debtAmount.amountMinor,
        );
        addMinorAmount(globalDebtPostedByCurrency, debtAmount.currency, debtAmount.amountMinor);
        for (const group of scopedEventGroups) {
          addMinorAmount(group.debtPostedByCurrency, debtAmount.currency, debtAmount.amountMinor);
        }
      }
    }

    if (!disputeCaseId) {
      continue;
    }

    const primaryEventEditionId = eventEditionIds[0] ?? UNSCOPED_EVENT_ID;
    const caseState = existingCaseState ?? {
      disputeCaseId,
      organizerId,
      eventEditionId: primaryEventEditionId,
      outstandingCurrency: DEFAULT_CURRENCY,
      outstandingAtRiskMinor: 0,
      traceIds: new Set<string>(),
    };

    if (caseState.organizerId === UNSCOPED_ORGANIZER_ID && organizerId !== UNSCOPED_ORGANIZER_ID) {
      caseState.organizerId = organizerId;
    }
    if (caseState.eventEditionId === UNSCOPED_EVENT_ID && primaryEventEditionId !== UNSCOPED_EVENT_ID) {
      caseState.eventEditionId = primaryEventEditionId;
    }
    caseState.traceIds.add(event.traceId);

    if (event.eventName === 'dispute.opened') {
      const amountAtRisk = readCanonicalMoneyAmount(event.payloadJson, 'amountAtRisk');
      if (amountAtRisk && amountAtRisk.amountMinor > 0) {
        caseState.outstandingCurrency = amountAtRisk.currency;
        caseState.outstandingAtRiskMinor += amountAtRisk.amountMinor;
      }
    }

    if (event.eventName === 'dispute.funds_released') {
      const amountReleased = readCanonicalMoneyAmount(event.payloadJson, 'amountReleased');
      if (amountReleased && amountReleased.amountMinor > 0) {
        caseState.outstandingCurrency = amountReleased.currency;
        caseState.outstandingAtRiskMinor = Math.max(
          caseState.outstandingAtRiskMinor - amountReleased.amountMinor,
          0,
        );
      }
    }

    disputeCaseStates.set(disputeCaseId, caseState);
  }

  const globalOpenDisputeAtRiskByCurrency = new Map<string, number>();
  const globalOpenDisputeCaseIds = new Set<string>();

  for (const caseState of disputeCaseStates.values()) {
    if (caseState.outstandingAtRiskMinor <= 0) continue;

    globalOpenDisputeCaseIds.add(caseState.disputeCaseId);
    addMinorAmount(
      globalOpenDisputeAtRiskByCurrency,
      caseState.outstandingCurrency,
      caseState.outstandingAtRiskMinor,
    );

    const organizerGroup = getOrCreateGroup(organizerGroups, {
      id: caseState.organizerId,
      label: resolveOrganizerLabel(caseState.organizerId, organizerLabels),
    });
    organizerGroup.openDisputeCaseIds.add(caseState.disputeCaseId);
    organizerGroup.disputeCaseIds.add(caseState.disputeCaseId);
    for (const traceId of caseState.traceIds) {
      organizerGroup.traceIds.add(traceId);
    }
    addMinorAmount(
      organizerGroup.openDisputeAtRiskByCurrency,
      caseState.outstandingCurrency,
      caseState.outstandingAtRiskMinor,
    );

    const eventGroup = getOrCreateGroup(eventGroups, {
      id: caseState.eventEditionId,
      label: resolveEventLabel(caseState.eventEditionId, eventLabels),
    });
    eventGroup.openDisputeCaseIds.add(caseState.disputeCaseId);
    eventGroup.disputeCaseIds.add(caseState.disputeCaseId);
    for (const traceId of caseState.traceIds) {
      eventGroup.traceIds.add(traceId);
    }
    addMinorAmount(
      eventGroup.openDisputeAtRiskByCurrency,
      caseState.outstandingCurrency,
      caseState.outstandingAtRiskMinor,
    );
  }

  const organizerRows = Array.from(organizerGroups.values())
    .map((group) => {
      const currencies = buildCurrencyMetrics({
        openDisputeAtRiskByCurrency: group.openDisputeAtRiskByCurrency,
        debtPostedByCurrency: group.debtPostedByCurrency,
      });
      const headline = readHeadlineCurrency(currencies);

      return {
        organizerId: group.id === UNSCOPED_ORGANIZER_ID ? null : group.id,
        organizerLabel: group.label,
        openDisputeCaseCount: group.openDisputeCaseIds.size,
        pauseRequiredCount: group.pauseRequiredCount,
        resumeAllowedCount: group.resumeAllowedCount,
        headlineCurrency: headline.currency,
        headlineOpenDisputeAtRiskMinor: headline.openDisputeAtRiskMinor,
        headlineDebtPostedMinor: headline.debtPostedMinor,
        headlineExposureScoreMinor: headline.exposureScoreMinor,
        currencies,
        traceability: buildTraceability({
          traceIds: group.traceIds,
          disputeCaseIds: group.disputeCaseIds,
          sampleTraceLimit,
          sampleCaseLimit,
        }),
      };
    })
    .filter(
      (row) =>
        row.openDisputeCaseCount > 0 ||
        row.headlineExposureScoreMinor > 0 ||
        row.pauseRequiredCount > 0 ||
        row.resumeAllowedCount > 0,
    )
    .sort((left, right) => {
      const exposureDiff = right.headlineExposureScoreMinor - left.headlineExposureScoreMinor;
      if (exposureDiff !== 0) return exposureDiff;

      const openCaseDiff = right.openDisputeCaseCount - left.openDisputeCaseCount;
      if (openCaseDiff !== 0) return openCaseDiff;

      return left.organizerLabel.localeCompare(right.organizerLabel);
    })
    .map((row) => ({
      ...row,
      organizerId: row.organizerId ?? UNSCOPED_ORGANIZER_ID,
    }));

  const eventRows = Array.from(eventGroups.values())
    .map((group) => {
      const currencies = buildCurrencyMetrics({
        openDisputeAtRiskByCurrency: group.openDisputeAtRiskByCurrency,
        debtPostedByCurrency: group.debtPostedByCurrency,
      });
      const headline = readHeadlineCurrency(currencies);

      return {
        eventEditionId: group.id === UNSCOPED_EVENT_ID ? null : group.id,
        eventLabel: group.label,
        openDisputeCaseCount: group.openDisputeCaseIds.size,
        pauseRequiredCount: group.pauseRequiredCount,
        resumeAllowedCount: group.resumeAllowedCount,
        headlineCurrency: headline.currency,
        headlineOpenDisputeAtRiskMinor: headline.openDisputeAtRiskMinor,
        headlineDebtPostedMinor: headline.debtPostedMinor,
        headlineExposureScoreMinor: headline.exposureScoreMinor,
        currencies,
        traceability: buildTraceability({
          traceIds: group.traceIds,
          disputeCaseIds: group.disputeCaseIds,
          sampleTraceLimit,
          sampleCaseLimit,
        }),
      };
    })
    .filter(
      (row) =>
        row.openDisputeCaseCount > 0 ||
        row.headlineExposureScoreMinor > 0 ||
        row.pauseRequiredCount > 0 ||
        row.resumeAllowedCount > 0,
    )
    .sort((left, right) => {
      const exposureDiff = right.headlineExposureScoreMinor - left.headlineExposureScoreMinor;
      if (exposureDiff !== 0) return exposureDiff;

      const openCaseDiff = right.openDisputeCaseCount - left.openDisputeCaseCount;
      if (openCaseDiff !== 0) return openCaseDiff;

      return left.eventLabel.localeCompare(right.eventLabel);
    });

  const totalCurrencies = buildCurrencyMetrics({
    openDisputeAtRiskByCurrency: globalOpenDisputeAtRiskByCurrency,
    debtPostedByCurrency: globalDebtPostedByCurrency,
  });
  const totalHeadline = readHeadlineCurrency(totalCurrencies);

  const globalPauseRequiredCount = orderedEvents.filter(
    (event) => event.eventName === 'debt_control.pause_required',
  ).length;
  const globalResumeAllowedCount = orderedEvents.filter(
    (event) => event.eventName === 'debt_control.resume_allowed',
  ).length;

  const sampleTraceIds = Array.from(globalTraceIds)
    .sort((left, right) => left.localeCompare(right))
    .slice(0, sampleTraceLimit);

  return {
    asOf: params.asOf ?? params.windowEnd,
    windowStart: params.windowStart,
    windowEnd: params.windowEnd,
    totals: {
      openDisputeCaseCount: globalOpenDisputeCaseIds.size,
      pauseRequiredCount: globalPauseRequiredCount,
      resumeAllowedCount: globalResumeAllowedCount,
      headlineCurrency: totalHeadline.currency,
      headlineOpenDisputeAtRiskMinor: totalHeadline.openDisputeAtRiskMinor,
      headlineDebtPostedMinor: totalHeadline.debtPostedMinor,
      headlineExposureScoreMinor: totalHeadline.exposureScoreMinor,
      currencies: totalCurrencies,
    },
    organizers: organizerRows,
    events: eventRows,
    traceability: {
      windowStart: params.windowStart,
      windowEnd: params.windowEnd,
      eventCount: orderedEvents.length,
      distinctTraceCount: globalTraceIds.size,
      firstOccurredAt: orderedEvents[0]?.occurredAt ?? null,
      lastOccurredAt: orderedEvents[orderedEvents.length - 1]?.occurredAt ?? null,
      sampleTraceIds,
    },
  };
}

async function loadExposureEvents(params: {
  windowStart: Date;
  windowEnd: Date;
}): Promise<DebtDisputeExposureProjectionEvent[]> {
  const rows = await db
    .select({
      traceId: moneyEvents.traceId,
      organizerId: moneyEvents.organizerId,
      eventName: moneyEvents.eventName,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
      entityType: moneyEvents.entityType,
      entityId: moneyEvents.entityId,
    })
    .from(moneyEvents)
    .where(
      and(
        inArray(moneyEvents.eventName, exposureRelevantEventNames),
        gte(moneyEvents.occurredAt, params.windowStart),
        lte(moneyEvents.occurredAt, params.windowEnd),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt), asc(moneyEvents.id));

  return rows.map((row) => ({
    traceId: row.traceId,
    organizerId: row.organizerId,
    eventName: row.eventName as ExposureRelevantEventName,
    occurredAt: row.occurredAt,
    payloadJson: row.payloadJson,
    entityType: row.entityType,
    entityId: row.entityId,
  }));
}

function buildEventLabel(params: {
  seriesName: string;
  editionLabel: string;
}): string {
  const seriesName = params.seriesName.trim();
  const editionLabel = params.editionLabel.trim();
  if (!seriesName) return editionLabel || 'Unnamed event';
  if (!editionLabel) return seriesName;
  return `${seriesName} ${editionLabel}`;
}

export async function getAdminDebtDisputeExposureMetrics(params?: {
  days?: number;
  now?: Date;
}): Promise<DebtDisputeExposureMetrics> {
  const now = params?.now ?? new Date();
  const days =
    typeof params?.days === 'number' && Number.isFinite(params.days) && params.days > 0
      ? Math.trunc(params.days)
      : 30;

  const windowStart = subDays(now, days - 1);
  const windowEnd = now;

  const events = await loadExposureEvents({
    windowStart,
    windowEnd,
  });

  const organizerIds = new Set<string>();
  const registrationIds = new Set<string>();
  const explicitEditionIds = new Set<string>();

  for (const event of events) {
    const organizerId = readOrganizerId(event);
    if (organizerId !== UNSCOPED_ORGANIZER_ID) {
      organizerIds.add(organizerId);
    }

    const registrationId = readRegistrationId(event);
    if (registrationId) {
      registrationIds.add(registrationId);
    }

    for (const editionId of readAffectedEditionIds(event)) {
      explicitEditionIds.add(editionId);
    }
  }

  const registrationToEditionId: Record<string, string> = {};
  if (registrationIds.size > 0) {
    const registrationRows = await db
      .select({
        id: registrations.id,
        editionId: registrations.editionId,
      })
      .from(registrations)
      .where(inArray(registrations.id, Array.from(registrationIds)));

    for (const row of registrationRows) {
      registrationToEditionId[row.id] = row.editionId;
      explicitEditionIds.add(row.editionId);
    }
  }

  const organizerLabels: Record<string, string> = {};
  if (organizerIds.size > 0) {
    const organizerRows = await db
      .select({
        id: organizations.id,
        name: organizations.name,
      })
      .from(organizations)
      .where(inArray(organizations.id, Array.from(organizerIds)));

    for (const row of organizerRows) {
      organizerLabels[row.id] = row.name;
    }
  }

  const eventLabels: Record<string, string> = {};
  if (explicitEditionIds.size > 0) {
    const eventRows = await db
      .select({
        editionId: eventEditions.id,
        editionLabel: eventEditions.editionLabel,
        seriesName: eventSeries.name,
      })
      .from(eventEditions)
      .innerJoin(eventSeries, eq(eventSeries.id, eventEditions.seriesId))
      .where(inArray(eventEditions.id, Array.from(explicitEditionIds)));

    for (const row of eventRows) {
      eventLabels[row.editionId] = buildEventLabel({
        seriesName: row.seriesName,
        editionLabel: row.editionLabel,
      });
    }
  }

  const referencedEditionIds = collectRegistrationToEditionId({
    events,
    registrationToEditionId,
  });
  for (const editionId of explicitEditionIds) {
    referencedEditionIds.add(editionId);
  }

  if (referencedEditionIds.size > 0 && Object.keys(eventLabels).length === 0) {
    for (const editionId of referencedEditionIds) {
      eventLabels[editionId] = editionId;
    }
  }

  return projectDebtDisputeExposureMetrics({
    events,
    windowStart,
    windowEnd,
    organizerLabels,
    eventLabels,
    registrationToEditionId,
    asOf: now,
  });
}
