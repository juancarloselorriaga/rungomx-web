import type { BILLING_ENTITLEMENT_KEY } from './constants';

export type BillingEntitlementKey = typeof BILLING_ENTITLEMENT_KEY;

export type BillingSubscriptionStatus = 'trialing' | 'active' | 'ended';

export type BillingEventSource = 'system' | 'admin' | 'provider';

export type BillingEventEntityType =
  | 'subscription'
  | 'override'
  | 'promotion'
  | 'pending_grant'
  | 'trial_use';

export type BillingEventType =
  | 'trial_started'
  | 'cancel_scheduled'
  | 'cancel_reverted'
  | 'subscription_ended'
  | 'override_granted'
  | 'override_extended'
  | 'override_revoked'
  | 'promotion_created'
  | 'promotion_enabled'
  | 'promotion_disabled'
  | 'promotion_redeemed'
  | 'pending_grant_created'
  | 'pending_grant_enabled'
  | 'pending_grant_disabled'
  | 'pending_grant_claimed';

export type EntitlementSource =
  | 'internal_bypass'
  | 'subscription'
  | 'trial'
  | 'admin_override'
  | 'pending_grant'
  | 'promotion'
  | 'system'
  | 'migration';

export type EntitlementInterval = {
  source: EntitlementSource;
  startsAt: Date;
  endsAt: Date;
  sourceId?: string | null;
  createdAt?: Date | null;
  meta?: Record<string, unknown>;
};

export type EntitlementEvaluationResult = {
  isPro: boolean;
  proUntil: Date | null;
  effectiveSource: EntitlementSource | null;
  sources: EntitlementInterval[];
  nextProStartsAt: Date | null;
};
