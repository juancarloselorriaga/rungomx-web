'use client';

import { ProLockedCard } from '@/components/billing/pro-locked-card';
import { getProFeatureMeta, type ProFeatureKey } from '@/lib/pro-features/catalog';
import { useProFeatureDecision } from '@/hooks/use-pro-feature-decision';
import { useTranslations } from 'next-intl';

export function ProFeatureGate({
  featureKey,
  children,
}: {
  featureKey: ProFeatureKey;
  children: React.ReactNode;
}) {
  const decision = useProFeatureDecision(featureKey);
  const tCommon = useTranslations('common');
  const meta = getProFeatureMeta(featureKey);

  if (decision.status === 'enabled') {
    return <>{children}</>;
  }

  if (decision.status === 'locked') {
    return (
      <ProLockedCard
        title={tCommon(meta.i18n.lockedTitleKey)}
        description={tCommon(meta.i18n.lockedDescriptionKey)}
        ctaLabel={tCommon(meta.i18n.lockedCtaKey)}
        href={meta.upsellHref}
      />
    );
  }

  return null;
}
