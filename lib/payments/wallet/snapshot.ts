import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/db';
import { moneyEvents } from '@/db/schema';
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

export type WalletBuckets = {
  availableMinor: number;
  processingMinor: number;
  frozenMinor: number;
  debtMinor: number;
};

export type WalletDebtProjection = {
  waterfallOrder: readonly DebtCategory[];
  categoryBalancesMinor: DebtCategoryBalances;
  repaymentAppliedMinor: number;
};

export type OrganizerWalletBucketSnapshot = {
  organizerId: string;
  asOf: Date;
  buckets: WalletBuckets;
  debt: WalletDebtProjection;
  queryDurationMs: number;
};

type WalletRelevantEventName = (typeof walletRelevantEventNames)[number];

type PersistedWalletEvent = {
  eventName: WalletRelevantEventName;
  occurredAt: Date;
  payloadJson: Record<string, unknown>;
};

const ZERO_BUCKETS: WalletBuckets = {
  availableMinor: 0,
  processingMinor: 0,
  frozenMinor: 0,
  debtMinor: 0,
};

const walletRelevantEventNames = [
  'payment.captured',
  'refund.executed',
  'dispute.opened',
  'dispute.funds_released',
  'dispute.debt_posted',
  'payout.queued',
  'payout.requested',
  'payout.processing',
  'payout.paused',
  'payout.resumed',
  'payout.completed',
  'payout.failed',
  'payout.adjusted',
  'financial.adjustment_posted',
] as const;

