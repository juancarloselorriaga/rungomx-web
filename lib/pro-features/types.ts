export type ProFeatureVisibility = 'locked' | 'hidden';

export type ProFeatureEnforcement = 'ui_only' | 'server_required';

export type ProFeatureStatus = 'enabled' | 'locked' | 'hidden' | 'disabled';

export type ProFeatureConfig<TKey extends string = string> = {
  id: string;
  featureKey: TKey;
  enabled: boolean;
  visibilityOverride: ProFeatureVisibility | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ResolvedProFeatureConfig<TKey extends string = string> = {
  id?: string;
  featureKey: TKey;
  enabled: boolean;
  visibilityOverride: ProFeatureVisibility | null;
  notes: string | null;
  defaultVisibility: ProFeatureVisibility;
  enforcement: ProFeatureEnforcement;
  upsellHref: string;
};

export type ProFeatureDecisionReason =
  | 'internal_bypass'
  | 'config_disabled'
  | 'pro_member'
  | 'snapshot_unavailable'
  | 'visibility_override_locked'
  | 'visibility_override_hidden'
  | 'default_locked'
  | 'default_hidden';

export type ProFeatureDecision<TKey extends string = string> = {
  featureKey: TKey;
  status: ProFeatureStatus;
  reason: ProFeatureDecisionReason;
  config: ResolvedProFeatureConfig<TKey>;
};

export type ProFeatureUsageEventType = 'used' | 'blocked';
