import { createHash, randomUUID } from 'node:crypto';

import { and, eq, inArray, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, eventEditions, eventSeries, pricingTiers } from '@/db/schema';
import type { CanonicalMoneyEventV1 } from '@/lib/payments/core/contracts/events';
import { ingestMoneyMutationFromScheduler } from '@/lib/payments/core/mutation-ingress-paths';
import { getOrganizerWalletBucketSnapshot } from '@/lib/payments/wallet/snapshot';

const DEFAULT_POLICY_CODE = 'debt_threshold_v1';
const DEFAULT_CURRENCY = 'MXN';
const DEFAULT_PAUSE_THRESHOLD_MINOR = 50_000;
const DEFAULT_RESUME_THRESHOLD_MINOR = 25_000;
const TRACE_PREFIX = 'debt-threshold-control:';

export const debtThresholdTransitionStates = [
  'pause_required',
  'resume_allowed',
  'no_change',
] as const;

export type DebtThresholdTransitionState = (typeof debtThresholdTransitionStates)[number];

export type DebtThresholdPolicyConfig = {
  policyCode: string;
  pauseThresholdMinor: number;
  resumeThresholdMinor: number;
  currency: string;
};

export type DebtThresholdTransitionDecision = {
  transitionState: DebtThresholdTransitionState;
  desiredPaused: boolean;
  reasonCode: string;
  guidanceCode: string;
};

export type DebtThresholdEvaluationInput = {
  debtMinor: number;
  pauseThresholdMinor: number;
  resumeThresholdMinor: number;
  paidEditionCount: number;
  pausedEditionCount: number;
};

export type DebtThresholdRegistrationControlResult = {
  organizerId: string;
  evaluatedAt: Date;
  debtMinor: number;
  policy: DebtThresholdPolicyConfig;
  transitionState: DebtThresholdTransitionState;
  reasonCode: string;
  guidanceCode: string;
  paidEditionCount: number;
  freeEditionCount: number;
  pausedEditionCountBefore: number;
  pausedEditionCountAfter: number;
  affectedEditionIds: string[];
  traceId: string | null;
  ingressDeduplicated: boolean;
};

type OrganizerEditionState = {
  id: string;
  isRegistrationPaused: boolean;
  isPaid: boolean;
};

type OrganizerEditionScope = {
  paidEditions: OrganizerEditionState[];
  freeEditions: OrganizerEditionState[];
};

function normalizeNonNegativeMinor(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : fallback;
}

function normalizeCurrency(value: string | undefined): string {
  if (typeof value !== 'string') return DEFAULT_CURRENCY;
  const normalized = value.trim().toUpperCase();
  return normalized.length === 3 ? normalized : DEFAULT_CURRENCY;
}

function normalizePolicyCode(value: string | undefined): string {
  if (typeof value !== 'string') return DEFAULT_POLICY_CODE;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : DEFAULT_POLICY_CODE;
}

export function resolveDebtThresholdPolicyConfig(
  input?: Partial<DebtThresholdPolicyConfig>,
): DebtThresholdPolicyConfig {
  const pauseThresholdMinor = normalizeNonNegativeMinor(
    input?.pauseThresholdMinor ?? DEFAULT_PAUSE_THRESHOLD_MINOR,
    DEFAULT_PAUSE_THRESHOLD_MINOR,
  );
  const resumeThresholdMinor = normalizeNonNegativeMinor(
    input?.resumeThresholdMinor ?? DEFAULT_RESUME_THRESHOLD_MINOR,
    DEFAULT_RESUME_THRESHOLD_MINOR,
  );

  if (pauseThresholdMinor < resumeThresholdMinor) {
    throw new Error('Debt threshold policy requires pauseThresholdMinor >= resumeThresholdMinor.');
  }

  return {
    policyCode: normalizePolicyCode(input?.policyCode),
    pauseThresholdMinor,
    resumeThresholdMinor,
    currency: normalizeCurrency(input?.currency),
  };
}

function normalizeDebtMinor(value: number): number {
  return normalizeNonNegativeMinor(value, 0);
}

