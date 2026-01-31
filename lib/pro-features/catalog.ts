import type { ProFeatureEnforcement, ProFeatureVisibility } from './types';

export type ProFeatureKey = 'event_clone' | 'coupons';

export type ProFeatureUpsellHref = '/settings/billing';
export type ProFeatureCommonKey = `proFeatures.${ProFeatureKey}.${'title' | 'description' | 'ctaLabel'}`;
export type ProFeatureAdminKey = `features.${ProFeatureKey}.${'label' | 'description'}`;

export type ProFeatureCatalogEntry = {
  key: ProFeatureKey;
  defaultVisibility: ProFeatureVisibility;
  enforcement: ProFeatureEnforcement;
  upsellHref: ProFeatureUpsellHref;
  i18n: {
    lockedTitleKey: ProFeatureCommonKey;
    lockedDescriptionKey: ProFeatureCommonKey;
    lockedCtaKey: ProFeatureCommonKey;
    adminLabelKey: ProFeatureAdminKey;
    adminDescriptionKey: ProFeatureAdminKey;
  };
  owner?: string;
  notes?: string;
};

export const PRO_FEATURE_CATALOG: Record<ProFeatureKey, ProFeatureCatalogEntry> = {
  event_clone: {
    key: 'event_clone',
    defaultVisibility: 'locked',
    enforcement: 'server_required',
    upsellHref: '/settings/billing',
    i18n: {
      lockedTitleKey: 'proFeatures.event_clone.title',
      lockedDescriptionKey: 'proFeatures.event_clone.description',
      lockedCtaKey: 'proFeatures.event_clone.ctaLabel',
      adminLabelKey: 'features.event_clone.label',
      adminDescriptionKey: 'features.event_clone.description',
    },
    owner: 'Product/Eng',
    notes: 'Stage 1 pilot: clone event',
  },
  coupons: {
    key: 'coupons',
    defaultVisibility: 'hidden',
    enforcement: 'server_required',
    upsellHref: '/settings/billing',
    i18n: {
      lockedTitleKey: 'proFeatures.coupons.title',
      lockedDescriptionKey: 'proFeatures.coupons.description',
      lockedCtaKey: 'proFeatures.coupons.ctaLabel',
      adminLabelKey: 'features.coupons.label',
      adminDescriptionKey: 'features.coupons.description',
    },
    owner: 'Product/Eng',
    notes: 'Stage 1 pilot: coupons management',
  },
};

export function getProFeatureMeta(key: ProFeatureKey): ProFeatureCatalogEntry {
  return PRO_FEATURE_CATALOG[key];
}

export function getAllProFeatureKeys(): ProFeatureKey[] {
  return Object.keys(PRO_FEATURE_CATALOG) as ProFeatureKey[];
}
