import {
  findConflictingPricingTier,
  selectCurrentAndNextPricingTiers,
} from '@/lib/events/pricing/contracts';

function makeTier(overrides: Partial<{
  id: string;
  distanceId: string;
  label: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  priceCents: number;
  currency: string;
  sortOrder: number;
}> = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    distanceId: overrides.distanceId ?? 'dist-1',
    label: overrides.label ?? null,
    startsAt: overrides.startsAt ?? null,
    endsAt: overrides.endsAt ?? null,
    priceCents: overrides.priceCents ?? 7900,
    currency: overrides.currency ?? 'MXN',
    sortOrder: overrides.sortOrder ?? 0,
  };
}

describe('pricing contracts', () => {
  it('allows bounded schedule tiers alongside an existing evergreen fallback tier', () => {
    const existing = [
      makeTier({
        id: 'fallback',
        label: 'Standard',
        startsAt: null,
        endsAt: null,
        sortOrder: 0,
      }),
    ];

    const conflict = findConflictingPricingTier(
      {
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-03-01T00:00:00.000Z'),
      },
      existing,
    );

    expect(conflict).toBeNull();
  });

  it('still blocks overlapping bounded pricing tiers', () => {
    const existing = [
      makeTier({
        id: 'early',
        label: 'Early bird',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-03-01T00:00:00.000Z'),
        sortOrder: 1,
      }),
    ];

    const conflict = findConflictingPricingTier(
      {
        startsAt: new Date('2026-02-15T00:00:00.000Z'),
        endsAt: new Date('2026-03-15T00:00:00.000Z'),
      },
      existing,
    );

    expect(conflict?.id).toBe('early');
  });

  it('prevents multiple evergreen tiers from coexisting', () => {
    const existing = [
      makeTier({
        id: 'fallback',
        label: 'Standard',
        startsAt: null,
        endsAt: null,
        sortOrder: 0,
      }),
    ];

    const conflict = findConflictingPricingTier(
      {
        startsAt: null,
        endsAt: null,
      },
      existing,
    );

    expect(conflict?.id).toBe('fallback');
  });

  it('prefers an active bounded tier over an evergreen fallback when resolving current pricing', () => {
    const now = new Date('2026-02-20T12:00:00.000Z');
    const tiers = [
      makeTier({
        id: 'fallback',
        label: 'Standard',
        startsAt: null,
        endsAt: null,
        priceCents: 9900,
        sortOrder: 0,
      }),
      makeTier({
        id: 'early',
        label: 'Early bird',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-03-01T00:00:00.000Z'),
        priceCents: 7900,
        sortOrder: 1,
      }),
      makeTier({
        id: 'late',
        label: 'Late',
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: new Date('2026-04-01T00:00:00.000Z'),
        priceCents: 10900,
        sortOrder: 2,
      }),
    ];

    const { currentTier, nextTier } = selectCurrentAndNextPricingTiers(tiers, now);

    expect(currentTier?.id).toBe('early');
    expect(nextTier?.id).toBe('late');
  });

  it('falls back to the evergreen tier when no bounded window is currently active', () => {
    const now = new Date('2026-01-15T12:00:00.000Z');
    const tiers = [
      makeTier({
        id: 'fallback',
        label: 'Standard',
        startsAt: null,
        endsAt: null,
        priceCents: 9900,
        sortOrder: 0,
      }),
      makeTier({
        id: 'early',
        label: 'Early bird',
        startsAt: new Date('2026-02-01T00:00:00.000Z'),
        endsAt: new Date('2026-03-01T00:00:00.000Z'),
        priceCents: 7900,
        sortOrder: 1,
      }),
    ];

    const { currentTier, nextTier } = selectCurrentAndNextPricingTiers(tiers, now);

    expect(currentTier?.id).toBe('fallback');
    expect(nextTier?.id).toBe('early');
  });
});
