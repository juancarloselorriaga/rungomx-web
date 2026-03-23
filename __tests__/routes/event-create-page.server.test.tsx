import { renderToStaticMarkup } from 'react-dom/server';

import CreateEventPage from '@/app/[locale]/(protected)/dashboard/events/new/page';
import { getAuthContext } from '@/lib/auth/server';
import { getProEntitlementForUser } from '@/lib/billing/entitlements';
import { getOrganizationEventSeries } from '@/lib/events/queries';
import { getUserOrganizations } from '@/lib/organizations/queries';
import { getProFeatureConfigSnapshot } from '@/lib/pro-features/server/config';

const mockCreateEventForm = jest.fn((_props?: unknown) => null);

jest.mock('@/app/[locale]/(protected)/dashboard/events/new/create-event-form', () => ({
  CreateEventForm: (props: unknown) => mockCreateEventForm(props),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/billing/entitlements', () => ({
  getProEntitlementForUser: jest.fn(),
}));

jest.mock('@/lib/organizations/queries', () => ({
  getUserOrganizations: jest.fn(),
}));

jest.mock('@/lib/events/queries', () => ({
  getOrganizationEventSeries: jest.fn(),
}));

jest.mock('@/lib/pro-features/server/config', () => ({
  getProFeatureConfigSnapshot: jest.fn(),
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(async () => ({})),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`),
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetProEntitlementForUser = getProEntitlementForUser as jest.MockedFunction<typeof getProEntitlementForUser>;
const mockGetUserOrganizations = getUserOrganizations as jest.MockedFunction<typeof getUserOrganizations>;
const mockGetOrganizationEventSeries = getOrganizationEventSeries as jest.MockedFunction<typeof getOrganizationEventSeries>;
const mockGetProFeatureConfigSnapshot = getProFeatureConfigSnapshot as jest.MockedFunction<typeof getProFeatureConfigSnapshot>;

describe('CreateEventPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateEventForm.mockReturnValue(null);
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      isInternal: false,
      permissions: {
        canViewOrganizersDashboard: true,
        canManageEvents: false,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);
    mockGetUserOrganizations.mockResolvedValue([
      {
        id: 'org-1',
        name: 'TrailMX',
        slug: 'trailmx',
        role: 'owner',
      },
    ] as Awaited<ReturnType<typeof getUserOrganizations>>);
    mockGetOrganizationEventSeries.mockResolvedValue([]);
    mockGetProEntitlementForUser.mockResolvedValue({
      isPro: true,
      proUntil: null,
      effectiveSource: 'subscription',
      sources: [],
      nextProStartsAt: null,
    });
  });

  it('hides the AI context disclosure when the feature is disabled', async () => {
    mockGetProFeatureConfigSnapshot.mockResolvedValue({
      event_clone: {
        id: 'cfg-1',
        featureKey: 'event_clone',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: 'locked',
        enforcement: 'server_required',
        upsellHref: '/settings/billing',
      },
      coupons: {
        id: 'cfg-2',
        featureKey: 'coupons',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: 'hidden',
        enforcement: 'server_required',
        upsellHref: '/settings/billing',
      },
      event_ai_wizard: {
        id: 'cfg-3',
        featureKey: 'event_ai_wizard',
        enabled: false,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: 'locked',
        enforcement: 'server_required',
        upsellHref: '/settings/billing',
      },
    });

    renderToStaticMarkup(
      await CreateEventPage({
        params: Promise.resolve({ locale: 'en' }),
      }),
    );

    expect(mockCreateEventForm).toHaveBeenCalledWith(
      expect.objectContaining({
        showAiContextDisclosure: false,
      }),
    );
  });

  it('passes the AI disclosure when the feature is enabled for a Pro user', async () => {
    mockGetProFeatureConfigSnapshot.mockResolvedValue({
      event_clone: {
        id: 'cfg-1',
        featureKey: 'event_clone',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: 'locked',
        enforcement: 'server_required',
        upsellHref: '/settings/billing',
      },
      coupons: {
        id: 'cfg-2',
        featureKey: 'coupons',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: 'hidden',
        enforcement: 'server_required',
        upsellHref: '/settings/billing',
      },
      event_ai_wizard: {
        id: 'cfg-3',
        featureKey: 'event_ai_wizard',
        enabled: true,
        visibilityOverride: null,
        notes: null,
        defaultVisibility: 'locked',
        enforcement: 'server_required',
        upsellHref: '/settings/billing',
      },
    });

    renderToStaticMarkup(
      await CreateEventPage({
        params: Promise.resolve({ locale: 'en' }),
      }),
    );

    expect(mockCreateEventForm).toHaveBeenCalledWith(
      expect.objectContaining({
        showAiContextDisclosure: true,
      }),
    );
  });
});
