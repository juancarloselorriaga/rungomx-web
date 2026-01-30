import { evaluateProEntitlement } from '@/lib/billing/entitlements';
import type { EntitlementInterval } from '@/lib/billing/types';

describe('evaluateProEntitlement', () => {
  const now = new Date('2026-01-10T12:00:00Z');

  const makeInterval = (partial: Partial<EntitlementInterval>): EntitlementInterval => ({
    source: 'trial',
    startsAt: new Date('2026-01-01T00:00:00Z'),
    endsAt: new Date('2026-01-05T00:00:00Z'),
    ...partial,
  });

  it('returns not Pro when now equals endsAt', () => {
    const intervals = [
      makeInterval({
        startsAt: new Date('2026-01-10T10:00:00Z'),
        endsAt: now,
      }),
    ];

    const result = evaluateProEntitlement({ now, isInternal: false, intervals });

    expect(result.isPro).toBe(false);
    expect(result.proUntil).toBeNull();
  });

  it('merges contiguous intervals and returns merged proUntil', () => {
    const intervals = [
      makeInterval({
        source: 'trial',
        startsAt: new Date('2026-01-10T08:00:00Z'),
        endsAt: new Date('2026-01-10T14:00:00Z'),
      }),
      makeInterval({
        source: 'promotion',
        startsAt: new Date('2026-01-10T14:00:00Z'),
        endsAt: new Date('2026-01-12T00:00:00Z'),
      }),
    ];

    const result = evaluateProEntitlement({ now, isInternal: false, intervals });

    expect(result.isPro).toBe(true);
    expect(result.proUntil?.toISOString()).toBe('2026-01-12T00:00:00.000Z');
  });

  it('uses the max-extension interval as effectiveSource', () => {
    const intervals = [
      makeInterval({
        source: 'subscription',
        startsAt: new Date('2026-01-09T00:00:00Z'),
        endsAt: new Date('2026-01-11T00:00:00Z'),
      }),
      makeInterval({
        source: 'promotion',
        startsAt: new Date('2026-01-10T00:00:00Z'),
        endsAt: new Date('2026-01-15T00:00:00Z'),
      }),
    ];

    const result = evaluateProEntitlement({ now, isInternal: false, intervals });

    expect(result.isPro).toBe(true);
    expect(result.proUntil?.toISOString()).toBe('2026-01-15T00:00:00.000Z');
    expect(result.effectiveSource).toBe('promotion');
  });

  it('returns internal bypass for internal users', () => {
    const result = evaluateProEntitlement({ now, isInternal: true, intervals: [] });

    expect(result.isPro).toBe(true);
    expect(result.proUntil).toBeNull();
    expect(result.effectiveSource).toBe('internal_bypass');
  });
});
