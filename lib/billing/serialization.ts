import type { BillingStatus } from './queries';
import type { EntitlementInterval } from './types';

export type SerializableInterval = Omit<EntitlementInterval, 'startsAt' | 'endsAt' | 'createdAt'> & {
  startsAt: string;
  endsAt: string;
  createdAt?: string | null;
};

export type SerializableBillingStatus = Omit<
  BillingStatus,
  'proUntil' | 'nextProStartsAt' | 'sources' | 'subscription'
> & {
  proUntil: string | null;
  nextProStartsAt: string | null;
  sources: SerializableInterval[];
  subscription: BillingStatus['subscription'] extends infer T
    ? T extends null
      ? null
      : {
          id: string;
          status: string;
          planKey: string;
          cancelAtPeriodEnd: boolean;
          trialStartsAt: string | null;
          trialEndsAt: string | null;
          currentPeriodStartsAt: string | null;
          currentPeriodEndsAt: string | null;
          canceledAt: string | null;
          endedAt: string | null;
        }
    : never;
};

export function serializeInterval(interval: EntitlementInterval): SerializableInterval {
  return {
    source: interval.source,
    startsAt: interval.startsAt.toISOString(),
    endsAt: interval.endsAt.toISOString(),
    sourceId: interval.sourceId ?? null,
    createdAt: interval.createdAt ? interval.createdAt.toISOString() : null,
    meta: interval.meta,
  };
}

export function serializeBillingStatus(status: BillingStatus): SerializableBillingStatus {
  return {
    ...status,
    proUntil: status.proUntil ? status.proUntil.toISOString() : null,
    nextProStartsAt: status.nextProStartsAt ? status.nextProStartsAt.toISOString() : null,
    sources: status.sources.map(serializeInterval),
    subscription: status.subscription
      ? {
          ...status.subscription,
          trialStartsAt: status.subscription.trialStartsAt?.toISOString() ?? null,
          trialEndsAt: status.subscription.trialEndsAt?.toISOString() ?? null,
          currentPeriodStartsAt: status.subscription.currentPeriodStartsAt?.toISOString() ?? null,
          currentPeriodEndsAt: status.subscription.currentPeriodEndsAt?.toISOString() ?? null,
          canceledAt: status.subscription.canceledAt?.toISOString() ?? null,
          endedAt: status.subscription.endedAt?.toISOString() ?? null,
        }
      : null,
  };
}
