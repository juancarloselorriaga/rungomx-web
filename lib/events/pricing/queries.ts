import { and, asc, eq, isNull } from 'drizzle-orm';
import { cacheLife, cacheTag } from 'next/cache';

import { db } from '@/db';
import { eventDistances, pricingTiers } from '@/db/schema';
import { eventEditionPricingTag } from '../cache-tags';
import type { CurrentPricing, PricingTierData } from './actions';

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

  // Find the current tier (now is within startsAt and endsAt, or unbounded)
  let currentTier: PricingTierData | null = null;
  let nextTier: PricingTierData | null = null;

  for (const tier of allTiers) {
    const startsAtDate = tier.startsAt;
    const endsAtDate = tier.endsAt;

    // Check if this tier is currently active
    const hasStarted = !startsAtDate || now >= startsAtDate;
    const hasNotEnded = !endsAtDate || now < endsAtDate;

    if (hasStarted && hasNotEnded) {
      currentTier = {
        id: tier.id,
        distanceId: tier.distanceId,
        label: tier.label,
        startsAt: tier.startsAt,
        endsAt: tier.endsAt,
        priceCents: tier.priceCents,
        currency: tier.currency,
        sortOrder: tier.sortOrder,
      };
      break;
    }
  }

  // Find the next upcoming tier (starts in the future)
  for (const tier of allTiers) {
    if (tier.startsAt && tier.startsAt > now) {
      // Skip if this is the current tier
      if (currentTier && tier.id === currentTier.id) continue;

      nextTier = {
        id: tier.id,
        distanceId: tier.distanceId,
        label: tier.label,
        startsAt: tier.startsAt,
        endsAt: tier.endsAt,
        priceCents: tier.priceCents,
        currency: tier.currency,
        sortOrder: tier.sortOrder,
      };
      break;
    }
  }

  // If no current tier found, use the first available tier as fallback
  if (!currentTier && allTiers.length > 0) {
    const fallback = allTiers[0];
    currentTier = {
      id: fallback.id,
      distanceId: fallback.distanceId,
      label: fallback.label,
      startsAt: fallback.startsAt,
      endsAt: fallback.endsAt,
      priceCents: fallback.priceCents,
      currency: fallback.currency,
      sortOrder: fallback.sortOrder,
    };
  }

  return {
    currentTier,
    nextTier,
    allTiers: allTiers.map((t) => ({
      id: t.id,
      distanceId: t.distanceId,
      label: t.label,
      startsAt: t.startsAt,
      endsAt: t.endsAt,
      priceCents: t.priceCents,
      currency: t.currency,
      sortOrder: t.sortOrder,
    })),
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
  cacheTag(eventEditionPricingTag(editionId));
  cacheLife({ expire: 60 });

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
    const tiers = d.pricingTiers;

    // Find current tier
    let currentPriceCents: number | null = null;
    let nextPriceIncrease: { date: Date; priceCents: number } | null = null;

    for (const tier of tiers) {
      const hasStarted = !tier.startsAt || now >= tier.startsAt;
      const hasNotEnded = !tier.endsAt || now < tier.endsAt;

      if (hasStarted && hasNotEnded) {
        currentPriceCents = tier.priceCents;
      } else if (tier.startsAt && tier.startsAt > now && !nextPriceIncrease) {
        nextPriceIncrease = {
          date: tier.startsAt,
          priceCents: tier.priceCents,
        };
      }
    }

    // Fallback to first tier if no current found
    if (currentPriceCents === null && tiers.length > 0) {
      currentPriceCents = tiers[0].priceCents;
    }

    return {
      distanceId: d.id,
      distanceLabel: d.label,
      currentPriceCents,
      nextPriceIncrease,
      tiers: tiers.map((t) => ({
        id: t.id,
        distanceId: t.distanceId,
        label: t.label,
        startsAt: t.startsAt,
        endsAt: t.endsAt,
        priceCents: t.priceCents,
        currency: t.currency,
        sortOrder: t.sortOrder,
      })),
    };
  });
}
