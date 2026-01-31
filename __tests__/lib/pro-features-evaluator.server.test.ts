import { getProFeatureMeta } from '@/lib/pro-features/catalog';
import { evaluateProFeatureDecision } from '@/lib/pro-features/evaluator';
import type { ProFeatureKey } from '@/lib/pro-features/catalog';
import type { ResolvedProFeatureConfig } from '@/lib/pro-features/types';

const buildConfig = (
  key: ProFeatureKey,
  overrides?: Partial<ResolvedProFeatureConfig<ProFeatureKey>>,
): ResolvedProFeatureConfig<ProFeatureKey> => {
  const meta = getProFeatureMeta(key);
  return {
    id: 'config-1',
    featureKey: key,
    enabled: true,
    visibilityOverride: null,
    notes: null,
    defaultVisibility: meta.defaultVisibility,
    enforcement: meta.enforcement,
    upsellHref: meta.upsellHref,
    ...overrides,
  };
};

describe('evaluateProFeatureDecision', () => {
  it('allows internal bypass', () => {
    const config = buildConfig('event_clone');
    const decision = evaluateProFeatureDecision({
      featureKey: 'event_clone',
      config,
      isPro: false,
      isInternal: true,
    });

    expect(decision.status).toBe('enabled');
    expect(decision.reason).toBe('internal_bypass');
  });

  it('returns disabled when config is disabled', () => {
    const config = buildConfig('event_clone', { enabled: false });
    const decision = evaluateProFeatureDecision({
      featureKey: 'event_clone',
      config,
      isPro: true,
      isInternal: false,
    });

    expect(decision.status).toBe('disabled');
    expect(decision.reason).toBe('config_disabled');
  });

  it('enables feature for Pro members', () => {
    const config = buildConfig('event_clone');
    const decision = evaluateProFeatureDecision({
      featureKey: 'event_clone',
      config,
      isPro: true,
      isInternal: false,
    });

    expect(decision.status).toBe('enabled');
    expect(decision.reason).toBe('pro_member');
  });

  it('locks non-Pro users when default visibility is locked', () => {
    const config = buildConfig('event_clone');
    const decision = evaluateProFeatureDecision({
      featureKey: 'event_clone',
      config,
      isPro: false,
      isInternal: false,
    });

    expect(decision.status).toBe('locked');
    expect(decision.reason).toBe('default_locked');
  });

  it('hides non-Pro users when default visibility is hidden', () => {
    const config = buildConfig('coupons');
    const decision = evaluateProFeatureDecision({
      featureKey: 'coupons',
      config,
      isPro: false,
      isInternal: false,
    });

    expect(decision.status).toBe('hidden');
    expect(decision.reason).toBe('default_hidden');
  });

  it('honors visibility overrides', () => {
    const lockedConfig = buildConfig('coupons', { visibilityOverride: 'locked' });
    const lockedDecision = evaluateProFeatureDecision({
      featureKey: 'coupons',
      config: lockedConfig,
      isPro: false,
      isInternal: false,
    });

    expect(lockedDecision.status).toBe('locked');
    expect(lockedDecision.reason).toBe('visibility_override_locked');

    const hiddenConfig = buildConfig('event_clone', { visibilityOverride: 'hidden' });
    const hiddenDecision = evaluateProFeatureDecision({
      featureKey: 'event_clone',
      config: hiddenConfig,
      isPro: false,
      isInternal: false,
    });

    expect(hiddenDecision.status).toBe('hidden');
    expect(hiddenDecision.reason).toBe('visibility_override_hidden');
  });
});
