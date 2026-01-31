jest.mock('@/lib/pro-features/server/config', () => ({
  getProFeatureConfigSnapshot: jest.fn(),
}));

jest.mock('@/lib/billing/entitlements', () => ({
  getProEntitlementForUser: jest.fn(),
}));

jest.mock('@/lib/pro-features/server/tracking', () => ({
  trackProFeatureEvent: jest.fn(),
}));

jest.mock('@/components/billing/pro-locked-card', () => ({
  ProLockedCard: () => null,
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

import type { AuthenticatedContext } from '@/lib/auth/guards';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { getProFeatureConfigSnapshot } from '@/lib/pro-features/server/config';
import { trackProFeatureEvent } from '@/lib/pro-features/server/tracking';
import { getProFeatureMeta } from '@/lib/pro-features/catalog';
import { ProFeatureAccessError, requireProFeature } from '@/lib/pro-features/server/guard';

const mockEntitlement = getProEntitlementForUser as jest.MockedFunction<typeof getProEntitlementForUser>;
const mockSnapshot = getProFeatureConfigSnapshot as jest.MockedFunction<typeof getProFeatureConfigSnapshot>;
const mockTrack = trackProFeatureEvent as jest.MockedFunction<typeof trackProFeatureEvent>;

describe('Pro feature guard', () => {
  const authContext = {
    user: { id: 'user-1' },
    isInternal: false,
    permissions: {
      canAccessAdminArea: false,
      canAccessUserArea: true,
      canManageUsers: false,
      canManageEvents: false,
      canViewStaffTools: false,
      canViewOrganizersDashboard: true,
      canViewAthleteDashboard: false,
    },
  } as AuthenticatedContext;

  beforeEach(() => {
    jest.clearAllMocks();
    const meta = getProFeatureMeta('event_clone');
    mockSnapshot.mockResolvedValue({
      event_clone: {
        id: 'cfg-1',
        featureKey: 'event_clone',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: meta.defaultVisibility,
        enforcement: meta.enforcement,
        upsellHref: meta.upsellHref,
      },
      coupons: {
        id: 'cfg-2',
        featureKey: 'coupons',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: getProFeatureMeta('coupons').defaultVisibility,
        enforcement: getProFeatureMeta('coupons').enforcement,
        upsellHref: getProFeatureMeta('coupons').upsellHref,
      },
    });
  });

  it('blocks non-Pro users for server-required features', async () => {
    mockEntitlement.mockResolvedValue({
      isPro: false,
      proUntil: null,
      effectiveSource: null,
      sources: [],
      nextProStartsAt: null,
    });

    await expect(requireProFeature('event_clone', authContext)).rejects.toBeInstanceOf(
      ProFeatureAccessError,
    );
    expect(mockTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        featureKey: 'event_clone',
        userId: authContext.user.id,
        eventType: 'blocked',
      }),
    );
  });

  it('allows Pro users to pass the guard', async () => {
    mockEntitlement.mockResolvedValue({
      isPro: true,
      proUntil: null,
      effectiveSource: 'subscription',
      sources: [],
      nextProStartsAt: null,
    });

    const decision = await requireProFeature('event_clone', authContext);

    expect(decision.status).toBe('enabled');
  });
});
