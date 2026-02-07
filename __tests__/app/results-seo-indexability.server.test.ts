jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/events/results/queries', () => ({
  listRecentPublicCorrectionSummaries: jest.fn(),
  listPublicOfficialResultsDirectory: jest.fn(),
  searchPublicOfficialResultEntries: jest.fn(),
}));

jest.mock('@/lib/auth/server', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/results': { es: '/resultados', en: '/results' },
      '/results/how-it-works': {
        es: '/resultados/como-funciona',
        en: '/results/how-it-works',
      },
      '/dashboard': { es: '/tablero', en: '/dashboard' },
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

import { generateMetadata as generateResultsMetadata } from '@/app/[locale]/(public)/results/page';
import { generateMetadata as generateHowItWorksMetadata } from '@/app/[locale]/(public)/results/how-it-works/page';
import { generateMetadata as generateDashboardMetadata } from '@/app/[locale]/(protected)/dashboard/page';

describe('results SEO indexability rules', () => {
  it('keeps public results index route canonicalized and indexable', async () => {
    const metadata = await generateResultsMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://example.com/resultados');
    expect(metadata.alternates?.languages?.en).toBe('https://example.com/en/results');
    expect(metadata.robots).toBeUndefined();
  });

  it('keeps explainer route canonicalized and indexable with locale alternates', async () => {
    const metadata = await generateHowItWorksMetadata({
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(metadata.alternates?.canonical).toBe('https://example.com/en/results/how-it-works');
    expect(metadata.alternates?.languages?.es).toBe('https://example.com/resultados/como-funciona');
    expect(metadata.robots).toBeUndefined();
  });

  it('keeps protected dashboard route non-indexable', async () => {
    const metadata = await generateDashboardMetadata({
      params: Promise.resolve({ locale: 'en' }),
    });

    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
