import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(async () => (key: string) => key),
}));

jest.mock('@/i18n/navigation', () => ({
  getPathname: jest.fn(({ href, locale }: { href: unknown; locale?: string }) => {
    if (typeof href === 'string') {
      if (href === '/sign-in') return locale === 'en' ? '/en/sign-in' : '/iniciar-sesion';
      if (href === '/sign-up') return locale === 'en' ? '/en/sign-up' : '/crear-cuenta';
      return href;
    }

    if (href && typeof href === 'object' && 'pathname' in href) {
      const pathname = (href as { pathname?: string }).pathname;
      if (pathname === '/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]') {
        return locale === 'en'
          ? '/en/events/sierra/2026/claim/abc'
          : '/eventos/sierra/2026/reclamar/abc';
      }
    }

    return '/unexpected';
  }),
}));

import { ClaimLoginRequired } from '@/app/[locale]/(public)/events/[seriesSlug]/[editionSlug]/claim/[inviteToken]/login-required';

describe('ClaimLoginRequired callback URLs', () => {
  it('preserves locale prefix in callbackURL for /en/* claim login-required', async () => {
    const element = await ClaimLoginRequired({
      locale: 'en',
      seriesSlug: 'sierra',
      editionSlug: '2026',
      inviteToken: 'abc',
      eventName: 'Sierra Madre Sky Trail 2026',
    });

    const html = renderToStaticMarkup(element as never);
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/g)).map((match) =>
      match[1].replace(/&amp;/g, '&'),
    );
    const href = hrefs.find((value) => value.startsWith('/en/sign-in?'));
    if (!href) {
      throw new Error('Expected a sign-in link to include /en/sign-in?callbackURL=...');
    }

    const url = new URL(href, 'https://example.com');
    expect(url.searchParams.get('callbackURL')).toBe('/en/events/sierra/2026/claim/abc');
  });
});
