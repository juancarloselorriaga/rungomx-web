import type { ProFeatureKey } from './catalog';
import type { ProFeatureDecision, ResolvedProFeatureConfig } from './types';

export function evaluateProFeatureDecision({
  featureKey,
  config,
  isPro,
  isInternal,
}: {
  featureKey: ProFeatureKey;
  config: ResolvedProFeatureConfig<ProFeatureKey>;
  isPro: boolean;
  isInternal: boolean;
}): ProFeatureDecision<ProFeatureKey> {
  if (isInternal) {
    return {
      featureKey,
      status: 'enabled',
      reason: 'internal_bypass',
      config,
    };
  }

  if (!config.enabled) {
    return {
      featureKey,
      status: 'disabled',
      reason: 'config_disabled',
      config,
    };
  }

  if (isPro) {
    return {
      featureKey,
      status: 'enabled',
      reason: 'pro_member',
      config,
    };
  }

  const effectiveVisibility = config.visibilityOverride ?? config.defaultVisibility;

  if (effectiveVisibility === 'locked') {
    return {
      featureKey,
      status: 'locked',
      reason: config.visibilityOverride ? 'visibility_override_locked' : 'default_locked',
      config,
    };
  }

  return {
    featureKey,
    status: 'hidden',
    reason: config.visibilityOverride ? 'visibility_override_hidden' : 'default_hidden',
    config,
  };
}
