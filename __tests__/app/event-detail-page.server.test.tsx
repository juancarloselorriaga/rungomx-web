import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import EventDetailPage from '@/app/[locale]/(protected)/dashboard/events/[eventId]/page';
import type { EventEditionDetail } from '@/lib/events/editions/queries';
import { getAuthContext } from '@/lib/auth/server';
import { getEventEditionDetail } from '@/lib/events/queries';
import { canUserAccessSeries } from '@/lib/organizations/permissions';
import { redirect } from 'next/navigation';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(async () => ({})),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async (namespace?: string) => {
    const dashboardEventsMessages: Record<string, string> = {
      registrationCount: 'registrations',
    };
    const detailMessages: Record<string, string> = {
      eventDate: 'Event Date',
      location: 'Location',
      distances: 'Distances',
      registrations: 'Registrations',
      'capacity.title': 'Capacity status',
      'capacity.sharedPool': 'Shared pool across all distances',
      'capacity.perDistance': 'Capacity set per distance',
      'capacity.totalLabel': 'Total capacity',
      'capacity.remainingLabel': 'Spots remaining',
      'capacity.unlimited': 'Unlimited',
      'capacity.soldOut': 'Sold out',
      'capacity.distanceLimit': 'total spots',
      'capacity.viewAll': 'View all more distances',
      distancesTitle: 'Distances',
      noDistances: 'No distances added yet. Go to settings to add distances.',
      faqTitle: 'FAQ',
      editFaq: 'Edit all',
      viewAllFaq: '+1 more questions',
    };

    const messages =
      namespace === 'pages.dashboardEvents.detail' ? detailMessages : dashboardEventsMessages;

    return (key: string) => messages[key] ?? key;
  }),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/events/queries', () => ({
  getEventEditionDetail: jest.fn(),
}));

jest.mock('@/lib/organizations/permissions', () => ({
  canUserAccessSeries: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(({ href, locale }: { href: string; locale: string }) => `/${locale}${href}`),
  Link: ({
    href,
    children,
    ...props
  }: {
    href:
      | string
      | {
          pathname: string;
          params?: Record<string, string>;
          query?: Record<string, string>;
        };
    children: ReactNode;
  }) => {
    const resolvedHref =
      typeof href === 'string'
        ? href
        : `${Object.entries(href.params ?? {}).reduce(
            (pathname, [key, value]) => pathname.replace(`[${key}]`, value),
            href.pathname,
          )}${(() => {
            const query = new URLSearchParams(href.query ?? {}).toString();
            return query ? `?${query}` : '';
          })()}`;

    return (
      <a href={resolvedHref} {...props}>
        {children}
      </a>
    );
  },
}));

jest.mock('@/components/ui/surface', () => ({
  Surface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  InsetSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetEventEditionDetail = getEventEditionDetail as jest.MockedFunction<
  typeof getEventEditionDetail
>;
const mockCanUserAccessSeries = canUserAccessSeries as jest.MockedFunction<
  typeof canUserAccessSeries
>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('EventDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: {
        canViewOrganizersDashboard: true,
        canManageEvents: false,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);
    mockCanUserAccessSeries.mockResolvedValue({ role: 'owner' } as Awaited<
      ReturnType<typeof canUserAccessSeries>
    >);
    mockGetEventEditionDetail.mockResolvedValue({
      id: 'event-1',
      publicCode: 'EVT-1',
      seriesId: 'series-1',
      seriesName: 'TrailMX',
      editionLabel: '2026',
      organizationName: 'TrailMX Org',
      organizationId: 'org-1',
      organizationSlug: 'trailmx-org',
      seriesSlug: 'trailmx',
      sportType: 'trail_running',
      slug: 'trailmx-2026',
      visibility: 'draft',
      description: 'A premium trail experience.',
      organizerBrief: null,
      startsAt: new Date('2026-05-01T00:00:00Z'),
      endsAt: null,
      timezone: 'America/Mexico_City',
      registrationOpensAt: null,
      registrationClosesAt: null,
      isRegistrationPaused: false,
      city: 'Valle de Bravo',
      state: 'Estado de Mexico',
      locationDisplay: 'Valle de Bravo, Estado de Mexico',
      address: null,
      country: 'MX',
      latitude: null,
      longitude: null,
      externalUrl: null,
      heroImageMediaId: null,
      heroImageUrl: null,
      sharedCapacity: null,
      faqItems: [
        {
          id: 'faq-1',
          question: 'What is included?',
          answer: 'Aid stations and medal.',
          sortOrder: 1,
        },
      ],
      waivers: [],
      policyConfig: null,
      distances: [
        {
          id: 'dist-1',
          label: '10K',
          registrationCount: 12,
          capacityScope: 'per_distance',
          capacity: 50,
          distanceValue: 10,
          distanceUnit: 'km',
          kind: 'race',
          startTimeLocal: null,
          timeLimitMinutes: null,
          terrain: 'trail',
          isVirtual: false,
          sortOrder: 0,
          priceCents: 50000,
          currency: 'MXN',
          pricingTierCount: 1,
          hasBoundedPricingTier: true,
        },
      ],
    } as unknown as EventEditionDetail);
  });

  it('renders overview sections with capacity, distances, and faq preview', async () => {
    const html = renderToStaticMarkup(
      await EventDetailPage({
        params: Promise.resolve({ locale: 'en', eventId: 'event-1' }),
      }),
    );

    expect(html).toContain('Capacity status');
    expect(html).toContain('Distances');
    expect(html).toContain('FAQ');
    expect(html).toContain('Valle de Bravo, Estado de Mexico');
    expect(html).toContain('What is included?');
  });

  it('redirects users without organizer or staff event access', async () => {
    mockGetAuthContext.mockResolvedValue({
      user: { id: 'user-1' },
      permissions: {
        canViewOrganizersDashboard: false,
        canManageEvents: false,
      },
    } as Awaited<ReturnType<typeof getAuthContext>>);

    await expect(
      EventDetailPage({
        params: Promise.resolve({ locale: 'en', eventId: 'event-1' }),
      }),
    ).rejects.toThrow('REDIRECT:/en/dashboard');

    expect(mockRedirect).toHaveBeenCalledWith('/en/dashboard');
  });
});
