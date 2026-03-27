import type { PricingTierData } from './actions';

type PricingTierContractInput = Pick<
  PricingTierData,
  'id' | 'distanceId' | 'label' | 'startsAt' | 'endsAt' | 'priceCents' | 'currency' | 'sortOrder'
>;

type PricingTierCandidate = Pick<PricingTierContractInput, 'startsAt' | 'endsAt'> & {
  id?: string;
};

function effectiveRangeStart(date: Date | null): Date {
  return date ?? new Date(0);
}

function effectiveRangeEnd(date: Date | null): Date {
  return date ?? new Date('9999-12-31');
}

export function isEvergreenPricingTier(tier: Pick<PricingTierContractInput, 'startsAt' | 'endsAt'>): boolean {
  return tier.startsAt === null && tier.endsAt === null;
}

export function isBoundedPricingTier(tier: Pick<PricingTierContractInput, 'startsAt' | 'endsAt'>): boolean {
  return !isEvergreenPricingTier(tier);
}

export function dateRangesOverlap(
  start1: Date | null,
  end1: Date | null,
  start2: Date | null,
  end2: Date | null,
): boolean {
  const effectiveStart1 = effectiveRangeStart(start1);
  const effectiveEnd1 = effectiveRangeEnd(end1);
  const effectiveStart2 = effectiveRangeStart(start2);
  const effectiveEnd2 = effectiveRangeEnd(end2);

  return effectiveStart1 < effectiveEnd2 && effectiveEnd1 > effectiveStart2;
}

export function pricingTiersConflict(
  candidate: PricingTierCandidate,
  existing: Pick<PricingTierContractInput, 'startsAt' | 'endsAt'>,
): boolean {
  if (!dateRangesOverlap(candidate.startsAt, candidate.endsAt, existing.startsAt, existing.endsAt)) {
    return false;
  }

  // One evergreen fallback price is allowed to coexist with bounded schedule tiers.
  if (isEvergreenPricingTier(candidate) !== isEvergreenPricingTier(existing)) {
    return false;
  }

  return true;
}

export function findConflictingPricingTier(
  candidate: PricingTierCandidate,
  existingTiers: PricingTierContractInput[],
): PricingTierContractInput | null {
  for (const tier of existingTiers) {
    if (candidate.id && tier.id === candidate.id) continue;
    if (pricingTiersConflict(candidate, tier)) {
      return tier;
    }
  }

  return null;
}

function isTierActive(tier: Pick<PricingTierContractInput, 'startsAt' | 'endsAt'>, now: Date): boolean {
  const hasStarted = !tier.startsAt || now >= tier.startsAt;
  const hasNotEnded = !tier.endsAt || now < tier.endsAt;
  return hasStarted && hasNotEnded;
}

function compareStartsAtAsc(
  a: Pick<PricingTierContractInput, 'startsAt' | 'sortOrder'>,
  b: Pick<PricingTierContractInput, 'startsAt' | 'sortOrder'>,
): number {
  const aTime = a.startsAt?.getTime() ?? Number.MIN_SAFE_INTEGER;
  const bTime = b.startsAt?.getTime() ?? Number.MIN_SAFE_INTEGER;
  if (aTime !== bTime) return aTime - bTime;
  return a.sortOrder - b.sortOrder;
}

function compareStartsAtDesc(
  a: Pick<PricingTierContractInput, 'startsAt' | 'sortOrder'>,
  b: Pick<PricingTierContractInput, 'startsAt' | 'sortOrder'>,
): number {
  return compareStartsAtAsc(b, a);
}

export function selectCurrentAndNextPricingTiers<T extends PricingTierContractInput>(
  tiers: T[],
  now = new Date(),
): { currentTier: T | null; nextTier: T | null } {
  if (tiers.length === 0) {
    return { currentTier: null, nextTier: null };
  }

  const activeBounded = tiers
    .filter((tier) => isBoundedPricingTier(tier) && isTierActive(tier, now))
    .sort(compareStartsAtDesc);

  const activeEvergreen = tiers
    .filter((tier) => isEvergreenPricingTier(tier) && isTierActive(tier, now))
    .sort(compareStartsAtAsc);

  const futureBounded = tiers
    .filter((tier) => isBoundedPricingTier(tier) && tier.startsAt && tier.startsAt > now)
    .sort(compareStartsAtAsc);

  const currentTier = activeBounded[0] ?? activeEvergreen[0] ?? [...tiers].sort(compareStartsAtAsc)[0] ?? null;
  const nextTier = futureBounded[0] ?? null;

  return { currentTier, nextTier };
}
