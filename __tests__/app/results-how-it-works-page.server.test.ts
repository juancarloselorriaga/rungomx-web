import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('@/config/url', () => ({
  siteUrl: 'https://example.com',
}));

jest.mock('@/utils/config-page-locale', () => ({
  configPageLocale: jest.fn(),
}));

jest.mock('@/i18n/routing', () => {
  const routing = {
    locales: ['es', 'en'] as const,
    defaultLocale: 'es',
    localePrefix: 'as-needed' as const,
    pathnames: {
      '/results/how-it-works': {
        es: '/resultados/como-funciona',
        en: '/results/how-it-works',
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
  getTranslations: async () => (key: string) => key,
  setRequestLocale: jest.fn(),
}));

jest.mock('@/i18n/navigation', () => ({
  Link: ({ children }: { children: unknown }) => children,
}));

import ResultsHowItWorksPage, {
  generateMetadata,
} from '@/app/[locale]/(public)/results/how-it-works/page';

describe('results how-it-works page', () => {
  it('generates canonical localized metadata for explainer route', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'es' }),
    });

    expect(metadata.alternates?.canonical).toContain('/resultados/como-funciona');
  });

  it('renders explainer sections with localized keys', async () => {
    const page = await ResultsHowItWorksPage({
      params: Promise.resolve({ locale: 'en' }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain('title');
    expect(html).toContain('officialMeaning.title');
    expect(html).toContain('correctionProcess.title');
    expect(html).toContain('rankingsRules.title');
  });
});
