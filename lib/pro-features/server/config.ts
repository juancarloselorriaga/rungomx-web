import { db } from '@/db';
import { proFeatureConfigs } from '@/db/schema';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';
import { getAllProFeatureKeys, getProFeatureMeta, PRO_FEATURE_CATALOG, type ProFeatureKey } from '../catalog';
import type { ResolvedProFeatureConfig } from '../types';
import { proFeaturesConfigTag } from '../cache-tags';

export async function getProFeatureConfigSnapshot(): Promise<
  Record<ProFeatureKey, ResolvedProFeatureConfig<ProFeatureKey>>
> {
  'use cache: remote';
  safeCacheTag(proFeaturesConfigTag());
  safeCacheLife({ expire: 60 });

  const rows = await db.query.proFeatureConfigs.findMany();
  const rowMap = new Map<string, typeof proFeatureConfigs.$inferSelect>();

  rows.forEach((row) => {
    if (!(row.featureKey in PRO_FEATURE_CATALOG)) {
      console.warn(`[pro-features] Unknown feature key found in config table: ${row.featureKey}`);
      return;
    }
    rowMap.set(row.featureKey, row);
  });

  const snapshot = {} as Record<ProFeatureKey, ResolvedProFeatureConfig<ProFeatureKey>>;

  for (const key of getAllProFeatureKeys()) {
    const meta = getProFeatureMeta(key);
    const row = rowMap.get(key);

    snapshot[key] = {
      id: row?.id,
      featureKey: key,
      enabled: row?.enabled ?? true,
      visibilityOverride: (row?.visibilityOverride ?? null) as ResolvedProFeatureConfig<
        ProFeatureKey
      >['visibilityOverride'],
      notes: row?.notes ?? null,
      defaultVisibility: meta.defaultVisibility,
      enforcement: meta.enforcement,
      upsellHref: meta.upsellHref,
    };
  }

  return snapshot;
}