function normalizeBuckets(raw: WalletBuckets): WalletBuckets {
  return {
    availableMinor: Math.max(raw.availableMinor, 0),
    processingMinor: Math.max(raw.processingMinor, 0),
    frozenMinor: Math.max(raw.frozenMinor, 0),
    debtMinor: Math.max(raw.debtMinor, 0),
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

function eventDelta(event: PersistedWalletEvent): Omit<WalletBuckets, 'debtMinor'> {
  switch (event.eventName) {
    case 'payment.captured':
      return {
        availableMinor: getNestedAmountMinor(event.payloadJson, 'netAmount'),
        processingMinor: 0,
        frozenMinor: 0,
      };
    case 'refund.executed':
      return {
        availableMinor: -getNestedAmountMinor(event.payloadJson, 'refundAmount'),
        processingMinor: 0,
        frozenMinor: 0,
      };
    case 'dispute.opened': {
      const amountAtRiskMinor = getNestedAmountMinor(event.payloadJson, 'amountAtRisk');
      return {
        availableMinor: -amountAtRiskMinor,
        processingMinor: 0,
        frozenMinor: amountAtRiskMinor,
      };
    }
    case 'dispute.funds_released': {
      const amountReleasedMinor = getNestedAmountMinor(event.payloadJson, 'amountReleased');
      return {
        availableMinor: amountReleasedMinor,
        processingMinor: 0,
        frozenMinor: -amountReleasedMinor,
      };
    }
    case 'payout.requested': {
      const requestedAmountMinor = getNestedAmountMinor(event.payloadJson, 'requestedAmount');
      return {
        availableMinor: -requestedAmountMinor,
        processingMinor: requestedAmountMinor,
        frozenMinor: 0,
      };
    }
    case 'payout.processing':
    case 'payout.paused':
    case 'payout.resumed':
      return {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
      };
    case 'payout.completed': {
      const settledAmountMinor = getNestedAmountMinor(event.payloadJson, 'settledAmount');
      return {
        availableMinor: 0,
        processingMinor: -settledAmountMinor,
        frozenMinor: 0,
      };
    }
    case 'payout.failed': {
      const failedAmountMinor = getNestedAmountMinor(event.payloadJson, 'failedAmount');
      return {
        availableMinor: failedAmountMinor,
        processingMinor: -failedAmountMinor,
        frozenMinor: 0,
      };
    }
    case 'payout.adjusted': {
      const previousRequestedAmountMinor = getNestedAmountMinor(
        event.payloadJson,
        'previousRequestedAmount',
      );
      const adjustedRequestedAmountMinor = getNestedAmountMinor(
        event.payloadJson,
        'adjustedRequestedAmount',
      );
      const releasedAmountMinor = Math.max(
        previousRequestedAmountMinor - adjustedRequestedAmountMinor,
        0,
      );
      return {
        availableMinor: releasedAmountMinor,
        processingMinor: -releasedAmountMinor,
        frozenMinor: 0,
      };
    }
    case 'payout.queued':
      return {
        availableMinor: 0,
        processingMinor: 0,
        frozenMinor: 0,
      };
    case 'financial.adjustment_posted': {
      const amountMinor = getNestedAmountMinor(event.payloadJson, 'amount');
      return {
        availableMinor: amountMinor > 0 ? amountMinor : 0,
        processingMinor: 0,
        frozenMinor: 0,
      };
    }
    case 'dispute.debt_posted':
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

async function loadOrganizerEvents(organizerId: string): Promise<PersistedWalletEvent[]> {
  const rows = await db
    .select({
      eventName: moneyEvents.eventName,
      occurredAt: moneyEvents.occurredAt,
      payloadJson: moneyEvents.payloadJson,
    })
    .from(moneyEvents)
    .where(
      and(
        eq(moneyEvents.organizerId, organizerId),
        inArray(moneyEvents.eventName, walletRelevantEventNames),
      ),
    )
    .orderBy(asc(moneyEvents.occurredAt), asc(moneyEvents.createdAt));

  return rows.map((row) => ({
    eventName: row.eventName as WalletRelevantEventName,
    occurredAt: row.occurredAt,
    payloadJson: row.payloadJson,
  }));
}

function applyProjectionEvent(
  current: WalletBuckets,
  debtCategoryBalances: DebtCategoryBalances,
  event: PersistedWalletEvent,
): {
  nextBuckets: WalletBuckets;
  nextDebtCategoryBalances: DebtCategoryBalances;
  repaymentAppliedMinor: number;
} {
  const projectionEvent: DebtProjectionEvent = {
    eventName: event.eventName,
    payloadJson: event.payloadJson,
  };

  const delta = eventDelta(event);
  let availableMinor = current.availableMinor + delta.availableMinor;
  const processingMinor = current.processingMinor + delta.processingMinor;
  const frozenMinor = current.frozenMinor + delta.frozenMinor;

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

  if (repaymentCapacityMinor > 0 && availableMinor > 0) {
    const repaymentResult = allocateDebtRepayment(nextDebtCategoryBalances, repaymentCapacityMinor);
    repaymentAppliedMinor = repaymentResult.repaymentAppliedMinor;

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
  };
}

export async function getOrganizerWalletBucketSnapshot(params: {
  organizerId: string;
  now?: Date;
}): Promise<OrganizerWalletBucketSnapshot> {
  const now = params.now ?? new Date();
  const queryStartedAt = Date.now();
  const events = await loadOrganizerEvents(params.organizerId);
  const queryDurationMs = Date.now() - queryStartedAt;

  let current = { ...ZERO_BUCKETS };
  let debtCategoryBalances = createZeroDebtCategoryBalances();
  let repaymentAppliedMinor = 0;

  for (const event of events) {
    const projectionResult = applyProjectionEvent(current, debtCategoryBalances, event);
    current = projectionResult.nextBuckets;
    debtCategoryBalances = projectionResult.nextDebtCategoryBalances;
    repaymentAppliedMinor += projectionResult.repaymentAppliedMinor;
  }

  return {
    organizerId: params.organizerId,
    asOf: events.length > 0 ? events[events.length - 1]!.occurredAt : now,
    buckets: current,
    debt: {
      waterfallOrder: debtWaterfallOrder,
      categoryBalancesMinor: debtCategoryBalances,
      repaymentAppliedMinor,
    },
    queryDurationMs,
  };
}