export function evaluateDebtThresholdTransition(
  input: DebtThresholdEvaluationInput,
): DebtThresholdTransitionDecision {
  const debtMinor = normalizeDebtMinor(input.debtMinor);
  const paidEditionCount = normalizeNonNegativeMinor(input.paidEditionCount, 0);
  const pausedEditionCount = Math.min(
    normalizeNonNegativeMinor(input.pausedEditionCount, 0),
    paidEditionCount,
  );
  const allPaidPaused = paidEditionCount > 0 && pausedEditionCount === paidEditionCount;
  const allPaidUnpaused = pausedEditionCount === 0;

  if (paidEditionCount === 0) {
    return {
      transitionState: 'no_change',
      desiredPaused: false,
      reasonCode: 'debt_threshold_no_paid_editions',
      guidanceCode: 'no_paid_edition_controls_required',
    };
  }

  if (debtMinor >= input.pauseThresholdMinor) {
    if (allPaidPaused) {
      return {
        transitionState: 'no_change',
        desiredPaused: true,
        reasonCode: 'debt_threshold_hold_paused',
        guidanceCode: 'reduce_debt_below_resume_threshold',
      };
    }

    return {
      transitionState: 'pause_required',
      desiredPaused: true,
      reasonCode: 'debt_threshold_pause_required',
      guidanceCode: 'reduce_debt_below_resume_threshold',
    };
  }

  if (debtMinor <= input.resumeThresholdMinor) {
    if (allPaidUnpaused) {
      return {
        transitionState: 'no_change',
        desiredPaused: false,
        reasonCode: 'debt_threshold_hold_resumed',
        guidanceCode: 'paid_registrations_available',
      };
    }

    return {
      transitionState: 'resume_allowed',
      desiredPaused: false,
      reasonCode: 'debt_threshold_resume_allowed',
      guidanceCode: 'paid_registrations_resumed',
    };
  }

  const currentlyPaused = !allPaidUnpaused;
  return {
    transitionState: 'no_change',
    desiredPaused: currentlyPaused,
    reasonCode: currentlyPaused ? 'debt_threshold_hysteresis_hold_paused' : 'debt_threshold_hysteresis_hold',
    guidanceCode: currentlyPaused
      ? 'reduce_debt_below_resume_threshold'
      : 'continue_monitoring_debt_threshold',
  };
}

function buildTransitionIdempotencyKey(params: {
  organizerId: string;
  transitionState: Exclude<DebtThresholdTransitionState, 'no_change'>;
  debtMinor: number;
  pauseThresholdMinor: number;
  resumeThresholdMinor: number;
  affectedEditionIds: string[];
  policyCode: string;
}): string {
  const hash = createHash('sha256')
    .update(
      [
        params.organizerId,
        params.transitionState,
        params.debtMinor.toString(),
        params.pauseThresholdMinor.toString(),
        params.resumeThresholdMinor.toString(),
        params.policyCode,
        [...params.affectedEditionIds].sort().join(','),
      ].join('|'),
    )
    .digest('hex')
    .slice(0, 32);

  return `debt-threshold:${params.transitionState}:${hash}`;
}

function buildTransitionEvent(params: {
  organizerId: string;
  evaluatedAt: Date;
  transitionState: Exclude<DebtThresholdTransitionState, 'no_change'>;
  reasonCode: string;
  guidanceCode: string;
  debtMinor: number;
  policy: DebtThresholdPolicyConfig;
  affectedEditionIds: string[];
  totalPaidEditionCount: number;
  idempotencyKey: string;
  traceId: string;
}): CanonicalMoneyEventV1 {
  const commonPayload = {
    organizerId: params.organizerId,
    policyCode: params.policy.policyCode,
    reasonCode: params.reasonCode,
    guidanceCode: params.guidanceCode,
    debtAmount: {
      amountMinor: params.debtMinor,
      currency: params.policy.currency,
    },
    pauseThresholdAmount: {
      amountMinor: params.policy.pauseThresholdMinor,
      currency: params.policy.currency,
    },
    resumeThresholdAmount: {
      amountMinor: params.policy.resumeThresholdMinor,
      currency: params.policy.currency,
    },
    affectedEditionIds: [...params.affectedEditionIds].sort(),
    affectedPaidEditionCount: params.affectedEditionIds.length,
    totalPaidEditionCount: params.totalPaidEditionCount,
  };

  const commonEnvelope = {
    eventId: randomUUID(),
    traceId: params.traceId,
    occurredAt: params.evaluatedAt.toISOString(),
    recordedAt: params.evaluatedAt.toISOString(),
    version: 1 as const,
    entityType: 'debt_policy' as const,
    entityId: params.organizerId,
    source: 'scheduler' as const,
    idempotencyKey: params.idempotencyKey,
    metadata: {
      policyCode: params.policy.policyCode,
      transitionState: params.transitionState,
      evaluatedAt: params.evaluatedAt.toISOString(),
    },
  };

  if (params.transitionState === 'pause_required') {
    return {
      ...commonEnvelope,
      eventName: 'debt_control.pause_required',
      payload: commonPayload,
    };
  }

  return {
    ...commonEnvelope,
    eventName: 'debt_control.resume_allowed',
    payload: commonPayload,
  };
}

