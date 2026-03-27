import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import MyRegistrationsPage from '@/app/[locale]/(protected)/dashboard/my-registrations/page';
import { getAuthContext } from '@/lib/auth/server';
import { getMyRegistrations } from '@/lib/events/queries';
import { redirect } from 'next/navigation';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(async () => ({})),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => {
    const messages: Record<string, string> = {
      title: 'My registrations',
      description: 'Review your registrations.',
      'tabs.upcoming': 'Upcoming',
      'tabs.inProgress': 'In progress',
      'tabs.past': 'Past',
      'tabs.cancelled': 'Cancelled',
      'emptyState.title': 'No registrations yet',
      'emptyState.description': 'Browse events to get started.',
      'emptyState.action': 'Browse events',
      'actions.viewEvent': 'View event',
      'actions.viewDetails': 'View details',
      'labels.ticketCode': 'Ticket code',
      'labels.eventDate': 'Event date',
      'labels.location': 'Location',
      'labels.distance': 'Distance',
      'status.confirmed': 'Confirmed',
      'status.payment_pending': 'Payment pending',
      'status.cancelled': 'Cancelled',
      'status.started': 'Started',
      'status.submitted': 'Submitted',
      'status.expired': 'Expired',
    };

    return (key: string) => messages[key] ?? key;
  }),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/events/queries', () => ({
  getMyRegistrations: jest.fn(),
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

jest.mock('@/i18n/routing', () => ({
  DEFAULT_TIMEZONE: 'UTC',
}));

jest.mock('@/components/dashboard/my-registrations-subnav', () => ({
  MyRegistrationsSubnav: () => <div data-testid="my-registrations-subnav">subnav</div>,
}));

jest.mock('@/components/common/badge', () => ({
  Badge: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ asChild, children, ...props }: { asChild?: boolean; children: ReactNode }) =>
    asChild ? <>{children}</> : <button {...props}>{children}</button>,
}));

jest.mock('@/components/ui/surface', () => ({
  Surface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  InsetSurface: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

jest.mock('next/navigation', () => ({
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetMyRegistrations = getMyRegistrations as jest.MockedFunction<typeof getMyRegistrations>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

const basePermissions = {
  canAccessAdminArea: false,
  canAccessUserArea: true,
  canManageUsers: false,
  canManageEvents: false,
  canViewStaffTools: false,
  canViewOrganizersDashboard: false,
  canViewAthleteDashboard: true,
};

const buildAuthContext = ({
  canAccessUserArea,
  isInternal = false,
  canAccessAdminArea = false,
}: {
  canAccessUserArea: boolean;
  isInternal?: boolean;
  canAccessAdminArea?: boolean;
}) =>
  ({
    user: { id: 'user-1' },
    isInternal,
    permissions: {
      ...basePermissions,
      canAccessAdminArea,
      canAccessUserArea,
    },
  }) as Awaited<ReturnType<typeof getAuthContext>>;

describe('MyRegistrationsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(buildAuthContext({ canAccessUserArea: true }));
    mockGetMyRegistrations.mockResolvedValue([]);
  });

  it('redirects external users without user-area access back to the protected dashboard', async () => {
    mockGetAuthContext.mockResolvedValue(buildAuthContext({ canAccessUserArea: false }));

    await expect(
      MyRegistrationsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('REDIRECT:/en/dashboard');

    expect(mockGetMyRegistrations).not.toHaveBeenCalled();
  });

  it('redirects internal admin-area users to admin when they cannot access the user area', async () => {
    mockGetAuthContext.mockResolvedValue(
      buildAuthContext({ canAccessUserArea: false, isInternal: true, canAccessAdminArea: true }),
    );

    await expect(
      MyRegistrationsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    ).rejects.toThrow('REDIRECT:/en/admin');

    expect(mockGetMyRegistrations).not.toHaveBeenCalled();
  });

  it('renders the empty state when there are no registrations', async () => {
    const html = renderToStaticMarkup(
      await MyRegistrationsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({}),
      }),
    );

    expect(html).toContain('My registrations');
    expect(html).toContain('Upcoming');
    expect(html).toContain('No registrations yet');
    expect(html).toContain('Browse events to get started.');
    expect(html).toContain('href="/events"');
    expect(mockGetMyRegistrations).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ view: 'upcoming', now: expect.any(Date) }),
    );
  });

  it('renders registrations with the expected event and details links', async () => {
    mockGetMyRegistrations.mockResolvedValue([
      {
        id: 'reg-123',
        status: 'confirmed',
        createdAt: new Date('2026-02-01T10:00:00.000Z'),
        expiresAt: null,
        ticketCode: 'RGMX-00123',
        seriesName: 'Trail Series',
        seriesSlug: 'trail-series',
        editionLabel: '2026',
        editionSlug: '2026',
        startsAt: new Date('2026-03-21T07:30:00.000Z'),
        timezone: 'UTC',
        locationDisplay: 'Monterrey, NL',
        city: 'Monterrey',
        state: 'NL',
        distanceLabel: '21K',
      },
    ]);

    const html = renderToStaticMarkup(
      await MyRegistrationsPage({
        params: Promise.resolve({ locale: 'en' }),
        searchParams: Promise.resolve({ view: 'upcoming' }),
      }),
    );

    expect(html).toContain('Trail Series 2026');
    expect(html).toContain('Confirmed');
    expect(html).toContain('RGMX-00123');
    expect(html).toContain('href="/events/trail-series/2026"');
    expect(html).toContain('href="/dashboard/my-registrations/reg-123"');
    expect(html).toContain('View event');
    expect(html).toContain('View details');
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
