import { and, asc, eq, isNull } from 'drizzle-orm';

import { db } from '@/db';
import { eventDistances, pricingTiers } from '@/db/schema';
import { eventEditionPricingTag } from '../cache-tags';
import { safeCacheLife, safeCacheTag } from '@/lib/next-cache';
import type { CurrentPricing, PricingTierData } from './actions';
import { selectCurrentAndNextPricingTiers } from './contracts';

/**
 * Get all pricing tiers for a distance.
 */
export async function getPricingTiersForDistance(distanceId: string): Promise<PricingTierData[]> {
  const tiers = await db.query.pricingTiers.findMany({
    where: and(eq(pricingTiers.distanceId, distanceId), isNull(pricingTiers.deletedAt)),
    orderBy: [asc(pricingTiers.sortOrder)],
  });

  return tiers.map((t) => ({
    id: t.id,
    distanceId: t.distanceId,
    label: t.label,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    priceCents: t.priceCents,
    currency: t.currency,
    sortOrder: t.sortOrder,
  }));
}

/**
 * Get the current pricing information for a distance.
 * Returns the current active tier and the next upcoming tier for "next price increase" display.
 */
export async function getCurrentPricing(distanceId: string): Promise<CurrentPricing> {
  const now = new Date();

  const allTiers = await db.query.pricingTiers.findMany({
    where: and(eq(pricingTiers.distanceId, distanceId), isNull(pricingTiers.deletedAt)),
    orderBy: [asc(pricingTiers.startsAt), asc(pricingTiers.sortOrder)],
  });

  if (allTiers.length === 0) {
    return { currentTier: null, nextTier: null, allTiers: [] };
  }

  const mappedTiers = allTiers.map((t) => ({
    id: t.id,
    distanceId: t.distanceId,
    label: t.label,
    startsAt: t.startsAt,
    endsAt: t.endsAt,
    priceCents: t.priceCents,
    currency: t.currency,
    sortOrder: t.sortOrder,
  }));
  const { currentTier, nextTier } = selectCurrentAndNextPricingTiers(mappedTiers, now);

  return {
    currentTier,
    nextTier,
    allTiers: mappedTiers,
  };
}

/**
 * Get the current price in cents for a distance.
 * Returns null if no pricing tier is found.
 */
export async function getCurrentPriceCents(distanceId: string): Promise<number | null> {
  const { currentTier } = await getCurrentPricing(distanceId);
  return currentTier?.priceCents ?? null;
}

/**
 * Get pricing schedule display data for an edition.
 * Returns all distances with their pricing tiers for display on event pages.
 */
export async function getPricingScheduleForEdition(
  editionId: string,
): Promise<
  Array<{
    distanceId: string;
    distanceLabel: string;
    currentPriceCents: number | null;
    nextPriceIncrease: { date: Date; priceCents: number } | null;
    tiers: PricingTierData[];
  }>
> {
  'use cache: remote';
  safeCacheTag(eventEditionPricingTag(editionId));
  safeCacheLife({ expire: 60 });

  // Get all distances for this edition with their pricing tiers
  const distances = await db.query.eventDistances.findMany({
    where: and(
      eq(eventDistances.editionId, editionId),
      isNull(eventDistances.deletedAt),
    ),
    with: {
      pricingTiers: {
        where: isNull(pricingTiers.deletedAt),
        orderBy: [asc(pricingTiers.startsAt), asc(pricingTiers.sortOrder)],
      },
    },
  });

  const now = new Date();

  return distances.map((d) => {
    const tiers = d.pricingTiers.map((t) => ({
      id: t.id,
      distanceId: t.distanceId,
      label: t.label,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      priceCents: t.priceCents,
      currency: t.currency,
      sortOrder: t.sortOrder,
    }));
    const { currentTier, nextTier } = selectCurrentAndNextPricingTiers(tiers, now);
    const currentPriceCents = currentTier?.priceCents ?? null;
    const nextPriceIncrease = nextTier?.startsAt
      ? { date: nextTier.startsAt, priceCents: nextTier.priceCents }
      : null;

    return {
      distanceId: d.id,
      distanceLabel: d.label,
      currentPriceCents,
      nextPriceIncrease,
      tiers,
    };
  });
}