async function loadOrganizerEditionScope(organizerId: string): Promise<OrganizerEditionScope> {
  const series = await db.query.eventSeries.findMany({
    where: and(eq(eventSeries.organizationId, organizerId), isNull(eventSeries.deletedAt)),
    columns: { id: true },
  });

  if (series.length === 0) {
    return {
      paidEditions: [],
      freeEditions: [],
    };
  }

  const seriesIds = series.map((row) => row.id);
  const editions = await db.query.eventEditions.findMany({
    where: and(inArray(eventEditions.seriesId, seriesIds), isNull(eventEditions.deletedAt)),
    columns: {
      id: true,
      isRegistrationPaused: true,
    },
    with: {
      distances: {
        where: isNull(eventDistances.deletedAt),
        columns: { id: true },
        with: {
          pricingTiers: {
            where: isNull(pricingTiers.deletedAt),
            columns: { priceCents: true },
          },
        },
      },
    },
  });

  const organizerEditions = editions
    .map((edition) => {
      const isPaid = edition.distances.some((distance) =>
        distance.pricingTiers.some((tier) => tier.priceCents > 0),
      );

      return {
        id: edition.id,
        isRegistrationPaused: edition.isRegistrationPaused,
        isPaid,
      } satisfies OrganizerEditionState;
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    paidEditions: organizerEditions.filter((edition) => edition.isPaid),
    freeEditions: organizerEditions.filter((edition) => !edition.isPaid),
  };
}

export async function applyDebtThresholdRegistrationControl(params: {
  organizerId: string;
  now?: Date;
  policyConfig?: Partial<DebtThresholdPolicyConfig>;
}): Promise<DebtThresholdRegistrationControlResult> {
  const evaluatedAt = params.now ?? new Date();
  const policy = resolveDebtThresholdPolicyConfig(params.policyConfig);
  const editionScope = await loadOrganizerEditionScope(params.organizerId);

  const paidEditions = editionScope.paidEditions;
  const pausedEditionCountBefore = paidEditions.filter((edition) => edition.isRegistrationPaused).length;

  const snapshot = await getOrganizerWalletBucketSnapshot({
    organizerId: params.organizerId,
    now: evaluatedAt,
  });

  const debtMinor = normalizeDebtMinor(snapshot.buckets.debtMinor);

  const decision = evaluateDebtThresholdTransition({
    debtMinor,
    pauseThresholdMinor: policy.pauseThresholdMinor,
    resumeThresholdMinor: policy.resumeThresholdMinor,
    paidEditionCount: paidEditions.length,
    pausedEditionCount: pausedEditionCountBefore,
  });

  let transitionState: DebtThresholdTransitionState = decision.transitionState;
  let reasonCode = decision.reasonCode;
  let guidanceCode = decision.guidanceCode;
  let affectedEditionIds: string[] = [];
  let traceId: string | null = null;
  let ingressDeduplicated = false;

  if (transitionState !== 'no_change') {
    affectedEditionIds = paidEditions
      .filter((edition) => edition.isRegistrationPaused !== decision.desiredPaused)
      .map((edition) => edition.id)
      .sort((left, right) => left.localeCompare(right));

    if (affectedEditionIds.length === 0) {
      transitionState = 'no_change';
      reasonCode = decision.desiredPaused
        ? 'debt_threshold_hold_paused'
        : 'debt_threshold_hold_resumed';
      guidanceCode = decision.desiredPaused
        ? 'reduce_debt_below_resume_threshold'
        : 'paid_registrations_available';
    } else {
      await db
        .update(eventEditions)
        .set({ isRegistrationPaused: decision.desiredPaused })
        .where(inArray(eventEditions.id, affectedEditionIds));

      const transitionStateForEvent = transitionState as Exclude<
        DebtThresholdTransitionState,
        'no_change'
      >;
      const transitionTraceId = `${TRACE_PREFIX}${params.organizerId}:${randomUUID()}`;
      const idempotencyKey = buildTransitionIdempotencyKey({
        organizerId: params.organizerId,
        transitionState: transitionStateForEvent,
        debtMinor,
        pauseThresholdMinor: policy.pauseThresholdMinor,
        resumeThresholdMinor: policy.resumeThresholdMinor,
        affectedEditionIds,
        policyCode: policy.policyCode,
      });

      const event = buildTransitionEvent({
        organizerId: params.organizerId,
        evaluatedAt,
        transitionState: transitionStateForEvent,
        reasonCode,
        guidanceCode,
        debtMinor,
        policy,
        affectedEditionIds,
        totalPaidEditionCount: paidEditions.length,
        idempotencyKey,
        traceId: transitionTraceId,
      });

      const ingressResult = await ingestMoneyMutationFromScheduler({
        traceId: transitionTraceId,
        organizerId: params.organizerId,
        idempotencyKey,
        events: [event],
      });

      traceId = ingressResult.traceId;
      ingressDeduplicated = ingressResult.deduplicated;
    }
  }

  const pausedEditionCountAfter =
    transitionState === 'no_change'
      ? pausedEditionCountBefore
      : decision.desiredPaused
        ? paidEditions.length
        : 0;

  return {
    organizerId: params.organizerId,
    evaluatedAt,
    debtMinor,
    policy,
    transitionState,
    reasonCode,
    guidanceCode,
    paidEditionCount: paidEditions.length,
    freeEditionCount: editionScope.freeEditions.length,
    pausedEditionCountBefore,
    pausedEditionCountAfter,
    affectedEditionIds,
    traceId,
    ingressDeduplicated,
  };
}
