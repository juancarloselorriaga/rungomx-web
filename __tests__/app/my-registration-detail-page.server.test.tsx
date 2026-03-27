import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import MyRegistrationDetailPage from '@/app/[locale]/(protected)/dashboard/my-registrations/[registrationId]/page';
import { getAuthContext } from '@/lib/auth/server';
import { getMyRegistrationDetail } from '@/lib/events/queries';
import { formatRegistrationTicketCode } from '@/lib/events/tickets';
import { notFound, redirect } from 'next/navigation';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('@/utils/seo', () => ({
  createLocalizedPageMetadata: jest.fn(async () => ({})),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/events/queries', () => ({
  getMyRegistrationDetail: jest.fn(),
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
        };
    children: ReactNode;
  }) => {
    const resolvedHref =
      typeof href === 'string'
        ? href
        : Object.entries(href.params ?? {}).reduce(
            (pathname, [key, value]) => pathname.replace(`[${key}]`, value),
            href.pathname,
          );

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

jest.mock('@/components/dashboard/registration-ticket-status', () => ({
  RegistrationTicketStatus: jest.fn(({ initialStatus }: { initialStatus: string }) => (
    <div data-testid="registration-ticket-status">status:{initialStatus}</div>
  )),
}));

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({
    alt,
    src,
    unoptimized,
    ...props
  }: {
    alt: string;
    src: string;
    unoptimized?: boolean;
  }) => {
    void unoptimized;

    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img alt={alt} src={src} {...props} />
    );
  },
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
  notFound: jest.fn(() => {
    throw new Error('NOT_FOUND');
  }),
}));

const mockRegistrationTicketStatus = jest.mocked(
  jest.requireMock('@/components/dashboard/registration-ticket-status').RegistrationTicketStatus,
);
const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetMyRegistrationDetail = getMyRegistrationDetail as jest.MockedFunction<
  typeof getMyRegistrationDetail
>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;
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

const buildParams = (registrationId: string) =>
  Promise.resolve({ locale: 'en' as const, registrationId });

const buildDetail = () => ({
  registration: {
    id: 'reg-123',
    status: 'started',
    statusKey: 'expired' as const,
    createdAt: new Date('2026-02-01T10:00:00.000Z'),
    expiresAt: new Date('2026-02-01T11:00:00.000Z'),
    basePriceCents: 120000,
    feesCents: 5000,
    taxCents: 0,
    totalCents: 125000,
  },
  event: {
    seriesName: 'Trail Series',
    seriesSlug: 'trail-series',
    editionLabel: '2026',
    editionSlug: '2026',
    startsAt: new Date('2026-03-21T07:30:00.000Z'),
    endsAt: null,
    timezone: 'UTC',
    locationDisplay: 'Monterrey, NL',
    address: 'Parque Fundidora',
    city: 'Monterrey',
    state: 'NL',
    country: 'MX',
    externalUrl: 'https://example.com/event',
  },
  distance: {
    id: 'distance-1',
    label: '21K',
  },
  registrant: {
    profileSnapshot: {
      firstName: 'Ana',
      lastName: 'Gomez',
      email: 'ana@example.com',
    },
  },
  waiverAcceptances: [
    {
      title: 'Event waiver',
      acceptedAt: new Date('2026-02-01T10:05:00.000Z'),
      signatureType: 'checkbox',
    },
  ],
});

describe('MyRegistrationDetailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(buildAuthContext({ canAccessUserArea: true }));
    mockGetMyRegistrationDetail.mockResolvedValue(buildDetail());
  });

  it('redirects external users without user-area access back to the protected dashboard', async () => {
    mockGetAuthContext.mockResolvedValue(buildAuthContext({ canAccessUserArea: false }));

    await expect(
      MyRegistrationDetailPage({
        params: buildParams('reg-123'),
      }),
    ).rejects.toThrow('REDIRECT:/en/dashboard');

    expect(mockGetMyRegistrationDetail).not.toHaveBeenCalled();
  });

  it('redirects internal admin-area users to admin when they cannot access the user area', async () => {
    mockGetAuthContext.mockResolvedValue(
      buildAuthContext({ canAccessUserArea: false, isInternal: true, canAccessAdminArea: true }),
    );

    await expect(
      MyRegistrationDetailPage({
        params: buildParams('reg-123'),
      }),
    ).rejects.toThrow('REDIRECT:/en/admin');

    expect(mockGetMyRegistrationDetail).not.toHaveBeenCalled();
  });

  it('calls notFound when the registration is missing', async () => {
    mockGetMyRegistrationDetail.mockResolvedValue(null);

    await expect(
      MyRegistrationDetailPage({
        params: buildParams('missing-reg'),
      }),
    ).rejects.toThrow('NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });

  it('renders the detail page and passes the normalized status contract to RegistrationTicketStatus', async () => {
    const html = renderToStaticMarkup(
      await MyRegistrationDetailPage({
        params: buildParams('reg-123'),
      }),
    );

    expect(html).toContain('Trail Series 2026');
    expect(html).toContain('Monterrey, NL');
    expect(html).toContain('21K');
    expect(html).toContain('status:expired');
    expect(mockRegistrationTicketStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        registrationId: 'reg-123',
        initialStatus: 'expired',
        ticketCode: formatRegistrationTicketCode('reg-123'),
        statusLabels: {
          confirmed: 'status.confirmed',
          payment_pending: 'status.payment_pending',
          cancelled: 'status.cancelled',
          started: 'status.started',
          submitted: 'status.submitted',
          expired: 'status.expired',
        },
      }),
      undefined,
    );
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
