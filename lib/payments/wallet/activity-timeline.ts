import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents } from '@/db/schema';
import { canonicalMoneyEventNames } from '@/lib/payments/core/contracts/events/v1';
import {
  allocateDebtRepayment,
  applyDebtMutation,
  applyDebtShortfall,
  classifyDebtMutation,
  classifyDebtShortfallCategory,
  createZeroDebtCategoryBalances,
  debtWaterfallOrder,
  repaymentCapacityFromEvent,
  sumDebtCategoryBalances,
  type DebtCategory,
  type DebtCategoryBalances,
  type DebtProjectionEvent,
} from '@/lib/payments/debt/repayment-waterfall';
import type { WalletBuckets } from '@/lib/payments/wallet/snapshot';

export const walletActivityScopes = canonicalMoneyEventNames;

export type WalletActivityScope = (typeof walletActivityScopes)[number];

export type WalletActivityTimelineEntry = {
  eventId: string;
  traceId: string;
  eventName: WalletActivityScope;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  before: WalletBuckets;
  delta: WalletBuckets;
  after: WalletBuckets;
  debt: {
    categoryBalancesMinor: DebtCategoryBalances;
    repaymentAppliedMinor: number;
    repaymentAppliedByCategoryMinor: DebtCategoryBalances;
  };
};

export type WalletActivityDayGroup = {
  day: string;
  entries: WalletActivityTimelineEntry[];
};

export type WalletDebtProjection = {
  waterfallOrder: readonly DebtCategory[];
  categoryBalancesMinor: DebtCategoryBalances;
  repaymentAppliedMinor: number;
};

export type OrganizerWalletActivityTimeline = {
  organizerId: string;
  asOf: Date;
  totals: WalletBuckets;
  debt: WalletDebtProjection;
  dayGroups: WalletActivityDayGroup[];
  entryCount: number;
  filteredEntryCount: number;
  scope: WalletActivityScope | null;
  queryDurationMs: number;
};

