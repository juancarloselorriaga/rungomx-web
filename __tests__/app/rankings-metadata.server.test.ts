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
  getPublicRankingLeaderboard: jest.fn(),
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
import { getMetadataMessages } from '@/utils/staticMessages';

describe('rankings page metadata', () => {
  it('uses rankings-specific metadata while preserving localized canonical and alternates', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });
    const messages = getMetadataMessages('es');

    expect(metadata.title).toBe(messages.Pages.Rankings.metadata.title);
    expect(metadata.description).toBe(messages.Pages.Rankings.metadata.description);
    expect(metadata.openGraph?.title).toBe(messages.Pages.Rankings.metadata.openGraph.title);
    expect(metadata.title).not.toBe(messages.Pages.Results.metadata.title);
    expect(metadata.description).not.toBe(messages.Pages.Results.metadata.description);
    expect(metadata.alternates?.canonical).toBe('https://example.com/clasificaciones');
    expect(metadata.alternates?.languages?.en).toBe('https://example.com/en/rankings');
    expect(metadata.robots).toBeUndefined();
  });
});
