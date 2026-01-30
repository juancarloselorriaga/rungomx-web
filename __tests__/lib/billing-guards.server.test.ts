import type { EntitlementEvaluationResult } from '@/lib/billing/types';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { ProAccessError, requireProEntitlement } from '@/lib/billing/guards';

jest.mock('@/lib/billing/entitlements', () => ({
  getProEntitlementForUser: jest.fn(),
}));

describe('requireProEntitlement', () => {
  const mockGetProEntitlementForUser = jest.mocked(getProEntitlementForUser);

  const baseResult: EntitlementEvaluationResult = {
    isPro: false,
    proUntil: null,
    effectiveSource: null,
    sources: [],
    nextProStartsAt: null,
  };

  it('throws when user is not Pro', async () => {
    mockGetProEntitlementForUser.mockResolvedValueOnce(baseResult);

    await expect(
      requireProEntitlement({ userId: 'user-1', isInternal: false }),
    ).rejects.toThrow(ProAccessError);
  });

  it('returns entitlement when user has an active override', async () => {
    const now = new Date('2026-01-15T10:00:00Z');
    const expectedUntil = new Date('2026-02-10T00:00:00Z');
    const resultPayload: EntitlementEvaluationResult = {
      ...baseResult,
      isPro: true,
      proUntil: expectedUntil,
      effectiveSource: 'admin_override',
    };
    mockGetProEntitlementForUser.mockResolvedValueOnce(resultPayload);

    const result = await requireProEntitlement({ userId: 'user-2', isInternal: false, now });

    expect(result.isPro).toBe(true);
    expect(result.proUntil?.toISOString()).toBe('2026-02-10T00:00:00.000Z');
  });

  it('allows internal bypass', async () => {
    const resultPayload: EntitlementEvaluationResult = {
      ...baseResult,
      isPro: true,
      proUntil: null,
      effectiveSource: 'internal_bypass',
    };
    mockGetProEntitlementForUser.mockResolvedValueOnce(resultPayload);

    const result = await requireProEntitlement({ userId: 'user-3', isInternal: true });

    expect(result.isPro).toBe(true);
    expect(result.effectiveSource).toBe('internal_bypass');
  });
});