type PersistedWalletEvent = {
  id: string;
  traceId: string;
  eventName: WalletActivityScope;
  entityType: string;
  entityId: string;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

const ZERO_BUCKETS: WalletBuckets = {
  availableMinor: 0,
  processingMinor: 0,
  frozenMinor: 0,
  debtMinor: 0,
};

function cloneBuckets(value: WalletBuckets): WalletBuckets {
  return {
    availableMinor: value.availableMinor,
    processingMinor: value.processingMinor,
    frozenMinor: value.frozenMinor,
    debtMinor: value.debtMinor,
  };
}

function getNestedAmountMinor(payload: Record<string, unknown>, amountKey: string): number {
  const candidate = payload[amountKey];
  if (!candidate || typeof candidate !== 'object') {
    return 0;
  }

  const amountMinor = (candidate as Record<string, unknown>).amountMinor;
  return typeof amountMinor === 'number' && Number.isFinite(amountMinor) ? Math.trunc(amountMinor) : 0;
}

function normalizeBuckets(raw: WalletBuckets): WalletBuckets {
  return {
    availableMinor: Math.max(raw.availableMinor, 0),
    processingMinor: Math.max(raw.processingMinor, 0),
    frozenMinor: Math.max(raw.frozenMinor, 0),
    debtMinor: Math.max(raw.debtMinor, 0),
  };
}

function eventDelta(event: PersistedWalletEvent): Omit<WalletBuckets, 'debtMinor'> {
  const payload = event.payloadJson;

  switch (event.eventName) {
    case 'payment.captured':
      return {
        availableMinor: getNestedAmountMinor(payload, 'netAmount'),
        processingMinor: 0,
        frozenMinor: 0,
      };
    case 'refund.executed':
      return {
        availableMinor: -getNestedAmountMinor(payload, 'refundAmount'),
        processingMinor: 0,
        frozenMinor: 0,
      };
    case 'dispute.opened': {
      const amountAtRiskMinor = getNestedAmountMinor(payload, 'amountAtRisk');
      return {
        availableMinor: -amountAtRiskMinor,
        processingMinor: 0,
        frozenMinor: amountAtRiskMinor,
      };
    }
    case 'dispute.funds_released': {
      const amountReleasedMinor = getNestedAmountMinor(payload, 'amountReleased');
      return {
        availableMinor: amountReleasedMinor,
        processingMinor: 0,
        frozenMinor: -amountReleasedMinor,
      };
    }
    case 'payout.requested': {
      const requestedAmountMinor = getNestedAmountMinor(payload, 'requestedAmount');
      return {
        availableMinor: -requestedAmountMinor,
        processingMinor: requestedAmountMinor,
        frozenMinor: 0,
      };
    }
    case 'financial.adjustment_posted': {
      const amountMinor = getNestedAmountMinor(payload, 'amount');
      return {
        availableMinor: amountMinor > 0 ? amountMinor : 0,
        processingMinor: 0,
        frozenMinor: 0,
      };
    }
    case 'dispute.debt_posted':
    case 'subscription.renewal_failed':
      return {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
      };
    default:
      return {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
      };
  }
}

function toDayKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function groupEntriesByDay(entries: WalletActivityTimelineEntry[]): WalletActivityDayGroup[] {
  const dayToEntries = new Map<string, WalletActivityTimelineEntry[]>();

  for (const entry of entries) {
    const day = toDayKey(entry.occurredAt);
    const current = dayToEntries.get(day) ?? [];
    current.push(entry);
    dayToEntries.set(day, current);
  }

  return Array.from(dayToEntries.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .map(([day, dayEntries]) => ({
      day,
      entries: dayEntries.sort((left, right) => {
        const occurredAtDiff = right.occurredAt.getTime() - left.occurredAt.getTime();
        if (occurredAtDiff !== 0) return occurredAtDiff;
        return right.eventId.localeCompare(left.eventId);
      }),
    }));
}

async function loadOrganizerEvents(organizerId: string): Promise<PersistedWalletEvent[]> {
  const rows = await db
    .select({
      id: moneyEvents.id,
      traceId: moneyEvents.traceId,
      eventName: moneyEvents.eventName,
      entityType: moneyEvents.entityType,
      entityId: moneyEvents.entityId,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.organizerId, organizerId),
        inArray(moneyEvents.eventName, walletActivityScopes),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt));

  return rows.map((row) => ({
    ...row,
    eventName: row.eventName as WalletActivityScope,
  }));
}

function projectEvent(
  current: WalletBuckets,
  debtCategoryBalances: DebtCategoryBalances,
  event: PersistedWalletEvent,
): {
  nextBuckets: WalletBuckets;
  nextDebtCategoryBalances: DebtCategoryBalances;
  repaymentAppliedMinor: number;
  repaymentAppliedByCategoryMinor: DebtCategoryBalances;
} {
  const projectionEvent: DebtProjectionEvent = {
    eventName: event.eventName,
    payloadJson: event.payloadJson,
  };

  const baseDelta = eventDelta(event);
  let availableMinor = current.availableMinor + baseDelta.availableMinor;
  const processingMinor = current.processingMinor + baseDelta.processingMinor;
  const frozenMinor = current.frozenMinor + baseDelta.frozenMinor;

  let nextDebtCategoryBalances = applyDebtMutation(
    debtCategoryBalances,
    classifyDebtMutation(projectionEvent),
  );

  if (availableMinor < 0) {
    const shortfallMinor = Math.abs(availableMinor);
    availableMinor = 0;
    nextDebtCategoryBalances = applyDebtShortfall(nextDebtCategoryBalances, {
      category: classifyDebtShortfallCategory(projectionEvent),
      amountMinor: shortfallMinor,
    });
  }

  const repaymentCapacityMinor = repaymentCapacityFromEvent(projectionEvent);
  let repaymentAppliedMinor = 0;
  let repaymentAppliedByCategoryMinor = createZeroDebtCategoryBalances();

  if (repaymentCapacityMinor > 0 && availableMinor > 0) {
    const repaymentResult = allocateDebtRepayment(nextDebtCategoryBalances, repaymentCapacityMinor);
    repaymentAppliedMinor = repaymentResult.repaymentAppliedMinor;
    repaymentAppliedByCategoryMinor = repaymentResult.repaymentAppliedByCategoryMinor;

    if (repaymentAppliedMinor > 0) {
      nextDebtCategoryBalances = repaymentResult.nextBalances;
      availableMinor = Math.max(availableMinor - repaymentAppliedMinor, 0);
    }
  }

  return {
    nextBuckets: normalizeBuckets({
      availableMinor,
      processingMinor,
      frozenMinor,
      debtMinor: sumDebtCategoryBalances(nextDebtCategoryBalances),
    }),
    nextDebtCategoryBalances,
    repaymentAppliedMinor,
    repaymentAppliedByCategoryMinor,
  };
}

export async function getOrganizerWalletActivityTimeline(params: {
  organizerId: string;
  scope?: WalletActivityScope;
  now?: Date;
}): Promise<OrganizerWalletActivityTimeline> {
  const now = params.now ?? new Date();
  const queryStartedAt = Date.now();
  const events = await loadOrganizerEvents(params.organizerId);
  const queryDurationMs = Date.now() - queryStartedAt;

  let current = { ...ZERO_BUCKETS };
  let debtCategoryBalances = createZeroDebtCategoryBalances();
  let repaymentAppliedMinor = 0;
  const allEntries: WalletActivityTimelineEntry[] = [];

  for (const event of events) {
    const before = cloneBuckets(current);
    const projectionResult = projectEvent(current, debtCategoryBalances, event);

    current = projectionResult.nextBuckets;
    debtCategoryBalances = projectionResult.nextDebtCategoryBalances;
    repaymentAppliedMinor += projectionResult.repaymentAppliedMinor;

    const after = cloneBuckets(current);
    const delta: WalletBuckets = {
      availableMinor: after.availableMinor - before.availableMinor,
      processingMinor: after.processingMinor - before.processingMinor,
      frozenMinor: after.frozenMinor - before.frozenMinor,
      debtMinor: after.debtMinor - before.debtMinor,
    };

    allEntries.push({
      eventId: event.id,
      traceId: event.traceId,
      eventName: event.eventName,
      entityType: event.entityType,
      entityId: event.entityId,
      occurredAt: event.occurredAt,
      before,
      delta,
      after,
      debt: {
        categoryBalancesMinor: debtCategoryBalances,
        repaymentAppliedMinor: projectionResult.repaymentAppliedMinor,
        repaymentAppliedByCategoryMinor: projectionResult.repaymentAppliedByCategoryMinor,
      },
    });
  }

  const filteredEntries =
    params.scope !== undefined
      ? allEntries.filter((entry) => entry.eventName === params.scope)
      : allEntries;

  const asOf = events.length > 0 ? events[events.length - 1]!.occurredAt : now;

  return {
    organizerId: params.organizerId,
    asOf,
    totals: cloneBuckets(current),
    debt: {
      waterfallOrder: debtWaterfallOrder,
      categoryBalancesMinor: debtCategoryBalances,
      repaymentAppliedMinor,
    },
    dayGroups: groupEntriesByDay(filteredEntries),
    entryCount: allEntries.length,
    filteredEntryCount: filteredEntries.length,
    scope: params.scope ?? null,
    queryDurationMs,
  };
}
