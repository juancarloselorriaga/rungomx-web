import type { ProFeatureEnforcement, ProFeatureVisibility } from './types';

export type ProFeatureKey = 'event_clone' | 'coupons' | 'event_ai_wizard';

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
  event_ai_wizard: {
    key: 'event_ai_wizard',
    defaultVisibility: 'locked',
    enforcement: 'server_required',
    upsellHref: '/settings/billing',
    i18n: {
      lockedTitleKey: 'proFeatures.event_ai_wizard.title',
      lockedDescriptionKey: 'proFeatures.event_ai_wizard.description',
      lockedCtaKey: 'proFeatures.event_ai_wizard.ctaLabel',
      adminLabelKey: 'features.event_ai_wizard.label',
      adminDescriptionKey: 'features.event_ai_wizard.description',
    },
    owner: 'Product/Eng',
    notes: 'Conversational event creation wizard',
  },
};

export function getProFeatureMeta(key: ProFeatureKey): ProFeatureCatalogEntry {
  return PRO_FEATURE_CATALOG[key];
}

export function getAllProFeatureKeys(): ProFeatureKey[] {
  return Object.keys(PRO_FEATURE_CATALOG) as ProFeatureKey[];
}
