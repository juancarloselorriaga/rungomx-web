import ClaimPage from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]/page';
import { getAuthContext } from '@/lib/auth/server';
import { getClaimPageContextByToken } from '@/lib/events/invite-claim/queries';
import { notFound, redirect } from 'next/navigation';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(async () => undefined),
}));

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(
    ({
      href,
      locale,
    }: {
      href:
        | string
        | {
            pathname: string;
            params?: Record<string, string>;
          };
      locale: string;
    }) => {
      if (typeof href === 'string') return `/${locale}${href}`;
      let path = href.pathname;
      for (const [key, value] of Object.entries(href.params ?? {})) {
        path = path.replace(`[${key}]`, value);
      }
      return `/${locale}${path}`;
    },
  ),
}));

jest.mock('@/lib/auth/server', () => ({
  getAuthContext: jest.fn(),
}));

jest.mock('@/lib/events/invite-claim/queries', () => ({
  getClaimPageContextByToken: jest.fn(),
}));

jest.mock('@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]/claim-card', () => ({
  ClaimInviteCard: () => <div>claim-card</div>,
}));

jest.mock(
  '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]/login-required',
  () => ({
    ClaimLoginRequired: () => <div>claim-login-required</div>,
  }),
);

jest.mock('next/navigation', () => ({
  notFound: jest.fn(() => {
    throw new Error('NOT_FOUND');
  }),
  redirect: jest.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

const mockGetAuthContext = getAuthContext as jest.MockedFunction<typeof getAuthContext>;
const mockGetClaimPageContextByToken =
  getClaimPageContextByToken as jest.MockedFunction<typeof getClaimPageContextByToken>;
const mockNotFound = notFound as jest.MockedFunction<typeof notFound>;
const mockRedirect = redirect as jest.MockedFunction<typeof redirect>;

describe('claim invite page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders invalid-token status messaging instead of 404 when token is missing', async () => {
    mockGetAuthContext.mockResolvedValue({
      session: null,
      user: null,
    } as Awaited<ReturnType<typeof getAuthContext>>);
    mockGetClaimPageContextByToken.mockResolvedValue({
      status: 'INVALID',
      event: null,
    });

    const page = await ClaimPage({
      params: Promise.resolve({
        locale: 'en' as const,
        seriesSlug: 'sierra-madre-sky-trail',
        editionSlug: '2026',
        inviteToken: 'missing-token',
      }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('status.INVALID.title');
    expect(html).toContain('status.INVALID.description');
    expect(mockNotFound).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('renders login-required guard for active invites when user is unauthenticated', async () => {
    mockGetAuthContext.mockResolvedValue({
      session: null,
      user: null,
    } as Awaited<ReturnType<typeof getAuthContext>>);
    mockGetClaimPageContextByToken.mockResolvedValue({
      status: 'ACTIVE',
      event: {
        seriesSlug: 'sierra-madre-sky-trail',
        seriesName: 'Sierra Madre Sky Trail',
        editionSlug: '2026',
        editionLabel: '2026',
        distanceLabel: '50K',
      },
    });

    const page = await ClaimPage({
      params: Promise.resolve({
        locale: 'en' as const,
        seriesSlug: 'sierra-madre-sky-trail',
        editionSlug: '2026',
        inviteToken: 'active-token',
      }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('claim-login-required');
    expect(mockNotFound).not.toHaveBeenCalled();
  });
});
