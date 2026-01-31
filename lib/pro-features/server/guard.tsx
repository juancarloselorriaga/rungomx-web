import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { ProLockedCard } from '@/components/billing/pro-locked-card';
import type { AuthenticatedContext } from '@/lib/auth/guards';
import type { AuthContext } from '@/lib/auth/server';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { evaluateProFeatureDecision } from '../evaluator';
import { getProFeatureMeta, type ProFeatureKey } from '../catalog';
import type { ProFeatureDecision } from '../types';
import { getProFeatureConfigSnapshot } from './config';
import { trackProFeatureEvent } from './tracking';

export class ProFeatureAccessError extends Error {
  readonly code = 'PRO_REQUIRED';
  readonly featureKey: ProFeatureKey;
  readonly decision: ProFeatureDecision<ProFeatureKey>;

  constructor(featureKey: ProFeatureKey, decision: ProFeatureDecision<ProFeatureKey>, message = 'Pro access required') {
    super(message);
    this.featureKey = featureKey;
    this.decision = decision;
  }
}

async function resolveDecision({
  featureKey,
  authContext,
}: {
  featureKey: ProFeatureKey;
  authContext: AuthContext | AuthenticatedContext;
}): Promise<ProFeatureDecision<ProFeatureKey>> {
  const snapshot = await getProFeatureConfigSnapshot();
  const config = snapshot[featureKey];

  if (!authContext.user) {
    return evaluateProFeatureDecision({
      featureKey,
      config,
      isPro: false,
      isInternal: false,
    });
  }

  const isProMembership = authContext.isInternal
    ? false
    : (await getProEntitlementForUser({ userId: authContext.user.id, isInternal: authContext.isInternal })).isPro;

  return evaluateProFeatureDecision({
    featureKey,
    config,
    isPro: isProMembership,
    isInternal: authContext.isInternal,
  });
}

export async function requireProFeature(
  featureKey: ProFeatureKey,
  authContext: AuthenticatedContext,
): Promise<ProFeatureDecision<ProFeatureKey>> {
  const decision = await resolveDecision({ featureKey, authContext });

  if (decision.status !== 'enabled') {
    if (decision.status !== 'disabled') {
      await trackProFeatureEvent({
        featureKey,
        userId: authContext.user.id,
        eventType: 'blocked',
      });
    }

    throw new ProFeatureAccessError(featureKey, decision);
  }

  return decision;
}

function buildUpsellCard({
  featureKey,
}: {
  featureKey: ProFeatureKey;
}): Promise<ReactNode> {
  const meta = getProFeatureMeta(featureKey);
  return getTranslations('common').then((tCommon) => (
    <ProLockedCard
      title={tCommon(meta.i18n.lockedTitleKey)}
      description={tCommon(meta.i18n.lockedDescriptionKey)}
      ctaLabel={tCommon(meta.i18n.lockedCtaKey)}
      href={meta.upsellHref}
    />
  ));
}

function buildDisabledBanner(): Promise<ReactNode> {
  return getTranslations('common').then((tCommon) => (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
      <p className="text-sm font-semibold text-foreground">
        {tCommon('proFeatures.disabled.title')}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {tCommon('proFeatures.disabled.description')}
      </p>
    </div>
  ));
}

export async function guardProFeaturePage(
  featureKey: ProFeatureKey,
  authContext: AuthContext,
): Promise<{
  allowed: boolean;
  decision: ProFeatureDecision<ProFeatureKey>;
  upsell?: ReactNode;
  disabled?: ReactNode;
}> {
  const decision = await resolveDecision({ featureKey, authContext });

  if (decision.status === 'enabled') {
    return { allowed: true, decision };
  }

  if (decision.status === 'disabled') {
    const disabled = await buildDisabledBanner();
    return { allowed: false, decision, disabled };
  }

  if (authContext.user) {
    await trackProFeatureEvent({
      featureKey,
      userId: authContext.user.id,
      eventType: 'blocked',
    });
  }

  const upsell = await buildUpsellCard({ featureKey });

  return { allowed: false, decision, upsell };
}
