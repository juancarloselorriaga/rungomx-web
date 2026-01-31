'use client';

import { useMemo } from 'react';

import { getProFeatureMeta, type ProFeatureKey } from '@/lib/pro-features/catalog';
import { evaluateProFeatureDecision } from '@/lib/pro-features/evaluator';
import type { ResolvedProFeatureConfig } from '@/lib/pro-features/types';
import { useProFeaturesContext } from '@/components/pro-features/pro-features-provider';

function buildFallbackConfig(featureKey: ProFeatureKey): ResolvedProFeatureConfig<ProFeatureKey> {
  const meta = getProFeatureMeta(featureKey);
  return {
    featureKey,
    enabled: true,
    visibilityOverride: null,
    notes: null,
    defaultVisibility: meta.defaultVisibility,
    enforcement: meta.enforcement,
    upsellHref: meta.upsellHref,
  };
}

export function useProFeatureDecision(featureKey: ProFeatureKey) {
  const { snapshot, error } = useProFeaturesContext();

  return useMemo(() => {
    const config = snapshot?.configs[featureKey] ?? buildFallbackConfig(featureKey);
    if (!snapshot || error) {
      return {
        featureKey,
        status: 'enabled',
        reason: 'snapshot_unavailable',
        config,
      } as const;
    }

    return evaluateProFeatureDecision({
      featureKey,
      config,
      isPro: snapshot.isProMembership,
      isInternal: snapshot.isInternal,
    });
  }, [featureKey, snapshot, error]);
}
