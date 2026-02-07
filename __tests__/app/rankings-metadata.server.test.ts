jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/events/results/rankings', () => ({
  getPublicNationalRankingLeaderboard: jest.fn(),
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/rankings': {
        es: '/clasificaciones',
        en: '/rankings',
      },
    },
  };

  type AppLocale = (typeof routing)['locales'][number];

  return {
    __esModule: true,
    routing,
    DEFAULT_TIMEZONE: 'America/Mexico_City',
    AppLocale: undefined as unknown as AppLocale,
  };
});

jest.mock('next-intl/server', () => ({
  getTranslations: jest.fn(),
  setRequestLocale: jest.fn(),
}));

import { generateMetadata } from '@/app/[locale]/(public)/rankings/page';

describe('rankings page metadata', () => {
  it('generates localized canonical and alternates for rankings route', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://example.com/clasificaciones');
    expect(metadata.alternates?.languages?.en).toBe('https://example.com/en/rankings');
    expect(metadata.robots).toBeUndefined();
  });
});
