import { db } from '@/db';
import { proFeatureUsageEvents } from '@/db/schema';
import type { ProFeatureKey } from '../catalog';
import type { ProFeatureUsageEventType } from '../types';

export async function trackProFeatureEvent({
  featureKey,
  userId,
  eventType,
  meta,
}: {
  featureKey: ProFeatureKey;
  userId: string;
  eventType: ProFeatureUsageEventType;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.insert(proFeatureUsageEvents).values({
      featureKey,
      userId,
      eventType,
      meta: meta ?? {},
    });
  } catch (error) {
    console.error('[pro-features] Failed to track usage event', error);
  }
}
